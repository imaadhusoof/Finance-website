"""Price-data source implementations and the default factory."""
from __future__ import annotations

from .base import DataFetchError, PriceDataSource
from .yfinance_source import YFinanceSource


def default_source() -> PriceDataSource:
    """Return the default data source used across the app."""
    return YFinanceSource()


__all__ = ["PriceDataSource", "DataFetchError", "YFinanceSource", "default_source"]
