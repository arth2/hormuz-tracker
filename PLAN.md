# Implementation Plan — Fix Active Issues & Move to Phase 6

## Problem Summary

4 active issues prevent the dashboard from showing live data on Railway:

1. **Yahoo Finance blocked from cloud IPs** (HIGH) — all 19 live tickers show baseline fallbacks
2. **FRED Baltic Index series don't exist** (MEDIUM) — 2 logistics rows show dashes
3. **DAT Trucking URL returns 404** (LOW) — 1 logistics row shows dashes
4. **EIA API key not configured** (MEDIUM) — user action needed, not a code fix
5. **Bug: LIMIT 0 dead code** in `server/routes/api.js` — baseline fallback query never returns rows

## Plan

### Step 1: Add Twelve Data as alternative market data provider

Yahoo Finance blocks all 3 of its endpoints (query1, query2, CSV download) from Railway cloud IPs. FRED only covers Brent and has daily-close-only data. We need an alternative.

**Twelve Data** (twelvedata.com) is the best fit:
- Free tier: 800 API credits/day, 8 calls/minute
- Supports stocks, indices, futures, forex, crypto — all 19 tickers we need
- Batch quote endpoint: fetch up to 8 symbols in one call
- No credit card required for free registration

**Changes:**
- Add `TWELVE_DATA_API_KEY` to `.env.example` and document it
- Create `server/providers/twelvedata.js` — fetch function using their `/quote` endpoint
- Modify `server/routes/api.js`:
  - `fetchYahooPrice()` → `fetchTickerPrice()` with 3-tier fallback:
    1. Yahoo Finance (works locally/residential IPs)
    2. Twelve Data (works from cloud if API key set)
    3. Return `null` (frontend falls back to baseline)

**Symbol mapping**: Twelve Data uses slightly different symbols:
- Futures: `CL` not `CL=F`, `BZ` not `BZ=F`, etc.
- Indices: `SPX` not `^GSPC`, `IXIC` not `^IXIC`, etc.
- Crypto: `BTC/USD` not `BTC-USD`

We'll add a mapping table in the provider file.

### Step 2: Add server-side price caching (10-minute TTL)

With Twelve Data's 800 calls/day free tier, we need to cache aggressively. Currently every page load fires 19 individual `/api/live/:ticker` requests, plus Brent refreshes every 60s.

**Changes to `server/routes/api.js`:**
- Add in-memory cache: `Map<ticker, { price, timestamp }>`
- Cache TTL: 10 minutes (configurable)
- On cache hit → return cached price immediately
- On cache miss → fetch from provider chain, store result
- Add new batch endpoint: `GET /api/live/batch?tickers=CL=F,BZ=F,...`
  - Frontend can fetch all tickers in one request
  - Server fetches only uncached ones

**Frontend changes to `client/app.js`:**
- Switch from individual `/api/live/:ticker` calls to single `/api/live/batch` call
- Remove the 300ms stagger delays between ticker fetches
- Reduce Brent refresh interval from 60s to 5 minutes (saves API calls)

### Step 3: Fix LIMIT 0 bug in api.js

In the `/api/live/:ticker` error handler (line ~136), there's a dead query:
```sql
SELECT baseline_value FROM baselines WHERE metric_key = (
  SELECT metric_key FROM baselines LIMIT 0  -- always returns 0 rows
)
```

**Fix:** Remove this dead code — the baseline fallback is already handled by the frontend. The API should return a clean error, and the frontend's existing baseline fallback logic handles it.

### Step 4: Fix FRED Baltic series

FRED does not have Baltic Dry Index or Baltic Dirty Tanker Index series. The series IDs `BDIY` and `BDTI` are Bloomberg terminal identifiers, not FRED series IDs. These never existed on FRED.

**Fix:**
- Remove `BDIY` and `BDTI` from the `FRED_SERIES` array in `server/cron/logistics.js`
- Keep `DCOILBRENTEU` (Brent crude confirmation) — this works
- In the frontend, show "No free source" or simply remove these rows from the logistics table
- Update `client/app.js` LOGISTICS_KEYS to remove or label these items

### Step 5: Fix DAT Trucking scraper

DAT moved their market alerts page. The old URL `/industry-trends/truckload-market-alerts` returns 404.

**Fix:**
- Remove the DAT scraper from `server/cron/logistics.js` (the new DAT pages require authentication/login)
- Remove `dat_dry_van_spot` from the logistics panel in `client/app.js`
- This is low-priority data that doesn't affect core functionality

### Step 6: Document EIA API key setup

The EIA issue is a configuration problem, not a code bug. The user needs to:
1. Register at https://www.eia.gov/opendata/ for a free API key
2. Set `EIA_API_KEY` in Railway Variables
3. Trigger: `POST /api/admin/run-eia`

**Change:** Add a visible note in the dashboard UI when EIA data is unavailable, with instructions.

### Step 7: Phase 6 Hardening (from build brief)

After fixing data sources, implement the hardening rules:
1. Every panel renders "—" or "Data temporarily unavailable" on fetch failure
2. Structured logging for all cron jobs
3. Proper HTTP status codes on all API routes
4. `express-rate-limit` already in place — verify it works

## Execution Order

1. Step 3 (bug fix — quick win)
2. Step 4 (remove dead FRED series — quick win)
3. Step 5 (remove dead DAT scraper — quick win)
4. Step 1 (add Twelve Data provider)
5. Step 2 (add caching + batch endpoint)
6. Step 6 (EIA documentation)
7. Step 7 (hardening pass)

## Files Modified

- `server/routes/api.js` — fix bug, add caching, add batch endpoint, update fetch chain
- `server/providers/twelvedata.js` — NEW: Twelve Data API provider
- `server/cron/logistics.js` — remove BDIY, BDTI, DAT
- `server/cron/deficit.js` — use new fetchTickerPrice for Brent
- `client/app.js` — use batch endpoint, remove dead logistics keys, reduce refresh interval
- `.env.example` — add TWELVE_DATA_API_KEY

## User Actions Required

- Register at https://twelvedata.com (free) → set `TWELVE_DATA_API_KEY` in Railway
- Register at https://www.eia.gov/opendata/ (free) → set `EIA_API_KEY` in Railway
