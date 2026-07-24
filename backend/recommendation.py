"""SEAM: the portfolio recommendation endpoint — intentionally NOT implemented.

This is the single place where your algorithm plugs into the app. The data
layer below it is complete (cached prices + sector metadata); everything
quantitative above it is yours: expected returns, volatility, correlation,
covariance, filtering, optimization, Monte Carlo.

To wire it up, replace the body of :func:`recommend` with your own logic. The
raw inputs you need are one import away::

    from .data import cache

    prices, skipped = cache.load_price_matrix(request.tickers)   # wide DataFrame
    meta = cache.load_metadata_table(request.tickers)            # sector/industry

The frontend already renders whatever you return, as long as it matches
:class:`RecommendationResponse` below. Until then the endpoint returns
501 Not Implemented and the UI shows a "plug your algorithm in here" state.
"""
from __future__ import annotations

from typing import Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api", tags=["recommendation"])


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


class RecommendationResponse(BaseModel):
    """The shape the frontend expects back.

    ``metrics`` is a free-form label -> value map so you can surface whatever
    your model produces (expected return, volatility, Sharpe, ...) without this
    module needing to know what any of them mean.
    """

    holdings: list[Holding]
    metrics: dict[str, float] = Field(default_factory=dict)
    notes: Optional[str] = None


@router.post("/recommend", response_model=RecommendationResponse)
def recommend(request: PortfolioRequest) -> RecommendationResponse:
    """Return a recommended portfolio for ``request``.

    NOT IMPLEMENTED BY DESIGN — this is your algorithm's home.
    """
    raise HTTPException(
        status_code=501,
        detail=(
            "Recommendation algorithm not implemented. This endpoint is the seam "
            "for your own portfolio math — implement `recommend()` in "
            "backend/recommendation.py. Raw cached prices and sector metadata are "
            "available via backend.data.cache."
        ),
    )
