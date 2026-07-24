"""Tiered on-disk cache for prices, quotes, and metadata.

Design:
- **History** (5y daily adjusted close) changes at most once per trading day, so
  it is cached as one parquet file per ticker and only refetched when older than
  ``HISTORY_TTL_HOURS``.
- **Latest quotes** get a short TTL (``QUOTE_TTL_SECONDS``) so pages feel live
  without hitting the upstream source on every request.
- **Metadata** (sector/industry/name) rarely changes; cached in a single shared
  ``metadata.json`` with a long TTL.

If a refetch fails but a cached copy exists, the stale copy is served rather than
erroring out. When there is no cache and the fetch fails, single-ticker calls
raise :class:`DataFetchError`; batch calls log-and-skip.
"""
from __future__ import annotations

import json
import logging
import os
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Optional

import pandas as pd

from .. import config
from . import fetch
from .sources import DataFetchError, PriceDataSource, default_source

logger = logging.getLogger(__name__)


# --------------------------------------------------------------------------
# Small JSON / timestamp helpers
# --------------------------------------------------------------------------
def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _is_fresh(iso_ts: Optional[str], ttl_seconds: float) -> bool:
    """True if ``iso_ts`` is within ``ttl_seconds`` of now."""
    if not iso_ts:
        return False
    try:
        ts = datetime.fromisoformat(iso_ts)
    except (TypeError, ValueError):
        return False
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    age = (datetime.now(timezone.utc) - ts).total_seconds()
    return age < ttl_seconds


def _read_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        with path.open("r", encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("Could not read %s (%s); treating as empty", path, exc)
        return default


def _atomic_write_json(path: Path, data: Any) -> None:
    """Write JSON atomically so a crash mid-write can't corrupt the file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=2, default=str)
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            try:
                os.remove(tmp)
            except OSError:
                pass


def _read_manifest() -> dict:
    return _read_json(config.MANIFEST_PATH, default={})


def _write_manifest(manifest: dict) -> None:
    _atomic_write_json(config.MANIFEST_PATH, manifest)


# --------------------------------------------------------------------------
# History (per-ticker parquet, refreshed ~once per trading day)
# --------------------------------------------------------------------------
def load_history(
    ticker: str,
    source: Optional[PriceDataSource] = None,
    period: Optional[str] = None,
    force_refresh: bool = False,
) -> pd.DataFrame:
    """Return date-indexed adjusted-close history for ``ticker``.

    Served from the parquet cache unless missing/stale/``force_refresh``.
    """
    config.ensure_dirs()
    period = period or config.HISTORY_PERIOD
    path = config.PRICES_DIR / f"{ticker}.parquet"

    manifest = _read_manifest()
    fetched_at = manifest.get(ticker, {}).get("history_fetched_at")
    fresh = (
        not force_refresh
        and path.exists()
        and _is_fresh(fetched_at, config.HISTORY_TTL_HOURS * 3600)
    )
    if fresh:
        try:
            return pd.read_parquet(path)
        except Exception as exc:  # corrupt/unreadable parquet -> refetch
            logger.warning("Cached parquet unreadable for %s (%s); refetching", ticker, exc)

    try:
        df = fetch.fetch_history(ticker, source=source, period=period)
    except DataFetchError as exc:
        if path.exists():
            logger.warning("Fetch failed for %s (%s); serving stale cache", ticker, exc)
            return pd.read_parquet(path)
        raise

    df.to_parquet(path)
    manifest.setdefault(ticker, {})["history_fetched_at"] = _now_iso()
    _write_manifest(manifest)
    logger.info("Cached history for %s (%d rows)", ticker, len(df))
    return df


def load_price_matrix(
    tickers: Iterable[str],
    source: Optional[PriceDataSource] = None,
    period: Optional[str] = None,
    force_refresh: bool = False,
) -> tuple[pd.DataFrame, list[str]]:
    """Return a wide adjusted-close DataFrame (columns=tickers, index=date).

    Failures are logged and skipped. Returns ``(matrix, skipped)``. Columns are
    date-aligned via an outer join, so missing values appear as NaN — the caller
    (you) decides how to handle alignment for the stats.
    """
    series: dict[str, pd.Series] = {}
    skipped: list[str] = []

    for ticker in tickers:
        try:
            series[ticker] = load_history(
                ticker, source=source, period=period, force_refresh=force_refresh
            )["adj_close"]
        except DataFetchError as exc:
            logger.warning("Skipping %s: %s", ticker, exc)
            skipped.append(ticker)

    matrix = pd.DataFrame(series).sort_index() if series else pd.DataFrame()
    matrix.index.name = "date"
    return matrix, skipped


# --------------------------------------------------------------------------
# Latest quote (short TTL)
# --------------------------------------------------------------------------
def load_latest_quote(
    ticker: str,
    source: Optional[PriceDataSource] = None,
    force_refresh: bool = False,
) -> dict:
    """Return the latest quote for ``ticker``, cached for QUOTE_TTL_SECONDS."""
    config.ensure_dirs()
    path = config.QUOTES_DIR / f"{ticker}.json"

    if not force_refresh:
        cached = _read_json(path, default=None)
        if cached and _is_fresh(cached.get("timestamp"), config.QUOTE_TTL_SECONDS):
            return cached

    try:
        quote = fetch.fetch_latest_quote(ticker, source=source)
    except DataFetchError as exc:
        cached = _read_json(path, default=None)
        if cached:
            logger.warning("Quote fetch failed for %s (%s); serving stale", ticker, exc)
            return cached
        raise

    _atomic_write_json(path, quote)
    return quote


# --------------------------------------------------------------------------
# Metadata (shared file, long TTL)
# --------------------------------------------------------------------------
def load_metadata(
    ticker: str,
    source: Optional[PriceDataSource] = None,
    force_refresh: bool = False,
) -> dict:
    """Return classification metadata for ``ticker`` from the shared store."""
    config.ensure_dirs()
    table = _read_json(config.METADATA_PATH, default={})
    entry = table.get(ticker)

    if (
        entry
        and not force_refresh
        and _is_fresh(entry.get("fetched_at"), config.METADATA_TTL_DAYS * 86400)
    ):
        return entry

    meta = fetch.fetch_metadata(ticker, source=source)
    meta["fetched_at"] = _now_iso()
    table[ticker] = meta
    _atomic_write_json(config.METADATA_PATH, table)
    return meta


def load_metadata_table(
    tickers: Iterable[str],
    source: Optional[PriceDataSource] = None,
    force_refresh: bool = False,
) -> pd.DataFrame:
    """Return a ticker-indexed DataFrame of metadata for ``tickers``."""
    rows = [
        load_metadata(t, source=source, force_refresh=force_refresh) for t in tickers
    ]
    if not rows:
        return pd.DataFrame()
    return pd.DataFrame(rows).set_index("ticker")


# --------------------------------------------------------------------------
# Cache introspection (local disk only — never triggers a network fetch)
# --------------------------------------------------------------------------
def peek_metadata(ticker: str) -> Optional[dict]:
    """Return cached metadata for ``ticker``, or None if not cached."""
    table = _read_json(config.METADATA_PATH, default={})
    return table.get(ticker)


def peek_history(ticker: str) -> Optional[pd.DataFrame]:
    """Return cached history for ``ticker``, or None if not cached/readable."""
    path = config.PRICES_DIR / f"{ticker}.parquet"
    if not path.exists():
        return None
    try:
        return pd.read_parquet(path)
    except Exception as exc:
        logger.warning("Cached parquet unreadable for %s: %s", ticker, exc)
        return None


def cached_tickers() -> list[str]:
    """Return the tickers that currently have cached history, sorted."""
    if not config.PRICES_DIR.exists():
        return []
    return sorted(p.stem for p in config.PRICES_DIR.glob("*.parquet"))


# --------------------------------------------------------------------------
# Bulk warm (used by populate_cache.py)
# --------------------------------------------------------------------------
def warm_cache(
    tickers: Iterable[str],
    source: Optional[PriceDataSource] = None,
    force_refresh: bool = False,
    fetch_quotes: bool = True,
    sleep_seconds: Optional[float] = None,
) -> dict:
    """Pre-fetch history + metadata (+ optional quote) for many tickers.

    Failures are logged and skipped. Returns ``{"ok": [...], "skipped": [...]}``.
    """
    src = source or default_source()
    if sleep_seconds is None:
        sleep_seconds = config.POPULATE_SLEEP_SECONDS
    config.ensure_dirs()

    tickers = list(tickers)
    summary: dict[str, list[str]] = {"ok": [], "skipped": []}

    for i, ticker in enumerate(tickers):
        try:
            hist = load_history(ticker, source=src, force_refresh=force_refresh)
            meta = load_metadata(ticker, source=src, force_refresh=force_refresh)
            if fetch_quotes:
                try:
                    load_latest_quote(ticker, source=src, force_refresh=True)
                except DataFetchError as exc:
                    logger.warning("Quote fetch failed for %s: %s", ticker, exc)
            summary["ok"].append(ticker)
            logger.info(
                "Cached %s: %d rows, sector=%s", ticker, len(hist), meta.get("sector")
            )
        except DataFetchError as exc:
            logger.warning("Skipping %s: %s", ticker, exc)
            summary["skipped"].append(ticker)

        # Be polite to the upstream source between tickers.
        if sleep_seconds and i < len(tickers) - 1:
            time.sleep(sleep_seconds)

    return summary
