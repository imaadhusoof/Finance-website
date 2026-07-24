"""yfinance implementation of :class:`PriceDataSource`.

Notes:
- ``auto_adjust=True`` is passed explicitly so the ``Close`` column is the
  split/dividend-adjusted close regardless of the installed yfinance version
  (newer versions default to this and drop the separate "Adj Close" column).
- yfinance is a Yahoo scraper: quotes are typically delayed ~15 minutes and it
  is not an official API. Good enough for this app; swap in a paid source via
  the PriceDataSource interface if true real-time is ever required.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

import pandas as pd
import yfinance as yf

from .base import DataFetchError, PriceDataSource

logger = logging.getLogger(__name__)


class YFinanceSource(PriceDataSource):
    name = "yfinance"

    def get_history(self, ticker: str, period: str = "5y") -> pd.DataFrame:
        try:
            raw = yf.Ticker(ticker).history(period=period, auto_adjust=True)
        except Exception as exc:  # network / parsing / unexpected yfinance errors
            raise DataFetchError(
                f"yfinance history request failed for {ticker!r}: {exc}"
            ) from exc

        if raw is None or raw.empty or "Close" not in raw.columns:
            raise DataFetchError(f"No history returned for {ticker!r}")

        out = raw[["Close"]].rename(columns={"Close": "adj_close"})

        # Normalize the index to tz-naive calendar dates.
        idx = pd.to_datetime(out.index)
        if idx.tz is not None:
            idx = idx.tz_localize(None)
        out.index = idx.normalize()
        out.index.name = "date"

        out = out[out["adj_close"].notna()].sort_index()
        if out.empty:
            raise DataFetchError(
                f"History for {ticker!r} had no usable adjusted-close values"
            )
        return out

    def get_latest_quote(self, ticker: str) -> dict:
        tk = yf.Ticker(ticker)

        price: float | None = None
        currency: str | None = None

        # fast_info is a lightweight call that avoids the slow/full .info payload.
        try:
            fast = tk.fast_info
            price = float(fast["last_price"])
        except Exception as exc:  # key missing, network, etc.
            logger.debug("fast_info last_price failed for %s: %s", ticker, exc)
        else:
            try:
                currency = fast["currency"]
            except Exception:
                currency = None

        # Fall back to the most recent close if no live price is available.
        if price is None:
            try:
                recent = tk.history(period="5d", auto_adjust=True)
                if not recent.empty:
                    price = float(recent["Close"].iloc[-1])
            except Exception as exc:
                raise DataFetchError(
                    f"Could not fetch latest quote for {ticker!r}: {exc}"
                ) from exc

        if price is None:
            raise DataFetchError(f"No latest price available for {ticker!r}")

        return {
            "ticker": ticker,
            "price": price,
            "currency": currency,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    def get_metadata(self, ticker: str) -> dict:
        info: dict = {}
        try:
            info = yf.Ticker(ticker).info or {}
        except Exception as exc:
            # .info is flaky; treat failure as "metadata unavailable" rather
            # than fatal so callers can still use price data.
            logger.warning("Could not fetch metadata for %s: %s", ticker, exc)
            info = {}

        return {
            "ticker": ticker,
            "name": info.get("longName") or info.get("shortName"),
            "sector": info.get("sector"),
            "industry": info.get("industry"),
            "quote_type": info.get("quoteType"),
            "exchange": info.get("exchange"),
            "currency": info.get("currency"),
        }
