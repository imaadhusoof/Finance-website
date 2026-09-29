# Portfolio Builder

A web app that builds a diversified investment portfolio for you. You choose an amount, a risk appetite and a time horizon. It reads five years of daily prices, solves for the mix of assets that earns the most return for the risk you're willing to take, and simulates where that portfolio could end up.

It's live at **[finance.imaadhusoof.com](https://finance.imaadhusoof.com)**. The backend is FastAPI with NumPy and SciPy, and the frontend is React and TypeScript. It runs on a single AWS Lightsail server.

> Not investment advice. It's a portfolio-theory project built on historical data, and the projections are a range of possibilities rather than a promise.

## What it does

- **Overview and How it works:** a landing page, plus a page that walks through the method (the maths below) in plain language.
- **Universe:** the 18 assets the optimiser can choose from, with live prices and sector and asset-type breakdowns. There are US and international equity ETFs, large-cap stocks, bond ETFs and gold.
- **Asset detail:** a 5-year adjusted-close chart for each asset, with a crosshair, tooltip, range selector and a table view.
- **Build:** set an amount, a risk tolerance (conservative, balanced or aggressive), a horizon of 1 to 50 years, and any sectors to exclude. You get back an allocation donut, each holding's weight and dollar amount, the portfolio's expected return, volatility and Sharpe ratio, and a Monte Carlo fan chart of its projected value.

## How the recommendation engine works

All of the maths is in [`backend/recommendation.py`](backend/recommendation.py).

1. **Estimate returns and risk.** Using about 1,250 trading days of adjusted closes, it annualises each asset's mean daily return and the covariance matrix of returns across assets. Assets with less than a year of history are left out.
2. **Shrink the estimates.** Plain mean-variance optimisation trusts its inputs too much: it piles into whichever asset happened to have the best sample return. To guard against that, expected returns are pulled 40% toward the average across all assets. The covariance matrix is also pulled 20% toward its diagonal, which damps correlations that are mostly noise.
3. **Optimise.** It solves a long-only Markowitz problem, maximising `wᵀμ − ½·λ·wᵀΣw`, using SciPy's SLSQP. The weights must be positive, sum to 1, and stay at or below 25% for any single asset, so no one name dominates.
   - **Risk aversion:** the risk tolerance sets λ, the risk-aversion factor: 28 for conservative, 9 for balanced and 3 for aggressive. Conservative portfolios land lower on the efficient frontier and lean on bonds, while aggressive ones reach for return.
   - **Clean-up:** positions under 0.5% are dropped.
4. **Project the outcome.** It runs 6,000 Monte Carlo paths of geometric Brownian motion in monthly steps over the horizon, and returns the 10th, 25th, 50th, 75th and 90th percentile values. The random seed is fixed, so the same inputs always give the same answer.
5. **Report.** It reports the expected return, volatility, and Sharpe ratio (against a 4.2% risk-free rate), plus the median and 10th–90th percentile end values.

## How it's built

**Data layer (`backend/data/`).** Prices come from Yahoo Finance through `yfinance`. The fetching sits behind a `PriceDataSource` interface, so a paid real-time feed could be swapped in without touching anything else.

Everything is cached on disk:
- **Price history:** 5 years of daily history per ticker, as one Parquet file each. It's refreshed by a nightly job after the US market close.
- **Live quotes:** kept for 60 seconds.
- **Metadata:** sector and industry, kept for 30 days.

If a refetch fails, the last cached copy is served instead of an error. The API only serves and fetches tickers in the curated universe, so a request can't make the server download arbitrary symbols.

**API (`backend/api.py`, `backend/recommendation.py`):**
- `GET /api/universe`: the asset list with metadata and the last close. It reads the cache only, so it's instant.
- `GET /api/quotes`: latest quotes, fetched concurrently through the short-lived quote cache.
- `GET /api/prices/{ticker}`: 5-year adjusted-close history.
- `POST /api/recommend`: the portfolio engine.
- `GET /health`: health check.

**Frontend (`frontend/`).** It's Vite, React and TypeScript with no UI framework. The charts (price history, allocation donut and Monte Carlo fan) are hand-written SVG rather than a chart library. It uses a dark theme with an animated constellation background.

**Deployment (`deploy/`).** It's hosted on one AWS Lightsail Ubuntu instance:
- **nginx:** serves the built frontend, proxies `/api` to uvicorn, and rate-limits the API per IP.
- **Backend:** uvicorn runs as a systemd service.
- **HTTPS:** handled by certbot.
- **Nightly refresh:** a systemd timer refreshes the price cache at 22:30 UTC.

[`deploy/RUNBOOK.md`](deploy/RUNBOOK.md) goes from a fresh server to a live HTTPS site step by step. After that, `deploy/deploy.sh` redeploys: it pulls, installs dependencies, builds the frontend, restarts the backend, installs the timer and nginx config, and runs a health check.

## Running it locally (Windows)

I use a plain `venv` here rather than `uv`. A `uv`-managed Python lives under `AppData`, and its Windows launcher was unreliable from VS Code terminals. On the Linux server, `uv` works fine.

```bash
python -m venv .venv
```
```bash
.venv\Scripts\python.exe -m pip install -r requirements.txt
```
```bash
npm --prefix frontend install
```

Fill the price cache the first time. This takes about a minute:

```bash
.venv\Scripts\python.exe -m backend.data.populate_cache
```

Then run the backend and frontend in two terminals from the project root:

```bash
.venv\Scripts\python.exe -m uvicorn backend.main:app --reload
```
```bash
npm --prefix frontend run dev
```

Open `http://localhost:5173`. Vite proxies `/api` to the backend, so no CORS setup is needed.

`backend/main.py` can't be run directly (for example with VS Code's ▶ button). It uses package-relative imports and has to be started by uvicorn.

## Tests

The tests run the engine on synthetic price data, so they don't need the network or a filled cache. They check that the output is a valid portfolio (weights sum to 1 and respect the 25% cap), that higher risk tolerance really takes more risk, that sector exclusions work, and that the Monte Carlo bands are ordered. They also check that the API refuses tickers outside the universe.

```bash
.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
```
```bash
.venv\Scripts\python.exe -m pytest
```

## Configuration

Everything has a sensible default and can be overridden with environment variables:
- `OPTIONS_PRICER_CACHE_DIR`: where the cache lives (a persistent path in production).
- `OPTIONS_PRICER_HISTORY_PERIOD`: how much history to fetch (`5y`).
- `OPTIONS_PRICER_HISTORY_TTL_HOURS`: how old cached history can get before a request refetches it (`30`). The nightly job normally refreshes it well before then.
- `OPTIONS_PRICER_QUOTE_TTL_SECONDS`: how long a live quote is reused (`60`).
- `OPTIONS_PRICER_METADATA_TTL_DAYS`: how long sector and industry data is kept (`30`).

The `OPTIONS_PRICER_` prefix comes from the project's original name.

Yahoo Finance quotes are usually delayed by about 15 minutes, and `yfinance` isn't an official API. That's fine for a project like this. For real-time data, you'd implement `PriceDataSource` for a paid feed.
