"""HTTP API that serves cached raw data to the frontend.

Strictly a data-serving layer: every endpoint returns raw prices or
classification metadata straight out of the cache. Nothing here derives a
figure from a price — no returns, volatility, correlation, or allocations.
Those belong in the layer you own (see ``recommendation.py`` for the seam).
"""
from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from .data import cache
from .data.populate_cache import STARTER_TICKERS
from .data.sources import DataFetchError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["data"])

#: Upper bound on concurrent upstream quote requests.
MAX_WORKERS = 8


def _parse_tickers(raw: Optional[str]) -> list[str]:
    if not raw:
        return []
    return [t.strip().upper() for t in raw.split(",") if t.strip()]


@router.get("/universe")
def get_universe(
    tickers: Optional[str] = Query(None, description="Comma-separated tickers"),
) -> dict:
    """Ticker list with metadata and last cached close.

    Reads local cache only, so it returns instantly and never blocks on the
    network. Live prices come from ``/api/quotes`` once the page has painted.
    """
    symbols = _parse_tickers(tickers) or STARTER_TICKERS
    rows: list[dict] = []

    for symbol in symbols:
        meta = cache.peek_metadata(symbol) or {}
        hist = cache.peek_history(symbol)

        last_close = None
        last_close_date = None
        if hist is not None and not hist.empty:
            last_close = float(hist["adj_close"].iloc[-1])
            last_close_date = hist.index[-1].strftime("%Y-%m-%d")

        rows.append(
            {
                "ticker": symbol,
                "name": meta.get("name"),
                "sector": meta.get("sector"),
                "industry": meta.get("industry"),
                "quote_type": meta.get("quote_type"),
                "currency": meta.get("currency"),
                "last_close": last_close,
                "last_close_date": last_close_date,
                "cached": hist is not None,
            }
        )

    return {"tickers": rows}


@router.get("/quotes")
def get_quotes(
    tickers: Optional[str] = Query(None, description="Comma-separated tickers"),
) -> dict:
    """Latest quotes, fetched concurrently and served through the short-TTL cache."""
    symbols = _parse_tickers(tickers) or STARTER_TICKERS
    if not symbols:
        return {"quotes": {}, "unavailable": []}

    def fetch_one(symbol: str) -> tuple[str, Optional[dict]]:
        try:
            return symbol, cache.load_latest_quote(symbol)
        except DataFetchError as exc:
            logger.warning("Quote unavailable for %s: %s", symbol, exc)
            return symbol, None

    workers = min(MAX_WORKERS, len(symbols))
    with ThreadPoolExecutor(max_workers=workers) as pool:
        results = list(pool.map(fetch_one, symbols))

    return {
        "quotes": {sym: q for sym, q in results if q is not None},
        "unavailable": [sym for sym, q in results if q is None],
    }


@router.get("/prices/{ticker}")
def get_prices(ticker: str, refresh: bool = False) -> dict:
    """Raw adjusted-close history for one ticker."""
    symbol = ticker.strip().upper()
    try:
        hist = cache.load_history(symbol, force_refresh=refresh)
    except DataFetchError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    return {
        "ticker": symbol,
        "dates": [d.strftime("%Y-%m-%d") for d in hist.index],
        "prices": [float(v) for v in hist["adj_close"]],
    }
