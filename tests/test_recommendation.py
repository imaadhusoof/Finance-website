import numpy as np
import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from backend.recommendation import (
    MAX_WEIGHT,
    PortfolioRequest,
    _monte_carlo,
    _optimize_weights,
    recommend,
)
from tests.conftest import SYNTHETIC_ASSETS

TICKERS = list(SYNTHETIC_ASSETS)


def build(risk: str = "balanced", **overrides):
    request = PortfolioRequest(
        amount=10_000, risk_tolerance=risk, horizon_years=10, tickers=TICKERS, **overrides
    )
    return recommend(request)


def test_weights_are_a_valid_long_only_portfolio(synthetic_market):
    result = build()
    weights = [h.weight for h in result.holdings]

    assert sum(weights) == pytest.approx(1.0)
    assert all(w > 0 for w in weights)
    assert all(w <= MAX_WEIGHT + 1e-6 for w in weights)
    # Dollar amounts follow the weights
    assert sum(h.amount for h in result.holdings) == pytest.approx(10_000, abs=0.05)


def test_higher_risk_tolerance_takes_more_risk_for_more_return(synthetic_market):
    conservative = build("conservative").metrics
    balanced = build("balanced").metrics
    aggressive = build("aggressive").metrics

    assert conservative["volatility"] <= balanced["volatility"] <= aggressive["volatility"]
    assert conservative["expected_return"] <= aggressive["expected_return"]


def test_excluded_sectors_are_left_out(synthetic_market):
    result = build(excluded_sectors=["technology"])
    held = {h.ticker for h in result.holdings}

    assert not held & {"AAPL", "MSFT"}
    assert held


def test_excluding_everything_is_a_client_error(synthetic_market):
    request = PortfolioRequest(tickers=["AAPL", "MSFT"], excluded_sectors=["Technology"])
    with pytest.raises(HTTPException) as err:
        recommend(request)
    assert err.value.status_code == 422


def test_projection_fan_is_ordered_and_starts_at_the_amount(synthetic_market):
    projection = build().projection

    assert len(projection.years) == 10 * 12 + 1
    assert projection.p50[0] == pytest.approx(10_000)
    for bands in zip(projection.p10, projection.p25, projection.p50, projection.p75, projection.p90):
        assert list(bands) == sorted(bands)


def test_same_request_gives_the_same_answer(synthetic_market):
    assert build().model_dump() == build().model_dump()


def test_monte_carlo_with_no_volatility_grows_at_the_drift():
    projection = _monte_carlo(1_000, exp_return=0.05, volatility=0.0, horizon_years=4)
    assert projection.p10[-1] == pytest.approx(projection.p90[-1])
    assert projection.p50[-1] == pytest.approx(1_000 * np.exp(0.05 * 4), abs=0.01)  # values are rounded to cents


def test_weight_cap_is_relaxed_when_there_are_too_few_assets():
    mu = np.array([0.05, 0.06, 0.07])
    cov = np.diag([0.01, 0.02, 0.03])
    weights = _optimize_weights(mu, cov, risk_aversion=5.0)

    # Three assets can't each stay under a 25% cap and still sum to 1
    assert weights.sum() == pytest.approx(1.0)
    assert weights.max() <= 1 / 3 + 1e-6


def test_request_tickers_are_normalised():
    request = PortfolioRequest(tickers=[" vti", "VTI", "bnd "])
    assert request.tickers == ["VTI", "BND"]


def test_request_rejects_tickers_outside_the_universe():
    with pytest.raises(ValidationError, match="TSLA"):
        PortfolioRequest(tickers=["VTI", "TSLA"])
