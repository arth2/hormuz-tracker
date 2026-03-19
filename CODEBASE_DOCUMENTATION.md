# Hormuz Crisis Tracker — Codebase Documentation

## 1. Project Overview

The Hormuz Crisis Tracker is a real-time dashboard monitoring a fictional geopolitical scenario: the closure of the Strait of Hormuz (beginning Feb 28, 2026). It tracks the supply deficit created by the blockage, live commodity prices, satellite-derived production activity, and curated intelligence from energy news sources.

The dashboard displays:
- **The Deficit** — daily and cumulative oil supply shortfall (mb/d), dollar value at current Brent
- **Wellhead Production Activity** — NASA VIIRS satellite flaring data across 6 Gulf oil regions
- **Crisis Intelligence Feed** — auto-curated news from commodity wires and research outlets
- **Market Panels** — live prices for oil, equities, metals, agriculture, and crypto with % change from pre-crisis baselines

---

## 2. Architecture

```
hormuz-tracker/
├── server/
│   ├── index.js              ← Express app, cron registration, migrations
│   ├── db.js                 ← PostgreSQL pool (pg)
│   ├── routes/
│   │   └── api.js            ← All API endpoints + price fetching logic
│   ├── cron/
│   │   ├── eia.js            ← EIA petroleum data (weekly)
│   │   ├── ais.js            ← VesselFinder AIS scrape (daily)
│   │   ├── logistics.js      ← FRED + Drewry WCI (weekly)
│   │   ├── deficit.js        ← Daily deficit calculation
│   │   ├── flaring.js        ← NASA FIRMS VIIRS flaring (daily)
│   │   └── intelligence.js   ← RSS + HTML news scraping (every 3 hours)
│   ├── migrations/
│   │   ├── 001_create_tables.sql
│   │   └── 002_flaring_intel_tables.sql
│   └── seed/
│       ├── baselines.js      ← Seeds 23 pre-crisis baselines
│       └── flaring_baseline.js ← Seeds VIIRS flaring baselines (6 regions)
├── client/
│   ├── index.html            ← Single-page dashboard
│   ├── app.js                ← All frontend logic, Chart.js rendering
│   └── style.css             ← Bloomberg-style dark theme
├── package.json
├── .env.example
└── .claude/launch.json       ← Dev server config
```

**Stack:**
- **Backend:** Express 5.x, node-cron 4.x, PostgreSQL (pg 8.x)
- **Frontend:** Vanilla JS, Chart.js 4 (CDN), JetBrains Mono font
- **Deployment:** Railway (auto-deploy from GitHub `master` branch)
- **No build step** — static files served directly by Express

---

## 3. Data Sources & API Keys

### Required Environment Variables

| Variable | Source | Registration | Cost | Used By |
|----------|--------|--------------|------|---------|
| `DATABASE_URL` | Railway PostgreSQL | Auto-provisioned | Included | `server/db.js` |
| `EIA_API_KEY` | U.S. Energy Information Administration | [eia.gov/opendata](https://www.eia.gov/opendata/) | Free | `server/cron/eia.js` |
| `TWELVE_DATA_API_KEY` | Twelve Data | [twelvedata.com](https://twelvedata.com/) | Free (800 credits/day) | `server/routes/api.js` |
| `FIRMS_MAP_KEY` | NASA FIRMS | [firms.modaps.eosdis.nasa.gov/api](https://firms.modaps.eosdis.nasa.gov/api/) | Free | `server/cron/flaring.js`, `server/seed/flaring_baseline.js` |

All keys are optional — the app degrades gracefully if any are missing (logs a warning, skips the cron, uses fallback data).

### External APIs & Data Sources

| Source | Type | Endpoint Pattern | Schedule | Files |
|--------|------|-----------------|----------|-------|
| EIA Petroleum | REST API | `https://api.eia.gov/v2/petroleum/{endpoint}/data/` | Weekly (Wed 14:00 ET) | `cron/eia.js` |
| Twelve Data | REST API | `https://api.twelvedata.com/price?symbol={sym}&apikey={key}` | On request (10-min cache) | `routes/api.js` |
| Yahoo Finance | REST API | `https://query1.finance.yahoo.com/v8/finance/chart/{ticker}` | Fallback only | `routes/api.js` |
| NASA FIRMS (NRT) | REST API (CSV) | `https://firms.modaps.eosdis.nasa.gov/api/area/csv/{key}/VIIRS_SNPP_NRT/{bbox}/{days}` | Daily 10:00 UTC | `cron/flaring.js` |
| FRED | CSV download | `https://fred.stlouisfed.org/graph/fredgraph.csv?id={fredId}` | Weekly (Thu) | `cron/logistics.js` |
| VesselFinder | HTML scrape | `https://www.vesselfinder.com/vessels?type=6&minlat=...` | Daily 06:00 UTC | `cron/ais.js` |
| Drewry WCI | HTML scrape | `https://www.drewry.co.uk/supply-chain-advisors/...` | Weekly (Thu) | `cron/logistics.js` |
| Reuters | RSS | `https://feeds.reuters.com/reuters/businessNews` | Every 3 hours | `cron/intelligence.js` |
| OilPrice | RSS | `https://oilprice.com/rss/main` | Every 3 hours | `cron/intelligence.js` |
| Rigzone | RSS | `https://www.rigzone.com/news/rss/rigzone_latest.aspx` | Every 3 hours | `cron/intelligence.js` |
| IEA, Kpler, OPEC, S&P Global, EIA Weekly, Vortexa, Bloomberg | HTML scrape | Various (see `intelligence.js` HTML_SOURCES) | Every 3 hours | `cron/intelligence.js` |

---

## 4. Database Schema

### Table: `baselines`
Pre-crisis reference values for 23 metrics. Seeded once.

| Column | Type | Description |
|--------|------|-------------|
| `metric_key` | VARCHAR(100) PK | e.g. `brent_crude`, `sp500` |
| `baseline_date` | DATE | `2026-02-27` |
| `baseline_value` | DECIMAL | Pre-crisis value |
| `unit` | VARCHAR(50) | e.g. `$/bbl`, `index` |
| `notes` | TEXT | Optional |

### Table: `daily_deficit`
One row per day since crisis start.

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL PK | |
| `date` | DATE UNIQUE | |
| `ais_tanker_count` | INTEGER | VesselFinder tanker count (nullable) |
| `eia_weekly_production_mb` | DECIMAL | U.S. crude production (mb/d) |
| `estimated_throughput_mb` | DECIMAL | Blended Strait throughput estimate |
| `daily_deficit_mb` | DECIMAL | `baseline - throughput` |
| `cumulative_deficit_mb` | DECIMAL | Running total since Feb 28 |
| `brent_price_at_calculation` | DECIMAL | Brent price at time of calculation |
| `cumulative_deficit_dollars` | BIGINT | `cumulative_mb * 1M * brent` |
| `created_at` | TIMESTAMP | |

### Table: `market_snapshots`
Latest values for EIA, FRED, and logistics metrics.

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL PK | |
| `metric_key` | VARCHAR(100) | e.g. `eia_gasoline_national`, `drewry_wci` |
| `metric_date` | DATE | |
| `value` | DECIMAL | |
| `unit` | VARCHAR(50) | |
| `source` | VARCHAR(100) | |
| `created_at` | TIMESTAMP | |
| UNIQUE | | `(metric_key, metric_date)` |

### Table: `flaring_data`
Daily VIIRS flaring measurements per region.

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL PK | |
| `region_key` | VARCHAR(50) | e.g. `iraq_south` |
| `date` | DATE | |
| `frp_sum` | DECIMAL | Total Fire Radiative Power (MW) |
| `hotspot_count` | INTEGER | Number of VIIRS detections |
| `rolling_avg_7d` | DECIMAL | 7-day rolling average FRP |
| `baseline_frp` | DECIMAL | Pre-crisis baseline (convenience copy) |
| `pct_of_baseline` | DECIMAL | `(frp_sum / baseline_frp) * 100` |
| `data_source` | VARCHAR(20) | `'NRT'` or `'SP'` |
| `created_at` | TIMESTAMP | |
| UNIQUE | | `(region_key, date)` |

### Table: `flaring_baselines`
Pre-crisis baseline FRP per region (seeded once).

| Column | Type | Description |
|--------|------|-------------|
| `region_key` | VARCHAR(50) PK | |
| `baseline_frp` | DECIMAL | Mean daily FRP, Feb 1-27 2026 |
| `baseline_hotspot_avg` | DECIMAL | Mean daily hotspot count |
| `baseline_date_start` | DATE | `2026-02-01` |
| `baseline_date_end` | DATE | `2026-02-27` |
| `notes` | TEXT | Source info |

### Table: `intelligence_feed`
Curated news items from commodity wires.

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL PK | |
| `source` | VARCHAR(100) | e.g. `Reuters`, `OilPrice` |
| `source_url` | TEXT | Link to original article |
| `headline` | TEXT | |
| `summary` | TEXT | First ~500 chars of article |
| `metric_extracted` | TEXT | e.g. `3.2 mb/d`, `$94/bbl` |
| `published_at` | TIMESTAMP | As reported by source |
| `fetched_at` | TIMESTAMP | When we fetched it |
| `category` | VARCHAR(20) | `PRODUCTION` / `SHIPPING` / `STORAGE` / `POLICY` / `MARKETS` |
| `relevance_score` | INTEGER | 1-5 (higher = more relevant) |
| `is_duplicate` | BOOLEAN | |
| `created_at` | TIMESTAMP | |

### Indices
- `idx_flaring_region_date` on `flaring_data(region_key, date)`
- `idx_intel_fetched` on `intelligence_feed(fetched_at DESC)`
- `idx_intel_category` on `intelligence_feed(category)`

---

## 5. Cron Jobs

All cron jobs are registered in `server/index.js` and use UTC timezone.

| Job | Schedule | File | External API | What It Does |
|-----|----------|------|-------------|--------------|
| `calculateDeficit` | `5 0 * * *` (00:05 UTC daily) | `cron/deficit.js` | Twelve Data, Yahoo Finance | Computes daily deficit from EIA production + AIS tanker data, fetches Brent price, calculates dollar value |
| `runAIS` | `0 6 * * *` (06:00 UTC daily) | `cron/ais.js` | VesselFinder (scrape) | Counts tankers in Strait of Hormuz bounding box |
| `runEIA` | `0 14 * * 3` (14:00 ET Wednesdays) | `cron/eia.js` | EIA API | Fetches 6 petroleum data series (gasoline, diesel, jet fuel, heating oil, production, refinery inputs) |
| `runLogistics` | `0 12 * * 4` (12:00 UTC Thursdays) | `cron/logistics.js` | FRED CSV, Drewry (scrape) | Fetches Brent from FRED, World Container Index from Drewry |
| `runFlaring` | `0 10 * * *` (10:00 UTC daily) | `cron/flaring.js` | NASA FIRMS | Fetches VIIRS NRT data for 6 Gulf oil regions, computes daily FRP + rolling avg |
| `runIntelligence` | `0 */3 * * *` (every 3 hours) | `cron/intelligence.js` | RSS feeds, HTML scrapes | Fetches news from 10 sources, filters by keyword relevance, scores, deduplicates, stores |

All cron jobs catch errors per-item and continue — no single failure crashes the process.

---

## 6. API Endpoints

### Health & Status
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Returns `{ status: 'ok', timestamp }` |
| `GET` | `/api/status` | Returns `{ eia_configured, twelvedata_configured, firms_configured }` |

### Deficit Data
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/deficit/current` | Latest daily deficit record |
| `GET` | `/api/deficit/history` | All deficit records since Feb 28, 2026 |

### Market Data
| Method | Path | Params | Description |
|--------|------|--------|-------------|
| `GET` | `/api/baselines` | — | All 23 pre-crisis baselines |
| `GET` | `/api/snapshots/all` | — | Latest snapshot per metric |
| `GET` | `/api/snapshots/:key` | `:key` = metric_key | Single metric snapshot |
| `GET` | `/api/live/batch` | — | All 21 live tickers (Twelve Data + Yahoo fallback) |
| `GET` | `/api/live/:ticker` | `:ticker` = Yahoo symbol | Single live price |

### Flaring Data
| Method | Path | Params | Description |
|--------|------|--------|-------------|
| `GET` | `/api/flaring/regions` | — | 6 region metadata with baseline FRP |
| `GET` | `/api/flaring/index/daily` | `?from=YYYY-MM-DD` | Gulf Production Activity Index timeseries |
| `GET` | `/api/flaring/:regionKey` | `?from=YYYY-MM-DD` | Single region flaring timeseries |

**Route ordering note:** `/api/flaring/index/daily` MUST be defined before `/api/flaring/:regionKey` in `api.js` — Express matches routes in order.

### Intelligence Feed
| Method | Path | Params | Description |
|--------|------|--------|-------------|
| `GET` | `/api/intelligence` | `?category=SHIPPING&limit=40&offset=0` | Paginated intelligence feed |
| `GET` | `/api/intelligence/latest` | — | Count of items from last 6 hours |

### Admin Triggers
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/admin/run-eia` | Manually trigger EIA fetch |
| `POST` | `/api/admin/run-ais` | Manually trigger AIS scrape |
| `POST` | `/api/admin/run-logistics` | Manually trigger logistics fetch |
| `POST` | `/api/admin/run-deficit` | Manually trigger deficit calculation |
| `POST` | `/api/admin/run-flaring` | Manually trigger flaring fetch |
| `POST` | `/api/admin/run-intelligence` | Manually trigger intelligence fetch |
| `POST` | `/api/admin/seed-flaring-baseline` | Run flaring baseline seeder (background) |

### Rate Limiting
- Window: 60 seconds, max 30 requests
- Applied to `/api/live/batch` and `/api/live/:ticker`

---

## 7. Frontend Architecture

### Structure
- **`index.html`** — Single page with 8 sections, Chart.js loaded via CDN
- **`app.js`** — All logic: data fetching, Chart.js rendering, collapsible sections, filtering
- **`style.css`** — Bloomberg-style dark theme using CSS variables

### CSS Variables
```css
--bg: #0f172a        /* Page background */
--surface: #1e293b   /* Card/panel background */
--border: #334155    /* Borders */
--text: #e2e8f0      /* Primary text */
--muted: #64748b     /* Secondary text */
--accent: #3b82f6    /* Links, active states */
--red: #ef4444       /* Negative/down */
--green: #22c55e     /* Positive/up */
--amber: #f59e0b     /* Neutral/warning */
```

### Init Sequence (`app.js init()`)
1. Set day counter
2. `loadBaselines()` — fetch pre-crisis reference values
3. `loadDeficit()` — fetch & display deficit hero cards
4. `loadDeficitHistory()` — render AIS + deficit charts
5. `renderShutinChart()` — stacked bar chart of curtailments
6. `loadAllLiveTickers()` — batch fetch 21 live prices
7. `loadSnapshotTable()` — logistics + US energy tables
8. `checkConfigStatus()` — show warnings for missing API keys
9. `loadFlaring()` — fetch regions, per-region data, Gulf Index
10. `loadIntelligence()` — fetch intelligence feed
11. Set intervals: price refresh (5 min), intel update check (10 min)

### Collapsible Sections
- Flaring section starts collapsed; toggled via `toggleSection('section-flaring')`
- Per-region panels are also collapsible; charts lazy-load on first expand
- CSS class `.expanded` controls visibility of `.collapsible-body`

---

## 8. Workarounds & Fallbacks

### FIRMS Data Availability Gap
**Problem:** NASA FIRMS has two data products:
- **VIIRS_SNPP_NRT** (Near Real-Time): Available within hours, but purged from the area API after ~7-10 days
- **VIIRS_SNPP_SP** (Standard Product): Permanent archive, but has a 2-3 month processing lag

This creates a gap: baseline data (Feb 2026) is too old for NRT and too recent for SP.

**Solution:** Hardcoded fallback baseline FRP values in `server/seed/flaring_baseline.js`:

| Region | Fallback FRP (MW) | Basis |
|--------|-------------------|-------|
| `iraq_south` | 1850 | Rumaila/WQ/Zubair cluster estimate |
| `kuwait` | 680 | Greater Burgan estimate |
| `uae_adco` | 520 | ADCO onshore estimate |
| `saudi_eastern` | 1420 | Ghawar/Abqaiq/Safaniya estimate |
| `iran_khuzestan` | 1100 | Khuzestan fields estimate |
| `qatar` | 280 | Dukhan/North Dome estimate |

The seed script tries FIRMS NRT first, then falls back to these values. Once SP data for Feb 2026 becomes available (April-May 2026), re-run `POST /api/admin/seed-flaring-baseline` to replace fallbacks with satellite-derived baselines.

### Yahoo Finance Blocked on Cloud IPs
**Problem:** Yahoo Finance blocks requests from cloud provider IP ranges (Railway, AWS, etc.).

**Solution:** Twelve Data is the primary price source (works from cloud IPs). Yahoo Finance is kept as a fallback for local/residential IP development.

Price fetch chain in `routes/api.js`:
1. Check 10-minute cache
2. Try Twelve Data API
3. Fall back to Yahoo Finance
4. Return cached/stale value if both fail

### Deficit Cron Brent Price Fallback Chain
The deficit calculation needs a Brent price. The fallback chain in `cron/deficit.js`:
1. **Twelve Data** (`symbol=BZ`)
2. **Yahoo Finance** (`BZ=F`)
3. **Stored value** (last `brent_crude` snapshot from `market_snapshots`)
4. **Hardcoded baseline** (`$71.00/bbl`)

### Intelligence HTML Scrapers
**Problem:** HTML scrapers for IEA, Kpler, OPEC, S&P Global, Vortexa, and Bloomberg are inherently fragile — they depend on page structure and may encounter bot protection.

**Solution:** Each scraper is wrapped in try/catch and fails independently. RSS-based sources (Reuters, OilPrice, Rigzone) are more durable. The feed degrades gracefully — if individual scrapers fail, remaining sources continue to populate the feed.

### Removed Data Sources
- **BDIY/BDTI**: Removed from FRED series — these are Bloomberg-proprietary symbols that never existed on FRED
- **DAT Trucking**: Removed — URL returns 404 and requires authentication

---

## 9. Deployment

### Railway Setup
1. **Auto-deploy:** Connected to GitHub `master` branch — every push triggers a deploy
2. **Buildpack:** Node.js (auto-detected)
3. **Start command:** `npm start` → `node server/index.js`
4. **Trust proxy:** `app.set('trust proxy', 1)` required for `express-rate-limit` behind Railway's reverse proxy

### Required Environment Variables (Railway Variables tab)
```
DATABASE_URL=postgresql://...     ← Auto-provisioned by Railway PostgreSQL plugin
EIA_API_KEY=...                   ← Register at eia.gov/opendata
TWELVE_DATA_API_KEY=...           ← Register at twelvedata.com
FIRMS_MAP_KEY=...                 ← Register at firms.modaps.eosdis.nasa.gov/api
PORT=3000                         ← Set by Railway automatically
```

### Post-Deploy Admin Triggers
After first deploy or after adding a new API key:
```bash
# Seed flaring baselines (takes 2-5 minutes)
curl -X POST https://<railway-url>/api/admin/seed-flaring-baseline

# Populate today's flaring data
curl -X POST https://<railway-url>/api/admin/run-flaring

# Populate initial intelligence feed
curl -X POST https://<railway-url>/api/admin/run-intelligence

# Trigger EIA data fetch
curl -X POST https://<railway-url>/api/admin/run-eia

# Trigger deficit calculation
curl -X POST https://<railway-url>/api/admin/run-deficit
```

### Migrations
Migrations run automatically on every server startup. Both are idempotent (`CREATE TABLE IF NOT EXISTS`):
- `001_create_tables.sql` — core tables
- `002_flaring_intel_tables.sql` — flaring + intelligence tables

---

## 10. Known Limitations & Fragility Points

1. **VesselFinder AIS selectors** — The AIS scraper relies on VesselFinder's page structure. If they redesign, the scraper will return NULL and the deficit calculator falls back to EIA-only mode.

2. **FIRMS API key validity** — The `/api/status` endpoint only checks if `FIRMS_MAP_KEY` env var is set, not if the key is valid. If flaring data stays empty after multiple cron runs, verify the key at the FIRMS API page.

3. **Route ordering** — `/api/flaring/index/daily` MUST be defined before `/api/flaring/:regionKey` in `api.js`. Express matches routes in order and will otherwise try to match `index` as a regionKey.

4. **Chart.js canvas reuse** — Always call `Chart.getChart(canvasId).destroy()` before creating a new chart on an existing canvas. Failing to do this causes "Canvas is already in use" errors.

5. **VIIRS data latency** — VIIRS NRT data has 3-12 hour latency. The daily flaring cron at 10:00 UTC should capture the previous day's late passes, but early runs may produce NULL FRP values.

6. **Twelve Data rate limits** — Free tier allows 800 API credits/day. The batch endpoint groups tickers into chunks of 8 to minimize credit usage.

7. **Intelligence deduplication** — Uses URL-based exact match, falling back to headline prefix (first 80 chars) fuzzy match within 24 hours. Slightly different headlines from different sources about the same event will both be stored.

8. **Gulf Production Index** — Requires `pct_of_baseline` values from daily flaring cron runs. Will show "—" until at least 1-2 days of successful flaring data accumulates.
