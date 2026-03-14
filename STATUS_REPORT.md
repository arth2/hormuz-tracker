# Hormuz Crisis Tracker — Status Report

> **Date:** March 14, 2026
> **Railway URL:** https://hormuz-tracker-production-743f.up.railway.app/
> **Repo:** https://github.com/arth2/hormuz-tracker (branch: master)
> **Build Brief:** See `CLAUDE_CODE_BUILD_BRIEF.md` in project root for full spec.

---

## Implementation Progress

| Phase | Name | Status | Notes |
|-------|------|--------|-------|
| 1 | Project Scaffold | **Complete** | Express server, folder structure, all deps installed |
| 2 | Database & Baselines | **Complete** | 3 tables created on Railway Postgres, 23 baselines seeded |
| 3 | Cron Jobs & API | **Complete** | All 4 cron jobs, 6 REST endpoints, 4 admin triggers built |
| 4 | Frontend | **Complete** | Bloomberg-style dark dashboard with Chart.js charts |
| 5 | Deployment | **Partially Complete** | App deployed to Railway, auto-deploys on push. Data gaps remain (see below) |
| 6 | Hardening | **Not Started** | Error handling, rate limiting, resilience rules |
| 7 | Visual Polish | **Not Started** | Final CSS tweaks, mobile responsive, favicon |

---

## What's Working on Railway

- Dashboard loads and renders all panels/sections
- Deficit hero cards display: 15.0 mb/d, 15.0 million barrels cumulative, dollar value
- AIS tanker count chart and cumulative deficit chart render (single data point so far)
- Shut-in by country horizontal bar chart renders with hardcoded estimates
- Drewry WCI shows real data: $2,123/FEU (scraped successfully)
- Brent via FRED shows real data: $94.35/bbl (CSV endpoint works)
- Baselines API returns all 23 rows correctly
- Health check, all API endpoints respond
- Cron jobs are registered and scheduled
- Auto-migration runs on server startup

---

## Active Issues (4 total)

### Issue 1: Yahoo Finance API Blocked from Railway Cloud IPs

**Severity:** High — affects all live market price panels (Oil & Energy, Financial Markets, Commodities & Crypto)

**Symptoms:**
- `GET /api/live/:ticker` returns `{"error":"Failed to fetch live price"}` (HTTP 502) on Railway
- All three live market panels show baseline values with amber "(baseline)" label instead of live prices
- No delta calculations possible (deltas show as dashes)
- Dollar value in deficit hero uses fallback Brent ($71 baseline) instead of live price

**Root cause:** Yahoo Finance blocks HTTP requests from cloud provider IP ranges (Railway runs on shared cloud infrastructure). This is a well-known issue — Yahoo aggressively blocks non-residential IPs from their finance API.

**What we tried:**
1. **`query1.finance.yahoo.com/v8/finance/chart/`** — original endpoint. Blocked (connection timeout or 403).
2. **`query2.finance.yahoo.com/v8/finance/chart/`** — added as primary fallback. Also blocked from Railway IPs.
3. **Yahoo CSV download endpoint (`/v7/finance/download/`)** — added as final fallback. Also blocked.
4. **Realistic User-Agent header** — changed from generic `Mozilla/5.0` to full Chrome UA string. Did not help.
5. **Frontend baseline fallback** — implemented so panels show baseline values with "(baseline)" tag rather than empty dashes.

**All three Yahoo endpoints work fine from local/residential IPs.** The block is specifically on cloud provider IP ranges.

**Potential solutions not yet attempted:**
- **Client-side fetching:** Move Yahoo Finance calls to the browser (user's residential IP) instead of server proxy. Requires CORS handling — Yahoo may or may not set CORS headers.
- **Alternative free API:** Twelve Data, Alpha Vantage, or Polygon.io free tiers. Would require code changes to the ticker fetch logic.
- **FRED as market data source:** FRED has some of these series (we already use it for Brent). Could expand to cover more commodities. Limited to daily close, no intraday.
- **Residential proxy service:** Route Yahoo requests through a residential proxy. Adds cost and complexity.

**Relevant files:**
- `server/routes/api.js` lines 88-147 — `fetchYahooPrice()` function and `/api/live/:ticker` route
- `server/cron/deficit.js` lines 63-87 — Brent price fetch for deficit calculation
- `client/app.js` lines 279-324 — `loadLiveTickers()` with baseline fallback

---

### Issue 2: FRED Baltic Index Series Return 404

**Severity:** Medium — affects 2 rows in the Logistics & Shipping panel

**Symptoms:**
- Baltic Dry Index and Baltic Dirty Tanker Index show dashes in the Logistics panel
- FRED CSV endpoint returns HTTP 404 for series IDs `BDIY` and `BDTI`

**Root cause:** The FRED series IDs `BDIY` (Baltic Dry Index) and `BDTI` (Baltic Dirty Tanker Index) appear to have been discontinued, renamed, or reorganized. This was anticipated in the build brief: "FRED returns malformed data → check if FRED changed their series ID."

**What we tried:**
- Fetching `https://fred.stlouisfed.org/graph/fredgraph.csv?id=BDIY` — returns 404
- Fetching `https://fred.stlouisfed.org/graph/fredgraph.csv?id=BDTI` — returns 404
- Note: `DCOILBRENTEU` (Brent crude) works fine from the same FRED CSV endpoint

**Potential solutions not yet attempted:**
- Search FRED for current series IDs for Baltic indices (may have new IDs)
- Scrape Baltic Exchange directly or find an alternative free data source
- Use a different shipping index as proxy

**Relevant file:** `server/cron/logistics.js` lines 7-8 (FRED_SERIES array) and lines 16-52 (fetchFRED function)

---

### Issue 3: DAT Trucking Spot Rate Scrape Returns 404

**Severity:** Low — affects 1 row in the Logistics & Shipping panel

**Symptoms:**
- DAT Dry Van Spot shows dashes
- Scrape URL returns HTTP 404

**Root cause:** The DAT page at `https://www.dat.com/industry-trends/truckload-market-alerts` returns 404. The page may have been moved or restructured.

**What we tried:**
- Fetching the URL with a Chrome User-Agent — returns 404

**Potential solutions not yet attempted:**
- Find the current DAT market alerts URL
- Scrape a different trucking rate source (FreightWaves, etc.)

**Relevant file:** `server/cron/logistics.js` lines 82-112 (fetchDAT function)

---

### Issue 4: EIA Data — API Key Not Configured

**Severity:** Medium — affects entire U.S. Domestic Energy Prices panel (6 rows)

**Symptoms:**
- All rows in U.S. Domestic Energy Prices panel show dashes
- EIA cron job skips with log message: `[eia] No EIA_API_KEY configured, skipping`

**Root cause:** The `EIA_API_KEY` environment variable in Railway is still set to `your_key_here` (placeholder). The user has a key but hasn't entered it in Railway's Variables tab yet.

**Fix:** User needs to:
1. Go to Railway dashboard → project → service → Variables tab
2. Set `EIA_API_KEY` to their real key from https://www.eia.gov/opendata/
3. After Railway redeploys, run: `curl -X POST https://hormuz-tracker-production-743f.up.railway.app/api/admin/run-eia`

**Relevant file:** `server/cron/eia.js` lines 31-34 (API key check)

---

## File Structure Reference

```
hormuz-tracker/
├── server/
│   ├── index.js              ← Express entry, migrations, cron registration
│   ├── db.js                 ← Postgres pool (uses DATABASE_URL env var)
│   ├── cron/
│   │   ├── eia.js            ← EIA weekly fetcher (Wed 14:00 ET)
│   │   ├── ais.js            ← VesselFinder tanker scraper (daily 06:00 UTC)
│   │   ├── logistics.js      ← FRED + Drewry + DAT scrapers (Thu 12:00 UTC)
│   │   └── deficit.js        ← Daily deficit calculator (00:05 UTC)
│   ├── routes/
│   │   └── api.js            ← All REST + admin endpoints
│   ├── migrations/
│   │   └── 001_create_tables.sql
│   └── seed/
│       └── baselines.js      ← Run with `npm run seed`
├── client/
│   ├── index.html            ← Full dashboard markup
│   ├── style.css             ← Bloomberg terminal dark theme
│   └── app.js                ← Data loading, Chart.js, live updates
├── .env                      ← Local env (not committed)
├── .env.example
├── .gitignore
└── package.json              ← start: "node server/index.js"
```

## Git History

```
3f25f8b Fix Yahoo Finance proxy: add query2 fallback and baseline display
40ffb1b Build full Hormuz Crisis Tracker (Phases 1-4)
31b804d Add project docs and gitignore
676167e Initial commit
```

## Environment Variables on Railway

| Variable | Status |
|----------|--------|
| `DATABASE_URL` | Set (working) |
| `PORT` | Set to 3000 (working) |
| `NODE_ENV` | Should be `production` |
| `EIA_API_KEY` | **Needs real key** — currently placeholder |
