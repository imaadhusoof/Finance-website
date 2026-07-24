"""Network fetch layer.

Thin orchestration over a :class:`PriceDataSource`. These functions talk to the
upstream provider and know nothing about disk/caching (that lives in
``cache.py``). Single-ticker helpers raise :class:`DataFetchError` on failure;
the batch helper logs-and-skips so one bad symbol never aborts the run.
"""
from __future__ import annotations

import logging
from typing import Iterable, Optional

import pandas as pd

from .sources import DataFetchError, PriceDataSource, default_source

logger = logging.getLogger(__name__)


def _resolve(source: Optional[PriceDataSource]) -> PriceDataSource:
    return source or default_source()


def fetch_history(
    ticker: str,
    source: Optional[PriceDataSource] = None,
    period: str = "5y",
) -> pd.DataFrame:
    """Fetch adjusted-close history for one ticker. Raises DataFetchError."""
    return _resolve(source).get_history(ticker, period=period)


def fetch_metadata(
    ticker: str, source: Optional[PriceDataSource] = None
) -> dict:
    """Fetch sector/industry/name metadata for one ticker."""
    return _resolve(source).get_metadata(ticker)


def fetch_latest_quote(
    ticker: str, source: Optional[PriceDataSource] = None
) -> dict:
    """Fetch the latest quote for one ticker. Raises DataFetchError."""
    return _resolve(source).get_latest_quote(ticker)


def fetch_history_many(
    tickers: Iterable[str],
    source: Optional[PriceDataSource] = None,
    period: str = "5y",
) -> tuple[dict[str, pd.DataFrame], list[str]]:
    """Fetch history for many tickers, skipping (and logging) failures.

    Returns ``(results, skipped)`` where ``results`` maps ticker -> DataFrame
    for the successful fetches and ``skipped`` lists the tickers that failed.
    """
    src = _resolve(source)
    results: dict[str, pd.DataFrame] = {}
    skipped: list[str] = []

    for ticker in tickers:
        try:
            df = src.get_history(ticker, period=period)
        except DataFetchError as exc:
            logger.warning("Skipping %s: %s", ticker, exc)
            skipped.append(ticker)
            continue
        results[ticker] = df
        logger.info("Fetched history for %s (%d rows)", ticker, len(df))

    return results, skipped
