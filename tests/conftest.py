import os
import tempfile

import numpy as np
import pandas as pd
import pytest

# Point the cache at a throwaway directory before the backend is imported, so
# tests never read or write the real data_cache/.
os.environ.setdefault("OPTIONS_PRICER_CACHE_DIR", tempfile.mkdtemp(prefix="pb-test-cache-"))

from backend import recommendation  # noqa: E402

# Synthetic assets: (annual drift, annual volatility, sector). Real universe
# tickers so they pass request validation, but the prices are made up.
SYNTHETIC_ASSETS = {
    "BND": (0.03, 0.05, None),
    "TLT": (0.035, 0.12, None),
    "VTI": (0.08, 0.17, None),
    "AAPL": (0.14, 0.28, "Technology"),
    "MSFT": (0.13, 0.26, "Technology"),
    "XOM": (0.07, 0.25, "Energy"),
    "GLD": (0.05, 0.15, None),
}


def make_prices(days: int = 1000, seed: int = 7) -> pd.DataFrame:
    """Geometric random-walk adjusted closes for every synthetic asset."""
    rng = np.random.default_rng(seed)
    index = pd.bdate_range("2021-01-04", periods=days, name="date")
    columns = {}
    for ticker, (drift, vol, _) in SYNTHETIC_ASSETS.items():
        daily = rng.normal(drift / 252, vol / np.sqrt(252), days)
        columns[ticker] = 100 * np.exp(np.cumsum(daily))
    return pd.DataFrame(columns, index=index)


@pytest.fixture
def synthetic_market(monkeypatch):
    """Serve synthetic prices and metadata to the recommendation engine."""
    prices = make_prices()

    def load_price_matrix(tickers, **_):
        tickers = list(tickers)
        return prices[[t for t in tickers if t in prices.columns]], []

    def load_metadata_table(tickers, **_):
        rows = {
            t: {"name": f"{t} Inc.", "sector": SYNTHETIC_ASSETS[t][2]}
            for t in tickers
            if t in SYNTHETIC_ASSETS
        }
        return pd.DataFrame.from_dict(rows, orient="index")

    monkeypatch.setattr(recommendation.cache, "load_price_matrix", load_price_matrix)
    monkeypatch.setattr(recommendation.cache, "load_metadata_table", load_metadata_table)
    return prices
