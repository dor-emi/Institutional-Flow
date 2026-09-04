# FII Flow Tracker India — PRD

## Original problem statement
Build a web app that helps an investor understand where foreign institutional money is going in the Indian stock market, which sectors/stocks see increasing/decreasing institutional interest, and how strong/persistent those flows are. Analysis & visualization only — no recommendations, no claims that FII buying/selling predicts prices. Every major number shows source, data date, last-updated, frequency, quality indicator. No invented/estimated/hard-coded financial data. Show NIFTY 50, NIFTY 500, NIFTY Bank, India VIX alongside flows; allow flow-vs-return comparison.

## User choices
- Free public sources scraped live with caching (NSDL, NSE, Yahoo Finance); stock-level FII holding trends deferred (sector-level first)
- No login; no AI; dark theme; "In which sectors is FII money going?" is the priority view

## Architecture
- **Backend** FastAPI (`/app/backend/server.py`) + `services/` (nsdl.py, nse.py, market.py, analytics.py, store.py). Mongo cache collections: `fpi_daily`, `nse_fiidii`, `sector_fortnights`, `sector_reports`, `index_prices`, `meta`. TTL-based refresh (NSE 30m, NSDL daily 3h, sectors 12h, indices 1h) + startup warmup + 15-min periodic check.
- **Data sources**
  - NSDL Archive.aspx (ASP.NET postback, month-to-date daily FPI investment; backfilled 13 months) — confirmed FII/FPI equity/debt flows
  - NSDL Latest.aspx / NSE `fiidiiTradeReact` — provisional FII & DII (latest day); Groww mirror used to backfill ~1 month DII history (labelled)
  - NSDL Fortnightly Sector-wise FPI Investment static HTML reports (last 14 reports → 28 fortnights)
  - Yahoo Finance via yfinance: ^NSEI, ^CRSLDX, ^NSEBANK, ^INDIAVIX (2y)
- **Frontend** React + Recharts + shadcn, dark "Swiss financial" theme (Outfit / IBM Plex Sans / JetBrains Mono).

## API
`GET /api/sources`, `POST /api/refresh`, `GET /api/flows/daily?range=`, `GET /api/flows/stats`, `GET /api/indices?range=`, `GET /api/compare?index=&range=`, `GET /api/sectors?periods=`, `GET /api/export/daily.csv`, `GET /api/export/sectors.csv`

## Implemented (2026-09-04)
- Market context strip (4 indices, sparklines, 5D/20D/1Y returns)
- Liquidity pulse: confirmed streak, 5D/20D/60D sums, 20D z-score, net/gross, daily σ, NSE provisional FII & DII
- Sector flows (priority): ranked bars (latest FN / 3FN / 6FN / all), heatmap (₹ Cr or % of AUC) across 12 fortnights, cumulative trend lines, persistence chips, breadth
- Daily FII vs DII chart, net+cumulative+20D view, buy/sell view; ranges 1M/3M/6M/YTD/1Y
- Flows vs returns: cumulative-vs-level dual axis, scatter, Pearson r (same-day, flow→next-day, return→flow)
- Provenance chip on every panel; source health dots; methodology dialog; disclaimer banner; CSV exports
- Tested end-to-end (iteration_1: 27/27 backend, all frontend flows pass)

## Implemented (2026-09-04, iteration 2)
- Sector Rotation Map tab: flow intensity (% of AUC) vs NSE sector index return per fortnight, trails over 1/3/6 fortnights, quadrant reads, exact/approx mapping flags (sector index history from NSE `indicesHistory`, chunked 90-day fetches; Yahoo sectoral data was stale so replaced)
- Flow Alerts: browser-stored rules (streaks, z-score, 5D/20D sums, DII, VIX, NIFTY 5D, sector in/outflow), banner + header badge, manage dialog
- Quarterly FII holdings (NIFTY 100 via Screener.in shareholding tables): top increases/decreases QoQ/YoY, run length, 8Q sparkline, search
- Daily FPI bulk/block deals (NSE): name-heuristic FPI tagging, top 5 buys/sells per day, prominent partial-coverage caveat (per-stock FII trades are not publicly disclosed)
- Tested: iteration_2 41/41 backend + frontend flows pass; cosmetic fixes applied

## Backlog
- P1: FII derivatives positioning (NSE `fii_stats_*.xls` archives: index futures/options OI)
- P2: Holdings universe expansion to NIFTY 200/500; per-stock detail drawer
- P2: Debt/hybrid FPI flows panel; USD view
- P2: Server-side alert persistence / email notifications (requires login)
