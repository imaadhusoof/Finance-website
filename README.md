# Options Pricer — Portfolio Builder

A portfolio recommendation web app: FastAPI data layer + React frontend.

**Neither layer does any financial math.** No returns, volatility, correlation,
covariance, optimization, filtering, or Monte Carlo. The backend gets clean,
cached, raw data in; the frontend renders it. The recommendation algorithm is
yours — it plugs in at one clearly marked seam (see
[Where your algorithm goes](#where-your-algorithm-goes)).

## Running it

Two processes. Backend first:

```bash
.venv\Scripts\activate
```
```bash
uv run uvicorn backend.main:app --reload
```

Then the frontend (separate terminal):

```bash
npm --prefix frontend run dev
```

Open `http://localhost:5173`. Vite proxies `/api` to the backend, so there is no
CORS setup in dev.

## Deployment

Production target is `finance.imaadhusoof.com` on a single AWS Lightsail
instance: nginx serves the built frontend and proxies `/api` to uvicorn, with
the parquet cache on a persistent path outside the app directory.

Everything needed is in [`deploy/`](deploy/) — start with
[`deploy/RUNBOOK.md`](deploy/RUNBOOK.md), which goes from a fresh Ubuntu box to a
live HTTPS site step by step.

| File | Purpose |
|------|---------|
| `deploy/RUNBOOK.md` | Step-by-step server setup |
| `deploy/nginx.conf` | Static frontend + `/api` reverse proxy |
| `deploy/options-pricer.service` | systemd unit for uvicorn |
| `deploy/cache-refresh.{service,timer}` | Daily cache refresh at 22:30 UTC |
| `deploy/deploy.sh` | Pull, build, restart, health-check |

## Where your algorithm goes

`backend/recommendation.py` — the single seam. It currently returns
501 Not Implemented, and the UI shows a "plug your algorithm in here" panel.
Replace the body of `recommend()` and the frontend renders your allocation
automatically; the request/response contract is already defined there.

Your raw inputs are one import away:

```python
from backend.data import cache

prices, skipped = cache.load_price_matrix(tickers)   # wide DataFrame of adj close
meta = cache.load_metadata_table(tickers)            # sector / industry
```

## Frontend

`frontend/` — Vite + React + TypeScript, no UI framework dependency.

| View | What it does |
|------|--------------|
| Universe | Every cached asset with live prices (refreshed every 60s), sector and asset-type breakdowns |
| Asset detail | 5-year adjusted-close chart with crosshair, tooltip, range selector, and a data-table view |
| Build portfolio | Constraints form (amount, risk, horizon, sector exclusions) that POSTs to the recommendation seam |

Design: light theme, white surfaces, a single blue accent (`#2a78d6`, validated
for contrast against white). Charts are hand-rolled SVG — no chart library.

**Deliberately absent:** no price change %, no day gain/loss, no performance
comparison. Every one of those is a *return* calculation, which belongs to your
math layer, not this one. They're easy to add once your algorithm exists.

## API

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Liveness + resolved cache dir |
| `GET /api/universe` | Tickers + metadata + last cached close (local cache only, instant) |
| `GET /api/quotes` | Latest quotes, fetched concurrently, short-TTL cached |
| `GET /api/prices/{ticker}` | Raw adjusted-close history |
| `POST /api/recommend` | **Your algorithm.** 501 until implemented |

## Layout

```
backend/
  main.py                     FastAPI app (GET /health)
  config.py                   Cache paths + freshness windows (env-overridable)
  data/
    sources/
      base.py                 PriceDataSource interface (swap providers here)
      yfinance_source.py      yfinance implementation
    fetch.py                  Network fetch layer (source-backed)
    cache.py                  Tiered on-disk cache (prices / quotes / metadata)
    populate_cache.py         CLI to warm the cache for a starter ticker list
data_cache/                   Generated cache (gitignored)
  prices/<TICKER>.parquet     Date-indexed adjusted close, one file per ticker
  quotes/<TICKER>.json        Latest quote (short TTL)
  metadata.json               Shared ticker -> {sector, industry, name, ...}
  manifest.json               Per-ticker fetch timestamps
```

## Setup (uv)

```bash
uv venv
uv pip install -r requirements.txt
```

## Run the API

```bash
uv run uvicorn backend.main:app --reload
```

Then check `http://127.0.0.1:8000/health`.

## Warm the cache

```bash
uv run python -m backend.data.populate_cache
```

Options: pass tickers to override the starter set, `--force` to ignore freshness,
`--no-quotes` to skip live quotes, `-v` for debug logs.

## Loading data (for your stats code)

```python
from backend.data import cache

# Wide DataFrame: columns = tickers, index = date, values = adjusted close.
prices, skipped = cache.load_price_matrix(["AAPL", "VTI", "BND", "TLT"])

# Single ticker history (date-indexed, 'adj_close' column).
hist = cache.load_history("AAPL")

# Sector/industry metadata as a ticker-indexed DataFrame.
meta = cache.load_metadata_table(["AAPL", "VTI", "BND"])

# Latest (short-TTL) quote.
quote = cache.load_latest_quote("AAPL")
```

## Caching behaviour

| Data | Cache | Refresh trigger |
|------|-------|-----------------|
| 5y daily history | `prices/<T>.parquet` | Missing or older than `HISTORY_TTL_HOURS` (default 12h) |
| Latest quote | `quotes/<T>.json` | Missing or older than `QUOTE_TTL_SECONDS` (default 60s) |
| Metadata | `metadata.json` | Missing or older than `METADATA_TTL_DAYS` (default 30d) |

If a refetch fails but a cached copy exists, the stale copy is served instead of
erroring. Bad/unknown tickers are logged and skipped, never crash a batch.

## Config (environment variables)

| Variable | Default | Purpose |
|----------|---------|---------|
| `OPTIONS_PRICER_CACHE_DIR` | `./data_cache` | Cache location (point at a persistent volume in prod) |
| `OPTIONS_PRICER_HISTORY_PERIOD` | `5y` | History window |
| `OPTIONS_PRICER_HISTORY_TTL_HOURS` | `12` | History freshness window |
| `OPTIONS_PRICER_QUOTE_TTL_SECONDS` | `60` | Quote freshness window |
| `OPTIONS_PRICER_METADATA_TTL_DAYS` | `30` | Metadata freshness window |
| `OPTIONS_PRICER_POPULATE_SLEEP_SECONDS` | `1.0` | Delay between tickers when bulk-populating |

## Data source note

`yfinance` scrapes Yahoo Finance: quotes are typically ~15 minutes delayed and it
is not an official API. It's fine for development and light traffic. To use a
paid real-time feed later, implement `PriceDataSource` in `data/sources/` and
return it from `default_source()` — nothing else changes.
