# Hormuz Crisis Tracker — Claude Code Master Build Brief

> **How to use this document:** Hand this to Claude Code at the start of a session and say: *"Build the Hormuz Crisis Tracker per this brief. Start with Phase 1 and work through each phase in order. Ask me before moving to the next phase."* All external setup (API keys, Railway, GitHub, Node.js) is already complete per the setup guide.

---

## Context: What We're Building

A real-time web dashboard tracking the global oil supply disruption caused by the closure of the Strait of Hormuz (Operation Epic Fury, February 28, 2026). The dashboard shows:

- A **running deficit counter** — how many millions of barrels of oil have been blocked since the closure, and the dollar value of that deficit
- **Live financial markets** — oil prices, equity indices, metals, crypto, agriculture (all vs. pre-crisis baseline)
- **Logistics & shipping rates** — tanker indices, container rates, trucking rates
- **U.S. domestic energy prices** — gasoline, diesel, jet fuel, electricity, heating oil

**Baseline date:** February 27, 2026 (last trading day before strikes)
**Baseline Brent price:** $71/bbl
**Baseline Strait throughput:** 20 million barrels/day

---

## Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js (Express) |
| Database | PostgreSQL (on Railway, already provisioned) |
| Frontend | Vanilla HTML + CSS + JS (single page, served by Express as static files) |
| Charts | Chart.js (CDN) |
| Cron | `node-cron` (runs inside the Express process — no separate service) |
| HTTP | `axios` |
| Scraping | `cheerio` + `axios` (no headless browser) |
| DB client | `pg` (node-postgres, no ORM) |
| Deployment | Railway (GitHub auto-deploy, already connected) |

---

## Environment Variables (already set on Railway; use these names in code)

```
EIA_API_KEY       — EIA API key
DATABASE_URL      — PostgreSQL connection string (Railway)
PORT              — 3000
NODE_ENV          — production (or development locally)
```

---

## Project Folder Structure to Create

```
hormuz-tracker/
├── server/
│   ├── index.js              ← Express entry point
│   ├── db.js                 ← Postgres connection pool
│   ├── cron/
│   │   ├── eia.js            ← EIA weekly data fetcher
│   │   ├── ais.js            ← AIS tanker proxy scraper
│   │   ├── logistics.js      ← Drewry + DAT + Baltic scrapers
│   │   └── deficit.js        ← Daily deficit calculator
│   ├── routes/
│   │   └── api.js            ← All REST endpoints
│   └── migrations/
│       └── 001_create_tables.sql
├── client/
│   ├── index.html
│   ├── style.css
│   └── app.js
├── .env.example              ← Template (never commit real .env)
├── .gitignore
└── package.json
```

---

## Phase 1 — Project Scaffold & Local Setup

**Goal:** A running Express server with health check, correct folder structure, all dependencies installed.

### Steps

1. Create the folder structure above
2. Initialize npm and install dependencies:
   ```bash
   npm init -y
   npm install express pg axios cheerio node-cron dotenv
   npm install --save-dev nodemon
   ```
3. `package.json` scripts:
   ```json
   "scripts": {
     "start": "node server/index.js",
     "dev": "nodemon server/index.js"
   }
   ```
4. `.gitignore`:
   ```
   node_modules/
   .env
   ```
5. `.env.example`:
   ```
   EIA_API_KEY=your_key_here
   DATABASE_URL=postgresql://...
   PORT=3000
   NODE_ENV=development
   ```
6. `server/index.js` — minimal Express server:
   - Load `dotenv`
   - Serve `client/` as static files via `express.static`
   - Mount `/api` routes
   - `GET /health` returns `{ status: 'ok', timestamp: new Date() }`
   - Listen on `process.env.PORT || 3000`

**Verify:** `npm run dev` starts, `curl http://localhost:3000/health` returns ok.

---

## Phase 2 — Database Schema & Baseline Seeding

**Goal:** All three tables exist in Postgres; baselines table is fully seeded.

### Migration SQL (`server/migrations/001_create_tables.sql`)

```sql
CREATE TABLE IF NOT EXISTS daily_deficit (
  id SERIAL PRIMARY KEY,
  date DATE UNIQUE NOT NULL,
  ais_tanker_count INTEGER,
  eia_weekly_production_mb DECIMAL,
  estimated_throughput_mb DECIMAL,
  daily_deficit_mb DECIMAL,
  cumulative_deficit_mb DECIMAL,
  brent_price_at_calculation DECIMAL,
  cumulative_deficit_dollars BIGINT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS market_snapshots (
  id SERIAL PRIMARY KEY,
  metric_key VARCHAR(100) NOT NULL,
  metric_date DATE NOT NULL,
  value DECIMAL NOT NULL,
  unit VARCHAR(50),
  source VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(metric_key, metric_date)
);

CREATE TABLE IF NOT EXISTS baselines (
  metric_key VARCHAR(100) PRIMARY KEY,
  baseline_date DATE NOT NULL,
  baseline_value DECIMAL NOT NULL,
  unit VARCHAR(50),
  notes TEXT
);
```

### `server/db.js`

```javascript
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};
```

### Baseline Seed Data (hardcoded — verified Feb 27, 2026 closing prices)

```javascript
const BASELINES = [
  // Oil & Energy
  { key: 'wti_crude',               value: 70.45,   unit: '$/bbl',     ticker: 'CL=F'   },
  { key: 'brent_crude',             value: 71.00,   unit: '$/bbl',     ticker: 'BZ=F'   },
  { key: 'nat_gas',                 value: 3.87,    unit: '$/MMBtu',   ticker: 'NG=F'   },
  { key: 'rbob_gasoline',           value: 2.12,    unit: '$/gallon',  ticker: 'RB=F'   },
  { key: 'heating_oil',             value: 2.28,    unit: '$/gallon',  ticker: 'HO=F'   },
  // Equity indices
  { key: 'sp500',                   value: 5842.0,  unit: 'index',     ticker: '^GSPC'  },
  { key: 'nasdaq',                  value: 18890.0, unit: 'index',     ticker: '^IXIC'  },
  { key: 'dow',                     value: 43200.0, unit: 'index',     ticker: '^DJI'   },
  { key: 'ftse',                    value: 8490.0,  unit: 'index',     ticker: '^FTSE'  },
  { key: 'dax',                     value: 22100.0, unit: 'index',     ticker: '^GDAXI' },
  { key: 'nikkei',                  value: 37800.0, unit: 'index',     ticker: '^N225'  },
  { key: 'shanghai',                value: 3310.0,  unit: 'index',     ticker: '000001.SS' },
  // Metals
  { key: 'gold',                    value: 2880.0,  unit: '$/oz',      ticker: 'GC=F'   },
  { key: 'silver',                  value: 31.80,   unit: '$/oz',      ticker: 'SI=F'   },
  { key: 'copper',                  value: 4.52,    unit: '$/lb',      ticker: 'HG=F'   },
  { key: 'palladium',               value: 980.0,   unit: '$/oz',      ticker: 'PA=F'   },
  // Agriculture
  { key: 'wheat',                   value: 5.42,    unit: '$/bushel',  ticker: 'ZW=F'   },
  { key: 'corn',                    value: 4.68,    unit: '$/bushel',  ticker: 'ZC=F'   },
  { key: 'soybeans',                value: 9.88,    unit: '$/bushel',  ticker: 'ZS=F'   },
  // Crypto
  { key: 'bitcoin',                 value: 85200.0, unit: '$/BTC',     ticker: 'BTC-USD'},
  { key: 'ethereum',                value: 2340.0,  unit: '$/ETH',     ticker: 'ETH-USD'},
  // Deficit tracker constants
  { key: 'strait_throughput',       value: 20.0,    unit: 'mb/d',      ticker: null     },
  { key: 'strait_baseline_tankers', value: 37,      unit: 'vessels/d', ticker: null     },
];
// baseline_date = '2026-02-27' for all rows
```

> **Note:** Before committing these values, verify the Feb 27, 2026 closing price for each Yahoo Finance ticker by fetching `https://query1.finance.yahoo.com/v8/finance/chart/{TICKER}?interval=1d&range=5d` and checking the Feb 27 close. Update any values that differ by more than 1%.

Write `server/seed/baselines.js` that upserts all rows into the `baselines` table and can be run with `node server/seed/baselines.js`.

**Verify:** `SELECT COUNT(*) FROM baselines` returns 22.

---

## Phase 3 — Cron Jobs & Data Fetchers

**Goal:** All four automated data jobs are built and can be triggered manually for testing.

### 3a — EIA Data Fetcher (`server/cron/eia.js`)

**Schedule:** Every Wednesday at 14:00 ET (`0 14 * * 3`)

Fetch and store these EIA series (using `axios`):

```javascript
const EIA_SERIES = [
  { key: 'eia_gasoline_national', seriesId: 'EMM_EPMR_PTE_NUS_DPG',  unit: '$/gallon' },
  { key: 'eia_diesel_national',   seriesId: 'EMM_EPD2D_PTE_NUS_DPM', unit: '$/gallon' },
  { key: 'eia_crude_production',  seriesId: 'WCRFPUS2',               unit: 'mb/d'     },
  { key: 'eia_refinery_inputs',   seriesId: 'WCRRIUS2',               unit: 'mb/d'     },
  { key: 'eia_jet_fuel',          seriesId: 'EER_EPJK_PF4_RGC_DPG',  unit: '$/gallon' },
  { key: 'eia_heating_oil_ne',    seriesId: 'W_EPD2F_PRS_R10_DPG',   unit: '$/gallon' },
];
```

EIA API v2 endpoint pattern:
```
https://api.eia.gov/v2/petroleum/pri/gnd/data/
  ?api_key={EIA_API_KEY}
  &frequency=weekly
  &data[0]=value
  &sort[0][column]=period
  &sort[0][direction]=desc
  &length=4
  &facets[series][]=EMM_EPMR_PTE_NUS_DPG
```

For production/crude series use the `/v2/petroleum/sum/sndw/data/` endpoint. Check EIA API docs if the endpoint returns 404 — EIA reorganizes paths occasionally.

Upsert results into `market_snapshots`. On failure: log error, retry once after 5 seconds, then give up and use previous week's stored value.

### 3b — AIS Tanker Proxy Scraper (`server/cron/ais.js`)

**Schedule:** Daily at 06:00 UTC (`0 6 * * *`)

**Strategy:** Fetch the VesselFinder public vessel list for the Strait of Hormuz bounding box (55.5–57°E, 25.5–27°N) using `axios` + `cheerio`. Count vessels with type "Tanker" visible in the response.

URL to try first:
```
https://www.vesselfinder.com/vessels?type=6&minlat=25.5&maxlat=27&minlon=55.5&maxlon=57
```

Parse the returned HTML for vessel count. The exact selector will depend on VesselFinder's current page structure — write the scraper to extract whatever number is most clearly a vessel count in the Strait area.

**Failure handling (mandatory):**
- If scraping fails for any reason (HTTP error, selector not found, parse error), catch the exception
- Log the error with full details
- Store `NULL` for `ais_tanker_count` in `daily_deficit` for that day
- Do NOT crash or throw — return `null` cleanly
- The deficit calculator (3d) will detect `null` and fall back to 100% EIA interpolation

### 3c — Logistics & Baltic Scrapers (`server/cron/logistics.js`)

**Schedule:** Every Thursday at 12:00 UTC (`0 12 * * 4`)

**Baltic Dry Index (BDI) and Baltic Dirty Tanker Index (BDTI) — FRED API:**
```javascript
// No API key required for CSV endpoint
const FRED_SERIES = [
  { key: 'baltic_dry_index',          fredId: 'BDIY',  unit: 'index' },
  { key: 'baltic_dirty_tanker_index', fredId: 'BDTI',  unit: 'index' },
  { key: 'brent_fred_confirm',        fredId: 'DCOILBRENTEU', unit: '$/bbl' },
];
// URL pattern: https://fred.stlouisfed.org/graph/fredgraph.csv?id=BDIY
// Returns CSV: date,value. Take the most recent non-empty row.
```

**Drewry World Container Index — scrape:**
```
https://www.drewry.co.uk/supply-chain-advisors/supply-chain-expertise/world-container-index-assessed-by-drewry
```
Extract the composite WCI number ($/FEU). Store as `metric_key: 'drewry_wci'`.

**DAT Trucking Spot Rate — scrape:**
```
https://www.dat.com/industry-trends/truckload-market-alerts
```
Extract the dry van spot rate ($/mile). Store as `metric_key: 'dat_dry_van_spot'`.

Apply same failure handling pattern as AIS: catch exceptions, log, store `null`, never crash.

### 3d — Daily Deficit Calculator (`server/cron/deficit.js`)

**Schedule:** Daily at 00:05 UTC (`5 0 * * *`)

**Algorithm:**

```javascript
async function calculateDeficit() {
  const today = new Date().toISOString().split('T')[0];

  // 1. Get most recent EIA crude production figure from market_snapshots
  const eiaRow = await db.query(
    `SELECT value FROM market_snapshots
     WHERE metric_key = 'eia_crude_production'
     ORDER BY metric_date DESC LIMIT 1`
  );
  const eia_production_mb = eiaRow.rows[0]?.value ?? null;

  // 2. Get today's AIS count (may be null if scraper failed)
  const aisRow = await db.query(
    `SELECT ais_tanker_count FROM daily_deficit
     WHERE date = $1`, [today]
  );
  const ais_count = aisRow.rows[0]?.ais_tanker_count ?? null;

  // 3. Baseline values
  const BASELINE_THROUGHPUT = 20.0;   // mb/d
  const BASELINE_TANKERS = 37;        // vessels/day
  const BASELINE_US_PRODUCTION = 13.5; // mb/d (approx pre-crisis; update from baselines table)

  // 4. Compute blended throughput estimate
  let blended_throughput;

  if (ais_count !== null && eia_production_mb !== null) {
    const ais_fraction = ais_count / BASELINE_TANKERS;
    const eia_fraction = eia_production_mb / BASELINE_US_PRODUCTION;
    // Use US production as a proxy for global supply disruption extent
    const eia_interpolated = eia_fraction * BASELINE_THROUGHPUT;
    const ais_estimate = ais_fraction * BASELINE_THROUGHPUT;
    blended_throughput = (eia_interpolated * 0.7) + (ais_estimate * 0.3);
  } else if (eia_production_mb !== null) {
    // AIS unavailable — 100% EIA interpolation
    const eia_fraction = eia_production_mb / BASELINE_US_PRODUCTION;
    blended_throughput = eia_fraction * BASELINE_THROUGHPUT;
  } else {
    // No data at all — use previous day's throughput estimate
    const prevRow = await db.query(
      `SELECT estimated_throughput_mb FROM daily_deficit
       ORDER BY date DESC LIMIT 1`
    );
    blended_throughput = prevRow.rows[0]?.estimated_throughput_mb ?? BASELINE_THROUGHPUT * 0.25;
    // 0.25 = assume 75% disruption if we have no data (conservative fallback)
  }

  // 5. Daily deficit
  const daily_deficit_mb = BASELINE_THROUGHPUT - blended_throughput;

  // 6. Cumulative deficit
  const prevCumRow = await db.query(
    `SELECT cumulative_deficit_mb FROM daily_deficit
     ORDER BY date DESC LIMIT 1`
  );
  const prev_cumulative = prevCumRow.rows[0]?.cumulative_deficit_mb ?? 0;
  const cumulative_deficit_mb = parseFloat(prev_cumulative) + daily_deficit_mb;

  // 7. Fetch live Brent for dollar value
  let brent_price;
  try {
    const yahooRes = await axios.get(
      'https://query1.finance.yahoo.com/v8/finance/chart/BZ=F',
      { timeout: 5000 }
    );
    brent_price = yahooRes.data.chart.result[0].meta.regularMarketPrice;
  } catch {
    // Fall back to most recent stored Brent
    const storedBrent = await db.query(
      `SELECT value FROM market_snapshots
       WHERE metric_key = 'brent_crude'
       ORDER BY metric_date DESC LIMIT 1`
    );
    brent_price = storedBrent.rows[0]?.value ?? 71.0;
  }

  // 8. Dollar value
  const cumulative_deficit_dollars = Math.round(cumulative_deficit_mb * 1_000_000 * brent_price);

  // 9. Upsert into daily_deficit
  await db.query(`
    INSERT INTO daily_deficit
      (date, estimated_throughput_mb, daily_deficit_mb, cumulative_deficit_mb,
       brent_price_at_calculation, cumulative_deficit_dollars)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (date) DO UPDATE SET
      estimated_throughput_mb = EXCLUDED.estimated_throughput_mb,
      daily_deficit_mb = EXCLUDED.daily_deficit_mb,
      cumulative_deficit_mb = EXCLUDED.cumulative_deficit_mb,
      brent_price_at_calculation = EXCLUDED.brent_price_at_calculation,
      cumulative_deficit_dollars = EXCLUDED.cumulative_deficit_dollars
  `, [today, blended_throughput, daily_deficit_mb, cumulative_deficit_mb,
      brent_price, cumulative_deficit_dollars]);

  console.log(`[deficit] ${today}: deficit=${daily_deficit_mb.toFixed(2)} mb/d, cumulative=${cumulative_deficit_mb.toFixed(1)} mb, $${(cumulative_deficit_dollars/1e9).toFixed(2)}B`);
}
```

### 3e — REST API Routes (`server/routes/api.js`)

```
GET /api/deficit/current        → most recent row from daily_deficit
GET /api/deficit/history        → all daily_deficit rows from 2026-02-28 to today, ordered by date
GET /api/snapshots/:key         → latest row from market_snapshots for metric_key = :key
GET /api/snapshots/all          → one row per metric_key (the most recent value for each)
GET /api/baselines              → all rows from baselines table
GET /api/live/:ticker           → proxy Yahoo Finance; fetch and return { ticker, price, timestamp }
```

**Yahoo Finance proxy (`/api/live/:ticker`):**
```javascript
const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`;
const response = await axios.get(url, {
  timeout: 8000,
  headers: { 'User-Agent': 'Mozilla/5.0' }
});
const price = response.data.chart.result[0].meta.regularMarketPrice;
res.json({ ticker, price, timestamp: new Date() });
```

Add `express-rate-limit` to `/api/live/:ticker` — max 30 requests per minute per IP.

All routes must return appropriate HTTP error codes and never crash the process. Wrap everything in try/catch.

**Add cron job registration to `server/index.js`:**
```javascript
const cron = require('node-cron');
const { runEIA } = require('./cron/eia');
const { runAIS } = require('./cron/ais');
const { runLogistics } = require('./cron/logistics');
const { calculateDeficit } = require('./cron/deficit');

cron.schedule('5 0 * * *',   calculateDeficit, { timezone: 'UTC' });
cron.schedule('0 6 * * *',   runAIS,           { timezone: 'UTC' });
cron.schedule('0 14 * * 3',  runEIA,           { timezone: 'America/New_York' });
cron.schedule('0 12 * * 4',  runLogistics,     { timezone: 'UTC' });
```

Also expose manual trigger endpoints for initial population:
```
POST /api/admin/run-eia
POST /api/admin/run-ais
POST /api/admin/run-logistics
POST /api/admin/run-deficit
```

---

## Phase 4 — Frontend

**Goal:** Single-page dashboard that looks like a Bloomberg terminal — dark, data-dense, readable.

### Design Tokens (put in `:root` in `style.css`)

```css
:root {
  --bg:         #0a0e1a;
  --surface:    #111827;
  --border:     #1f2937;
  --text:       #f0f4f8;
  --muted:      #6b7280;
  --red:        #ef4444;
  --amber:      #f59e0b;
  --green:      #22c55e;
  --accent:     #3b82f6;
  --font-mono:  'JetBrains Mono', 'IBM Plex Mono', 'Courier New', monospace;
  --font-sans:  'Inter', system-ui, sans-serif;
}
```

Load fonts from Google Fonts CDN in `<head>`:
```html
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Inter:wght@400;600&display=swap" rel="stylesheet">
```

### `client/index.html` — Page Structure

```html
<!-- HEADER -->
<header>
  <div class="header-title">HORMUZ CRISIS TRACKER</div>
  <div class="header-meta">
    <span>Baseline: Feb 27, 2026 · Brent then: $71/bbl</span>
    <span>Crisis began: Feb 28, 2026 (Operation Epic Fury)</span>
    <span id="day-counter">Day — of closure</span>
    <span id="last-updated">Updating...</span>
  </div>
</header>

<!-- DEFICIT HERO SECTION -->
<section id="deficit-section" class="panel-full">
  <h2>THE DEFICIT</h2>
  <div class="deficit-cards">
    <div class="card" id="card-today-deficit">
      <div class="card-label">TODAY'S ESTIMATE</div>
      <div class="card-value" id="val-today-deficit">—</div>
      <div class="card-unit">mb/d missing</div>
    </div>
    <div class="card" id="card-cumulative">
      <div class="card-label">CUMULATIVE BACKLOG</div>
      <div class="card-value" id="val-cumulative">—</div>
      <div class="card-unit">million barrels since Feb 28</div>
    </div>
    <div class="card card-hero" id="card-dollar-value">
      <div class="card-label">DOLLAR VALUE</div>
      <div class="card-value" id="val-dollar">—</div>
      <div class="card-unit" id="val-dollar-brent">at $—/bbl Brent</div>
    </div>
  </div>
  <div class="deficit-charts">
    <div class="chart-container">
      <div class="chart-title">AIS TANKER COUNT — STRAIT OF HORMUZ <span class="badge">Daily proxy</span></div>
      <canvas id="chart-ais"></canvas>
    </div>
    <div class="chart-container">
      <div class="chart-title">CUMULATIVE SUPPLY DEFICIT (million barrels)</div>
      <canvas id="chart-deficit"></canvas>
    </div>
  </div>
  <div class="shutin-section">
    <div class="chart-title">ESTIMATED CURTAILMENT BY COUNTRY (mb/d)</div>
    <canvas id="chart-shutin"></canvas>
  </div>
</section>

<!-- MARKET GRID: 2x2 -->
<div class="market-grid">
  <section class="panel" id="panel-oil">
    <h3>OIL & ENERGY PRICES <span class="freshness-badge">Live · 15-min delay</span></h3>
    <div id="table-oil" class="data-table"></div>
  </section>
  <section class="panel" id="panel-markets">
    <h3>FINANCIAL MARKETS <span class="freshness-badge">Live · 15-min delay</span></h3>
    <div id="table-markets" class="data-table"></div>
  </section>
  <section class="panel" id="panel-commodities">
    <h3>COMMODITIES & CRYPTO <span class="freshness-badge">Live · 15-min delay</span></h3>
    <div id="table-commodities" class="data-table"></div>
  </section>
  <section class="panel" id="panel-logistics">
    <h3>LOGISTICS & SHIPPING <span class="freshness-badge">Updated weekly</span></h3>
    <div id="table-logistics" class="data-table"></div>
  </section>
</div>

<!-- US DOMESTIC ENERGY — FULL WIDTH -->
<section class="panel panel-full" id="panel-us-energy">
  <h3>U.S. DOMESTIC ENERGY PRICES <span class="freshness-badge">Weekly / Monthly EIA data</span></h3>
  <div id="table-us-energy" class="data-table"></div>
</section>

<!-- FOOTER -->
<footer>
  Data sources: EIA · IEA · Yahoo Finance · FRED · Drewry · DAT · VesselFinder (AIS proxy) ·
  All deltas vs. Feb 27, 2026 baseline · AIS tanker count is a directional proxy, not official data
</footer>
```

### `client/app.js` — Data Loading & Display Logic

**On page load, in this order:**
1. Fetch `/api/baselines` → store as `BASELINES` map (key → value)
2. Fetch `/api/deficit/current` → update deficit hero cards
3. Fetch `/api/deficit/history` → render AIS and cumulative deficit charts
4. Fetch all live tickers from `/api/live/:ticker` → render oil, markets, commodities panels
5. Fetch `/api/snapshots/all` → render logistics and US energy panels
6. Set `#day-counter` = days since Feb 28, 2026
7. Set `#last-updated` = current time

**Delta display function (use everywhere):**
```javascript
function formatDelta(current, baseline) {
  const delta = current - baseline;
  const pct = ((delta / baseline) * 100).toFixed(2);
  const sign = delta >= 0 ? '+' : '';
  const cls = delta >= 0 ? 'positive' : 'negative';
  return `<span class="delta ${cls}">${sign}${delta.toFixed(2)} (${sign}${pct}%)</span>`;
}
```

**Live ticker definitions:**
```javascript
const LIVE_TICKERS = {
  oil: [
    { key: 'wti_crude',      ticker: 'CL=F',     label: 'WTI Crude',       unit: '$/bbl'     },
    { key: 'brent_crude',    ticker: 'BZ=F',     label: 'Brent Crude',     unit: '$/bbl'     },
    { key: 'nat_gas',        ticker: 'NG=F',     label: 'Natural Gas',     unit: '$/MMBtu'   },
    { key: 'rbob_gasoline',  ticker: 'RB=F',     label: 'RBOB Gasoline',   unit: '$/gallon'  },
    { key: 'heating_oil',    ticker: 'HO=F',     label: 'Heating Oil',     unit: '$/gallon'  },
  ],
  markets: [
    { key: 'sp500',    ticker: '^GSPC',       label: 'S&P 500',   unit: ''      },
    { key: 'nasdaq',   ticker: '^IXIC',       label: 'Nasdaq',    unit: ''      },
    { key: 'dow',      ticker: '^DJI',        label: 'Dow Jones', unit: ''      },
    { key: 'ftse',     ticker: '^FTSE',       label: 'FTSE 100',  unit: ''      },
    { key: 'dax',      ticker: '^GDAXI',      label: 'DAX',       unit: ''      },
    { key: 'nikkei',   ticker: '^N225',       label: 'Nikkei',    unit: ''      },
    { key: 'shanghai', ticker: '000001.SS',   label: 'Shanghai',  unit: ''      },
  ],
  commodities: [
    { key: 'gold',      ticker: 'GC=F',    label: 'Gold',     unit: '$/oz'     },
    { key: 'silver',    ticker: 'SI=F',    label: 'Silver',   unit: '$/oz'     },
    { key: 'copper',    ticker: 'HG=F',    label: 'Copper',   unit: '$/lb'     },
    { key: 'palladium', ticker: 'PA=F',    label: 'Palladium',unit: '$/oz'     },
    { key: 'wheat',     ticker: 'ZW=F',    label: 'Wheat',    unit: '$/bushel' },
    { key: 'corn',      ticker: 'ZC=F',    label: 'Corn',     unit: '$/bushel' },
    { key: 'soybeans',  ticker: 'ZS=F',    label: 'Soybeans', unit: '$/bushel' },
    { key: 'bitcoin',   ticker: 'BTC-USD', label: 'Bitcoin',  unit: '$/BTC'    },
    { key: 'ethereum',  ticker: 'ETH-USD', label: 'Ethereum', unit: '$/ETH'    },
  ],
};
```

**Shut-in by country data (hardcoded estimates for chart):**
```javascript
const SHUTIN_ESTIMATES = {
  Iraq:   { baseline: 4.2, current: 0.4 },  // mb/d
  Saudi:  { baseline: 6.0, current: 5.1 },  // Saudi exports mostly Red Sea/pipeline
  Kuwait: { baseline: 1.7, current: 0.2 },
  UAE:    { baseline: 2.8, current: 0.4 },
};
```

### Chart.js Configuration Notes

**AIS Tanker Count Chart:**
- Line chart, one point per day from Feb 28 to today
- Reference line at y=37 (dashed, labeled "Pre-crisis baseline")
- Color: `var(--accent)` (#3b82f6) for the line
- Fill below line with low-opacity accent color

**Cumulative Deficit Chart:**
- Area chart (line + fill below), one point per day
- Color: `var(--red)` (#ef4444) with 20% opacity fill
- y-axis label: "Million barrels"

**Shut-in Bar Chart:**
- Horizontal bar chart, 4 bars (Iraq, Saudi, Kuwait, UAE)
- Each bar shows current curtailment (mb/d)
- Baseline tick mark on each bar

All charts: dark background to match page, minimal gridlines, monospace labels.

### Dollar Value Live Update

The dollar value card should update every 60 seconds by re-fetching Brent from `/api/live/BZ=F` and recomputing:
```javascript
setInterval(async () => {
  const brentRes = await fetch('/api/live/BZ=F');
  const { price } = await brentRes.json();
  const cumulativeMb = getCurrentCumulativeMb(); // stored from last deficit fetch
  const dollarValue = cumulativeMb * 1_000_000 * price;
  document.getElementById('val-dollar').textContent = `$${(dollarValue / 1e9).toFixed(1)}B`;
  document.getElementById('val-dollar-brent').textContent = `at $${price.toFixed(2)}/bbl Brent`;
}, 60_000);
```

---

## Phase 5 — Deployment to Railway

**Goal:** App is live on Railway URL, database is migrated, initial data is populated.

**Steps:**

1. Verify `.gitignore` includes `node_modules/` and `.env`
2. Verify `package.json` has `"start": "node server/index.js"`
3. Push to GitHub:
   ```bash
   git add .
   git commit -m "Initial build"
   git push origin main
   ```
4. Railway detects the push and auto-deploys. Watch the deployment logs in Railway dashboard.
5. Once deployed, run the migration via the Railway shell or by hitting the manual trigger endpoints:
   - `POST /api/admin/run-eia` — populate EIA data
   - `POST /api/admin/run-ais` — populate AIS count
   - `POST /api/admin/run-logistics` — populate Baltic/Drewry/DAT
   - `POST /api/admin/run-deficit` — calculate and store today's deficit
6. Visit the Railway-generated URL and verify the dashboard renders with real data.

**Debugging Railway deploys:**
- Check the "Deployments" tab in Railway for build logs
- Check "Logs" tab for runtime errors
- If port binding fails, verify `PORT` environment variable is set to `3000`
- If DB connection fails, verify `DATABASE_URL` is set correctly in Variables tab

---

## Phase 6 — Hardening

**Required resilience rules (implement these):**

1. Every data panel renders `"—"` or `"Data temporarily unavailable"` if its fetch fails — never a blank or broken panel
2. Every cron job logs: job name, timestamp, outcome (success/fail), values fetched or error message
3. AIS scraper failure stores `null` and falls back to EIA-only deficit calculation
4. EIA timeout: retry once after 5s, then use previous stored value
5. Brent fetch failure in deficit calc: use most recent stored value from `market_snapshots`
6. Yahoo Finance proxy: `express-rate-limit` on `/api/live/:ticker` — 30 req/min per IP
7. All `/api/*` routes return proper HTTP status codes (200, 404, 500) — never hang

---

## Phase 7 — Visual Polish

**Final pass — implement these if not already done:**

1. All number cells use `font-family: var(--font-mono)` — this is non-negotiable for a data dashboard
2. Deficit hero cards: largest text on the page, ideally `4–6rem`, bold
3. Delta values: red for negative, green for positive, applied via `.positive` / `.negative` CSS classes
4. Panel borders: 1px `var(--border)` color on all panels, subtle
5. Mobile responsive: at < 768px, stack all panels to single column
6. Data freshness label on every panel (see `<span class="freshness-badge">` elements in HTML)
7. Favicon: add a simple `🛢️` emoji favicon via:
   ```html
   <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🛢️</text></svg>">
   ```
8. `<title>Hormuz Crisis Tracker</title>` in `<head>`

---

## Key Reference Numbers (use these throughout the code)

```javascript
// Hardcode these as constants in the backend
const CRISIS_START_DATE = '2026-02-28';
const BASELINE_DATE = '2026-02-27';
const BASELINE_BRENT = 71.00;           // $/bbl
const BASELINE_THROUGHPUT = 20.0;       // mb/d total Strait transit
const BASELINE_CRUDE = 15.0;            // mb/d crude
const BASELINE_PRODUCTS = 5.0;          // mb/d petroleum products
const BASELINE_TANKERS = 37;            // VLCCs/day in Strait corridor
const BASELINE_GLOBAL_REFINERY = 84.4;  // mb/d global refinery runs
const PCT_WORLD_OIL_VIA_STRAIT = 0.20;  // ~20% of world oil supply
```

---

## What To Do If Scrapers Break

This will happen eventually. When it does:

1. VesselFinder / Drewry / DAT scraper returns errors → check Railway logs for the HTML it received vs. the selector it expected. Update the `cheerio` selector to match the new HTML structure.
2. Yahoo Finance returns 429 (rate limited) → add a 1-second delay between ticker fetches in the frontend load sequence
3. EIA API returns 403 → regenerate your EIA API key at eia.gov/opendata and update the Railway environment variable
4. FRED CSV returns malformed data → check if FRED changed their series ID; look up the new one at fred.stlouisfed.org

---

*End of build brief. Work through phases in order. Verify each phase works before proceeding to the next.*
