"""CLI to pre-fetch and cache data for a starter list of tickers.

Run it once (or on a schedule) so development never hits the upstream source
repeatedly:

    uv run python -m backend.data.populate_cache
    uv run python -m backend.data.populate_cache AAPL MSFT --force
    uv run python -m backend.data.populate_cache --no-quotes -v

The starter set spans US/international equity ETFs, large-cap stocks, bond ETFs,
and gold — a reasonable diversified universe to develop against.
"""
from __future__ import annotations

import argparse
import logging

from . import cache

STARTER_TICKERS: list[str] = [
    # US equity ETFs
    "VTI", "VOO", "QQQ",
    # International / emerging-market ETFs
    "VEA", "VWO",
    # Large-cap stocks
    "AAPL", "MSFT", "GOOGL", "AMZN", "JNJ", "JPM", "XOM",
    # Bond ETFs
    "BND", "AGG", "TLT", "LQD", "TIP",
    # Commodity / alternative
    "GLD",
]


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        description="Pre-fetch and cache price + sector metadata for a list of tickers.",
    )
    parser.add_argument(
        "tickers",
        nargs="*",
        help="Tickers to cache (default: built-in diversified starter set).",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Ignore cache freshness and refetch everything.",
    )
    parser.add_argument(
        "--no-quotes",
        action="store_true",
        help="Skip fetching latest quotes (history + metadata only).",
    )
    parser.add_argument(
        "-v", "--verbose", action="store_true", help="Enable debug logging."
    )
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    tickers = [t.upper() for t in args.tickers] or STARTER_TICKERS

    summary = cache.warm_cache(
        tickers,
        force_refresh=args.force,
        fetch_quotes=not args.no_quotes,
    )

    print("\n=== Cache summary ===")
    print(f"Cached OK ({len(summary['ok'])}): {', '.join(summary['ok']) or '-'}")
    print(f"Skipped  ({len(summary['skipped'])}): {', '.join(summary['skipped']) or '-'}")
    print(f"Cache dir: {cache.config.CACHE_DIR}")


if __name__ == "__main__":
    main()
