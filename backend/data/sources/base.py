"""Pluggable price-data source interface.

The rest of the data layer depends only on this abstract interface, so the
concrete provider (yfinance today, a paid real-time feed later) can be swapped
without touching fetch/cache logic.
"""
from __future__ import annotations

from abc import ABC, abstractmethod

import pandas as pd


class DataFetchError(Exception):
    """Raised when a source cannot return usable data for a ticker.

    Callers that iterate over many tickers catch this to log-and-skip rather
    than crash.
    """


class PriceDataSource(ABC):
    """A provider of historical prices, latest quotes, and classification metadata."""

    #: Short identifier for logging (e.g. "yfinance").
    name: str = "base"

    @abstractmethod
    def get_history(self, ticker: str, period: str = "5y") -> pd.DataFrame:
        """Return a date-indexed DataFrame with a single ``adj_close`` column.

        The index must be a tz-naive ``DatetimeIndex`` named ``date``, sorted
        ascending. Must raise :class:`DataFetchError` on a bad symbol / no data.
        """

    @abstractmethod
    def get_latest_quote(self, ticker: str) -> dict:
        """Return the most recent price for ``ticker``.

        Shape: ``{"ticker", "price", "currency", "timestamp"}`` where
        ``timestamp`` is an ISO-8601 UTC string. Raises :class:`DataFetchError`
        if no price is available.
        """

    @abstractmethod
    def get_metadata(self, ticker: str) -> dict:
        """Return classification metadata for ``ticker``.

        Shape: ``{"ticker", "name", "sector", "industry", "quote_type",
        "exchange", "currency"}``. Fields that the source cannot supply (common
        for ETFs, which often lack sector/industry) should be ``None`` rather
        than missing.
        """
