"""The portfolio recommendation algorithm.

This is the one place in the app where financial math lives. The data layer
below it (``backend.data.cache``) is a pure raw-data cache; everything
quantitative — expected returns, covariance, optimization, simulation — happens
here.

The method, end to end:

1. Resolve the investable universe, drop excluded sectors and anything without
   enough price history.
2. From 5y of daily adjusted closes, estimate annualized expected returns and
   the covariance matrix (the two inputs Markowitz needs).
3. Solve a long-only **mean-variance optimization** (Markowitz, 1952): pick the
   weights that maximize ``wᵀμ − ½·λ·wᵀΣw``. The risk-aversion λ is set by the
   caller's risk tolerance, so "conservative" lands lower on the efficient
   frontier than "aggressive." A per-name cap keeps the result diversified.
4. Project the chosen portfolio forward over the horizon with a **Monte Carlo**
   simulation (geometric Brownian motion), returning a p10/p50/p90 fan the
   frontend charts.

Everything the UI needs comes back in :class:`RecommendationResponse`.
"""
from __future__ import annotations

import logging
import math
from typing import Literal, Optional

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from scipy.optimize import minimize

from .data import cache
from .data.populate_cache import STARTER_TICKERS

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["recommendation"])

# --------------------------------------------------------------------------
# Model constants
# --------------------------------------------------------------------------
TRADING_DAYS = 252
#: Assumed annual risk-free rate, used only for the Sharpe ratio.
RISK_FREE_RATE = 0.042
#: Largest weight any single asset may take, so no one name dominates.
MAX_WEIGHT = 0.25
#: Minimum daily observations a ticker needs to earn a spot in the estimate.
MIN_OBSERVATIONS = 252
#: Monte Carlo sample paths.
SIM_PATHS = 6000
#: Shrinkage intensity for expected returns (0=raw sample mean, 1=all grand
#: mean). Sample means are extremely noisy; pulling them toward the cross-
#: sectional average is the standard defense against MVO "error maximization".
MEAN_SHRINKAGE = 0.4
#: Shrinkage intensity for the covariance matrix toward its diagonal. Damps
#: spurious sample correlations that would otherwise drive extreme long/short-
#: like tilts (Ledoit-Wolf-style regularization, fixed intensity here).
COV_SHRINKAGE = 0.2
#: Risk-aversion λ per risk tolerance. Higher λ penalizes variance harder,
#: pushing the optimizer toward lower-volatility (bond-heavy) allocations.
RISK_AVERSION = {
    "conservative": 28.0,
    "balanced": 9.0,
    "aggressive": 3.0,
}


# --------------------------------------------------------------------------
# Request / response contract
# --------------------------------------------------------------------------
class PortfolioRequest(BaseModel):
    """What the frontend's setup form sends."""

    amount: float = Field(10000, gt=0, description="Amount to invest.")
    risk_tolerance: Literal["conservative", "balanced", "aggressive"] = "balanced"
    horizon_years: int = Field(10, ge=1, le=50)
    tickers: Optional[list[str]] = Field(
        None, description="Universe to consider. Defaults to the cached starter set."
    )
    excluded_sectors: list[str] = Field(default_factory=list)


class Holding(BaseModel):
    """One position in the recommended portfolio."""

    ticker: str
    weight: float = Field(description="Portfolio weight, 0..1")
    amount: Optional[float] = None
    name: Optional[str] = None
    sector: Optional[str] = None
    expected_return: Optional[float] = Field(
        None, description="This asset's own annualized expected return."
    )
    volatility: Optional[float] = Field(
        None, description="This asset's own annualized volatility."
    )


class Projection(BaseModel):
    """Monte Carlo fan chart: portfolio value over the horizon.

    Each list is indexed by ``years``; values are simulated portfolio dollar
    values at the 10th / 25th / 50th / 75th / 90th percentiles.
    """

    years: list[float]
    p10: list[float]
    p25: list[float]
    p50: list[float]
    p75: list[float]
    p90: list[float]


class RecommendationResponse(BaseModel):
    """Everything the frontend renders for one recommendation."""

    holdings: list[Holding]
    metrics: dict[str, float] = Field(default_factory=dict)
    projection: Optional[Projection] = None
    notes: Optional[str] = None
    skipped: list[str] = Field(default_factory=list)


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------
def _clean_str(value: object) -> Optional[str]:
    """Coerce a metadata cell to a clean string or None.

    Missing values arrive from pandas as NaN (a float), which Pydantic rejects
    for a string field — normalize those (and empty strings) to None.
    """
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    text = str(value).strip()
    return text or None


# --------------------------------------------------------------------------
# The math
# --------------------------------------------------------------------------
def _annualized_estimates(
    returns: np.ndarray,
) -> tuple[np.ndarray, np.ndarray]:
    """Return (annualized mean vector, annualized covariance matrix), shrunk.

    ``returns`` is a (days, assets) matrix of daily simple returns.

    Both estimates are regularized before they reach the optimizer, because
    naive mean-variance optimization is exquisitely sensitive to estimation
    error — it treats the noisiest, highest sample-return asset as a sure thing
    and concentrates in it. Two linear shrinkage steps blunt that:

    * **Means** are pulled toward the cross-sectional average (James-Stein
      intuition: individual sample means are unreliable; the group average is a
      better prior).
    * **Covariance** is pulled toward its diagonal, shrinking off-diagonal
      sample correlations that are mostly noise on ~1250 observations.
    """
    mu = returns.mean(axis=0) * TRADING_DAYS
    cov = np.atleast_2d(np.cov(returns, rowvar=False) * TRADING_DAYS)

    # Shrink means toward the grand mean.
    grand_mean = mu.mean()
    mu = (1.0 - MEAN_SHRINKAGE) * mu + MEAN_SHRINKAGE * grand_mean

    # Shrink covariance toward its diagonal (keep variances, damp correlations).
    diagonal = np.diag(np.diag(cov))
    cov = (1.0 - COV_SHRINKAGE) * cov + COV_SHRINKAGE * diagonal

    return mu, cov


def _optimize_weights(
    mu: np.ndarray, cov: np.ndarray, risk_aversion: float
) -> np.ndarray:
    """Long-only mean-variance weights maximizing utility ``wᵀμ − ½λ·wᵀΣw``.

    Constraints: weights ≥ 0, sum to 1, each ≤ ``MAX_WEIGHT``. Solved with SLSQP
    from an equal-weight start.
    """
    n = len(mu)
    if n == 1:
        return np.array([1.0])

    def neg_utility(w: np.ndarray) -> float:
        return -(w @ mu - 0.5 * risk_aversion * w @ cov @ w)

    def neg_utility_grad(w: np.ndarray) -> np.ndarray:
        return -(mu - risk_aversion * cov @ w)

    # A single name can't always respect MAX_WEIGHT (n may be small); relax the
    # cap just enough that a feasible point exists.
    cap = max(MAX_WEIGHT, 1.0 / n + 1e-9)
    constraints = [{"type": "eq", "fun": lambda w: w.sum() - 1.0}]
    bounds = [(0.0, cap)] * n
    w0 = np.full(n, 1.0 / n)

    result = minimize(
        neg_utility,
        w0,
        jac=neg_utility_grad,
        method="SLSQP",
        bounds=bounds,
        constraints=constraints,
        options={"maxiter": 500, "ftol": 1e-9},
    )
    w = result.x if result.success else w0
    # Clean up tiny negatives / renormalize against float error.
    w = np.clip(w, 0.0, None)
    total = w.sum()
    return w / total if total > 0 else w0


def _monte_carlo(
    amount: float,
    exp_return: float,
    volatility: float,
    horizon_years: int,
    paths: int = SIM_PATHS,
) -> Projection:
    """Simulate portfolio value via geometric Brownian motion.

    Monthly steps; annualized drift/vol converted to per-step. Returns the
    percentile bands across ``paths`` sample trajectories.
    """
    steps = max(1, horizon_years * 12)
    dt = 1.0 / 12.0
    rng = np.random.default_rng(42)  # deterministic so re-runs match the UI

    drift = (exp_return - 0.5 * volatility**2) * dt
    shock = volatility * math.sqrt(dt)
    increments = drift + shock * rng.standard_normal((paths, steps))
    # Cumulative log-returns -> value paths, seeded at `amount`.
    log_paths = np.cumsum(increments, axis=1)
    values = amount * np.exp(log_paths)
    # Prepend the starting value (year 0).
    values = np.hstack([np.full((paths, 1), amount), values])

    pct = np.percentile(values, [10, 25, 50, 75, 90], axis=0)
    years = [round(i * dt, 4) for i in range(steps + 1)]
    return Projection(
        years=years,
        p10=pct[0].round(2).tolist(),
        p25=pct[1].round(2).tolist(),
        p50=pct[2].round(2).tolist(),
        p75=pct[3].round(2).tolist(),
        p90=pct[4].round(2).tolist(),
    )


# --------------------------------------------------------------------------
# Endpoint
# --------------------------------------------------------------------------
@router.post("/recommend", response_model=RecommendationResponse)
def recommend(request: PortfolioRequest) -> RecommendationResponse:
    """Return a mean-variance optimal portfolio for ``request``."""
    universe = request.tickers or STARTER_TICKERS

    # 1. Metadata -> apply sector exclusions.
    meta = cache.load_metadata_table(universe)
    excluded = {s.lower() for s in request.excluded_sectors}
    if excluded and not meta.empty and "sector" in meta.columns:
        keep = [
            t
            for t in universe
            if (meta.loc[t, "sector"] if t in meta.index else None) is None
            or str(meta.loc[t, "sector"]).lower() not in excluded
        ]
    else:
        keep = list(universe)

    if not keep:
        raise HTTPException(
            status_code=422,
            detail="Every asset in the universe was excluded. Loosen your sector filters.",
        )

    # 2. Prices -> daily returns, keeping only assets with enough history.
    prices, skipped = cache.load_price_matrix(keep)
    if prices.empty:
        raise HTTPException(
            status_code=503,
            detail="No cached price history available. Warm the cache first "
            "(python -m backend.data.populate_cache).",
        )

    prices = prices.dropna(axis=1, thresh=MIN_OBSERVATIONS).ffill().dropna()
    thin = [t for t in keep if t not in prices.columns and t not in skipped]
    skipped = skipped + thin

    tickers = list(prices.columns)
    if len(tickers) < 2:
        raise HTTPException(
            status_code=422,
            detail="Need at least two assets with sufficient history to build a "
            "portfolio. Broaden the universe or refresh the cache.",
        )

    returns = prices.pct_change().dropna().to_numpy()
    mu, cov = _annualized_estimates(returns)

    # 3. Mean-variance optimization.
    lam = RISK_AVERSION[request.risk_tolerance]
    weights = _optimize_weights(mu, cov, lam)

    # Drop dust positions (<0.5%) and renormalize for a clean allocation.
    weights = np.where(weights < 0.005, 0.0, weights)
    weights = weights / weights.sum()

    port_return = float(weights @ mu)
    port_var = float(weights @ cov @ weights)
    port_vol = math.sqrt(max(port_var, 0.0))
    sharpe = (port_return - RISK_FREE_RATE) / port_vol if port_vol > 0 else 0.0

    # 4. Build holdings (skip zero-weight names).
    asset_vol = np.sqrt(np.clip(np.diag(cov), 0.0, None))
    holdings: list[Holding] = []
    for i, ticker in enumerate(tickers):
        w = float(weights[i])
        if w <= 0:
            continue
        row = meta.loc[ticker] if ticker in meta.index else None
        holdings.append(
            Holding(
                ticker=ticker,
                weight=w,
                amount=round(w * request.amount, 2),
                name=_clean_str(row.get("name")) if row is not None else None,
                sector=_clean_str(row.get("sector")) if row is not None else None,
                expected_return=round(float(mu[i]), 4),
                volatility=round(float(asset_vol[i]), 4),
            )
        )
    holdings.sort(key=lambda h: h.weight, reverse=True)

    # 5. Monte Carlo projection.
    projection = _monte_carlo(
        request.amount, port_return, port_vol, request.horizon_years
    )
    median_end = projection.p50[-1]
    p10_end = projection.p10[-1]
    p90_end = projection.p90[-1]

    metrics = {
        "expected_return": round(port_return, 4),
        "volatility": round(port_vol, 4),
        "sharpe": round(sharpe, 2),
        "median_end_value": round(median_end, 2),
        "p10_end_value": round(p10_end, 2),
        "p90_end_value": round(p90_end, 2),
    }

    notes = (
        f"Mean-variance optimal allocation across {len(holdings)} of "
        f"{len(tickers)} eligible assets, tuned for a {request.risk_tolerance} "
        f"risk profile. Estimates use {len(returns)} trading days of history. "
        f"Over {request.horizon_years} years, a ${request.amount:,.0f} investment "
        f"projects to a median of ${median_end:,.0f} "
        f"(10th–90th percentile: ${p10_end:,.0f}–${p90_end:,.0f}). "
        "Projections assume returns are normally distributed and stationary — a "
        "simplification, not a guarantee."
    )

    return RecommendationResponse(
        holdings=holdings,
        metrics=metrics,
        projection=projection,
        notes=notes,
        skipped=skipped,
    )
