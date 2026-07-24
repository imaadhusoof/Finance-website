"""Runtime configuration for the data layer.

Everything here is overridable via environment variables so the cache location
and freshness windows can change per deployment (e.g. point CACHE_DIR at a
persistent volume) without touching code.
"""
from __future__ import annotations

import os
from pathlib import Path

# Project root = the directory that contains the `backend` package.
PROJECT_ROOT = Path(__file__).resolve().parent.parent


def _cache_dir() -> Path:
    env = os.getenv("OPTIONS_PRICER_CACHE_DIR")
    if env:
        return Path(env).expanduser().resolve()
    return PROJECT_ROOT / "data_cache"


# --- Cache locations -------------------------------------------------------
CACHE_DIR: Path = _cache_dir()
PRICES_DIR: Path = CACHE_DIR / "prices"      # one parquet file per ticker
QUOTES_DIR: Path = CACHE_DIR / "quotes"      # one json file per ticker (latest quote)
METADATA_PATH: Path = CACHE_DIR / "metadata.json"   # shared ticker -> metadata map
MANIFEST_PATH: Path = CACHE_DIR / "manifest.json"   # per-ticker fetch timestamps

# --- Fetch / freshness windows --------------------------------------------
# Historical daily prices only change once per trading day, so a coarse TTL is
# plenty. Latest quotes get a short TTL so pages feel live without hammering
# the upstream source on every single request.
HISTORY_PERIOD: str = os.getenv("OPTIONS_PRICER_HISTORY_PERIOD", "5y")
HISTORY_TTL_HOURS: float = float(os.getenv("OPTIONS_PRICER_HISTORY_TTL_HOURS", "12"))
QUOTE_TTL_SECONDS: float = float(os.getenv("OPTIONS_PRICER_QUOTE_TTL_SECONDS", "60"))
METADATA_TTL_DAYS: float = float(os.getenv("OPTIONS_PRICER_METADATA_TTL_DAYS", "30"))

# Politeness delay between tickers when bulk-populating the cache.
POPULATE_SLEEP_SECONDS: float = float(os.getenv("OPTIONS_PRICER_POPULATE_SLEEP_SECONDS", "1.0"))


def ensure_dirs() -> None:
    """Create the cache directory tree if it does not yet exist."""
    PRICES_DIR.mkdir(parents=True, exist_ok=True)
    QUOTES_DIR.mkdir(parents=True, exist_ok=True)
