# Hormuz Crisis Tracker — PRD & Implementation Plan

> **Stack decision note:** Option B (lightweight backend on Railway/Render + Postgres) is recommended over Option C (hybrid Vercel + Railway). Both achieve the same result, but Option B keeps everything in one place — one service, one database, one deployment — which is meaningfully easier to debug and manage for a solo builder. Option C's split-hosting advantage (free Vercel frontend) is not worth the added complexity of coordinating two separate deployment environments. Option B costs ~$5–10/month and is the right call.

---

## ⚠️ Before You Open Claude Code: The Setup Manual

> **Read this first.** Several steps in this project require creating accounts, obtaining API keys, or configuring external services. These cannot be done inside Claude Code. The list below identifies every such step, and a plain-English walkthrough for each follows immediately after.

### External Steps Required (flagged throughout the plan with 🔧)

1. **EIA API key** — free, instant, required for all energy data
2. **Railway account + project** — your backend host (~$5/mo)
3. **Postgres database on Railway** — spun up inside Railway, one click
4. **GitHub account + repository** — required for Railway deployment
5. **Domain name (optional)** — if you want a custom URL instead of a Railway-generated one
6. **VesselFinder/MarineTraffic scraping** — no account needed, but requires understanding of browser-based scraping constraints
7. **Yahoo Finance API** — no account or key needed; called directly from the frontend

---

## 🔧 Setup Manual: Step-by-Step for External Steps

### Step 1 — Get Your EIA API Key

The U.S. Energy Information Administration offers a completely free API with no usage limits for personal use.

1. Go to: `https://www.eia.gov/opendata/`
2. Click **"Register"** in the top right
3. Fill in your name and email address — no payment required
4. Check your email for a confirmation link and click it
5. Log in, go to your account page, and copy your **API Key** (looks like: `a1b2c3d4e5f6g7h8i9j0...`)
6. Save this somewhere safe (a notes app, password manager, etc.) — you'll paste it into a `.env` file later

> **What this unlocks:** Weekly gasoline/diesel prices, U.S. crude production, refinery runs, electricity prices, heating oil prices, natural gas prices — all the EIA data layers in this dashboard.

---

### Step 2 — Create a GitHub Account and Repository

Railway deploys your code directly from GitHub. You need this before you can deploy anything.

1. Go to `https://github.com` and sign up for a free account if you don't have one
2. Once logged in, click the **"+"** icon in the top right → **"New repository"**
3. Name it something like `hormuz-tracker`
4. Set it to **Private** (recommended — your API keys will be in environment variables, not the code, but still)
5. Check **"Add a README file"**
6. Click **"Create repository"**
7. Copy the repository URL (looks like: `https://github.com/yourusername/hormuz-tracker`)

> **What this unlocks:** Railway can watch this repository and automatically redeploy your app every time you push new code. Claude Code will help you push code to this repo.

---

### Step 3 — Create a Railway Account and Project

Railway is a beginner-friendly hosting platform that handles the server and database for you.

1. Go to `https://railway.app`
2. Click **"Login"** → **"Login with GitHub"** — use the GitHub account you just created
3. Once logged in, click **"New Project"**
4. Select **"Deploy from GitHub repo"**
5. Find and select your `hormuz-tracker` repository
6. Railway will show you a deployment panel — don't configure anything yet, just note that the project was created
7. In your project dashboard, click **"New"** → **"Database"** → **"Add PostgreSQL"**
8. Railway will spin up a Postgres instance. Click on it, go to the **"Connect"** tab, and copy the **"DATABASE_URL"** string (looks like: `postgresql://postgres:password@host:port/railway`)
9. Save this DATABASE_URL alongside your EIA key

> **Cost:** Railway's Hobby plan is ~$5/month. You'll be prompted to add a credit card when you deploy. The first $5 of usage is often free for new accounts.

---

### Step 4 — Configure Environment Variables on Railway

Environment variables are how you pass secret keys to your app without hard-coding them.

1. In your Railway project dashboard, click on your app service (not the database)
2. Go to the **"Variables"** tab
3. Add the following variables one by one (click **"New Variable"** for each):

| Variable Name | Value |
|---|---|
| `EIA_API_KEY` | The key you got from Step 1 |
| `DATABASE_URL` | The URL you copied from Step 3 |
| `PORT` | `3000` |
| `NODE_ENV` | `production` |

4. Click **"Deploy"** after adding all variables

> **Why this matters:** Your app reads these values at runtime. They never appear in your code or on GitHub, keeping your keys secure.

---

### Step 5 — (Optional) Set Up a Custom Domain

By default Railway gives you a URL like `hormuz-tracker-production.up.railway.app`. If you want something like `hormuztracker.com`:

1. Buy a domain from any registrar (Namecheap, Cloudflare, Google Domains — ~$10–15/year)
2. In Railway, go to your app → **"Settings"** → **"Domains"** → **"Custom Domain"**
3. Enter your domain name
4. Railway will show you a CNAME record to add to your domain's DNS settings
5. Log in to your domain registrar, find the DNS settings, and add that CNAME record
6. Wait 10–30 minutes for DNS to propagate — then your custom URL will work

---

## Project Overview

**Name:** Hormuz Crisis Tracker
**Purpose:** A real-time dashboard tracking the global oil supply disruption caused by the closure of the Strait of Hormuz following U.S.-Israeli strikes on Iran (Operation Epic Fury, February 28, 2026). The dashboard tracks a cumulative supply deficit against a pre-crisis baseline, alongside live financial market data, commodity prices, logistics rates, and U.S. domestic energy prices.

**Baseline Date:** February 27, 2026 (final trading day before strikes)
**Baseline Brent Price:** $71/barrel
**Baseline Strait Throughput:** ~20 million barrels/day (15 mb/d crude + 5 mb/d products)

**Hosting:** Railway (backend + database + static frontend serving)
**Estimated Monthly Cost:** ~$5–10

---

## Data Architecture

### Tier 1 — Live (real-time, client-side fetch on page load)

All pulled directly from Yahoo Finance's free, unauthenticated API endpoint.
No API key required. 15-minute delay on futures prices.

**Endpoint pattern:** `https://query1.finance.yahoo.com/v8/finance/chart/{TICKER}`

| Category | Tickers |
|---|---|
| Oil & Energy | `CL=F` (WTI), `BZ=F` (Brent), `NG=F` (Nat Gas), `RB=F` (RBOB Gasoline), `HO=F` (Heating Oil) |
| Equity Indices | `^GSPC` (S&P 500), `^IXIC` (Nasdaq), `^DJI` (Dow), `^FTSE` (FTSE 100), `^GDAXI` (DAX), `^N225` (Nikkei), `000001.SS` (Shanghai) |
| Metals | `GC=F` (Gold), `SI=F` (Silver), `HG=F` (Copper), `PA=F` (Palladium) |
| Agriculture | `ZW=F` (Wheat), `ZC=F` (Corn), `ZS=F` (Soybeans) |
| Crypto | `BTC-USD` (Bitcoin), `ETH-USD` (Ethereum) |

**Baseline values for all tickers** are hardcoded as constants in the frontend — the closing price of each instrument on February 27, 2026. Every live price is displayed alongside its crisis delta (absolute change and % change since baseline).

### Tier 2 — Daily (fetched by backend cron job, stored in Postgres)

| Metric | Source | Notes |
|---|---|---|
| AIS tanker proxy count | VesselFinder public map scrape | Count of tankers broadcasting in Strait corridor (lat/long bounding box: 55.5–57°E, 25.5–27°N). Labeled "directional proxy — not official data." Baseline: ~35–40 VLCCs/day pre-crisis. |
| Baltic Dry Index | FRED API (free, no key required for basic access) | Series: `DCOILBRENTEU` for Brent confirmation; BDI via `https://fred.stlouisfed.org/graph/fredgraph.csv?id=BDIY` |
| Baltic Dirty Tanker Index (BDTI) | FRED API | Series: `BDTI` — directly measures crude tanker spot rates; will spike during Strait closure |

### Tier 3 — Weekly (fetched by backend cron job Wednesday/Thursday, stored in Postgres)

| Metric | EIA Series ID | Notes |
|---|---|---|
| U.S. regular gasoline (national avg) | `EMM_EPMR_PTE_NUS_DPG` | Released Mondays |
| U.S. diesel (national avg) | `EMM_EPD2D_PTE_NUS_DPM` | Released Mondays |
| U.S. jet fuel | `EER_EPJK_PF4_RGC_DPG` | Released Wednesdays |
| U.S. crude production | `WCRFPUS2` | Released Wednesdays (Weekly Petroleum Status Report) |
| U.S. refinery inputs | `WCRRIUS2` | Released Wednesdays |
| Heating oil (Northeast) | `W_EPD2F_PRS_R10_DPG` | Oct–Mar only |
| Drewry World Container Index | Scrape `https://www.drewry.co.uk/supply-chain-advisors/supply-chain-expertise/world-container-index-assessed-by-drewry` | Released Thursdays |
| DAT trucking spot (dry van) | Scrape `https://www.dat.com/industry-trends/truckload-market-alerts` | Released weekly |

### Tier 4 — Monthly (fetched by backend cron job, stored in Postgres)

| Metric | EIA Series ID |
|---|---|
| Residential electricity (¢/kWh) | `ELEC.PRICE.US-ALL.M` |
| Industrial electricity | `ELEC.PRICE.US-IND.M` |
| Residential natural gas | `NG.N3010US3.M` |

---

## The Deficit Tracker — Methodology

This is the analytical core of the dashboard and must be computed and stored server-side.

### Baseline (February 27, 2026)

| Metric | Baseline Value | Source |
|---|---|---|
| Global Strait throughput | 20.0 mb/d | EIA 2024 annual average (IEA confirmed) |
| — of which crude | 15.0 mb/d | IEA Director statement, March 2026 |
| — of which products | 5.0 mb/d | IEA Director statement, March 2026 |
| Brent spot price | $71.00/bbl | EIA STEO March 2026 (Feb 27 confirmed) |
| Global refinery runs | 84.4 mb/d | IEA December 2025 Oil Market Report |

### Daily Deficit Calculation

```
daily_transit_deficit_mb = 20.0 - actual_daily_throughput_estimate

actual_daily_throughput_estimate is computed as:
  IF eia_weekly_data_available:
    interpolate linearly from most recent EIA weekly figure
  ENHANCED BY:
    ais_tanker_count / baseline_tanker_count (35) × 20.0 mb/d
    (weighted blend: 70% EIA interpolation, 30% AIS proxy)
```

### Running Backlog

```
cumulative_backlog_mb += daily_transit_deficit_mb   (added each day at 00:01 UTC)
cumulative_backlog_dollars = cumulative_backlog_mb × current_brent_price × 1,000,000
```

The dollar backlog compounds as Brent rises — even on days when the physical gap is flat, the dollar value of the deficit grows if prices increase. This is a design feature, not a bug: it reflects the true replacement cost of the missing barrels.

### Display Components

- **TODAY'S DEFICIT:** estimated mb/d missing today vs. baseline
- **CUMULATIVE BACKLOG:** total millions of barrels since Feb 28
- **DOLLAR VALUE:** backlog × current Brent (updates live as Brent moves)
- **DAYS SINCE CLOSURE:** simple counter from Feb 28
- **AIS PROXY CHART:** daily tanker count trend since Feb 28
- **SHUT-IN BY COUNTRY:** Iraq / Saudi / Kuwait / UAE estimated curtailment

---

## Page Layout & Visual Design

```
┌─────────────────────────────────────────────────────────────────┐
│  HORMUZ CRISIS TRACKER                       Day [N] of closure  │
│  Baseline: Feb 27, 2026 · Brent then: $71/bbl · Crisis began    │
│  Feb 28, 2026 (Operation Epic Fury)                              │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  THE DEFICIT                                                     │
│  ┌────────────────┐  ┌───────────────────┐  ┌────────────────┐  │
│  │ TODAY          │  │ CUMULATIVE        │  │ $ VALUE        │  │
│  │ ~X mb/d        │  │ XXX million bbl   │  │ $XX.XB         │  │
│  │ missing        │  │ since Feb 28      │  │ at $XX/bbl     │  │
│  └────────────────┘  └───────────────────┘  └────────────────┘  │
│                                                                  │
│  [AIS tanker count chart, Feb 28 → today]                        │
│  [Shut-in bar chart: Iraq | Saudi | Kuwait | UAE]                │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────────────┐  ┌───────────────────────────────────┐
│  OIL & ENERGY PRICES     │  │  FINANCIAL MARKETS                │
│  WTI · Brent · NatGas    │  │  S&P · Nasdaq · Dow               │
│  RBOB · Heating Oil      │  │  FTSE · DAX · Nikkei · Shanghai   │
│  [price] [Δ since Feb 27]│  │  [price] [Δ since Feb 27]         │
└──────────────────────────┘  └───────────────────────────────────┘

┌──────────────────────────┐  ┌───────────────────────────────────┐
│  COMMODITIES & CRYPTO    │  │  LOGISTICS & SHIPPING             │
│  Gold · Silver · Copper  │  │  BDTI · Drewry WCI · BDI          │
│  Wheat · Corn · Soybeans │  │  DAT Dry Van Spot                 │
│  Bitcoin · Ethereum      │  │  [value] [Δ since Feb 27]         │
│  [price] [Δ since Feb 27]│  │  (weekly cadence — labeled)       │
└──────────────────────────┘  └───────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  U.S. DOMESTIC ENERGY PRICES           (weekly / monthly data)  │
│  Regular Gas · Diesel · Jet Fuel · Residential Electric         │
│  Residential NatGas · Heating Oil (Northeast)                   │
│  [price] [Δ since Feb 27 or nearest pre-crisis data point]      │
└─────────────────────────────────────────────────────────────────┘
```

**Design direction:** Dark background, high-contrast data display. Think Bloomberg terminal meets FT data journalism. Red/amber for negative deltas, green for positive. The deficit counter at the top should be the visual hero — large type, prominent.

---

## Technical Stack

| Layer | Technology | Why |
|---|---|---|
| Backend runtime | Node.js (Express) | Simple, well-documented, easy to find help for |
| Database | PostgreSQL (on Railway) | Stores historical deficit data, scraped metrics |
| Frontend | Vanilla HTML/CSS/JS or React | Single-page app served by Express as static files |
| Charting | Chart.js | Free, simple, well-documented |
| Cron jobs | `node-cron` (npm package) | Run inside the same Node process — no extra service |
| HTTP client | `axios` (npm) | For fetching EIA, FRED, Yahoo Finance |
| Scraping | `puppeteer` or `cheerio` + `axios` | For VesselFinder AIS proxy and DAT/Drewry scraping |
| ORM/DB client | `pg` (node-postgres) | Lightweight, no ORM needed for this schema |
| Deployment | Railway (GitHub auto-deploy) | Push to GitHub → auto-deploy, no DevOps knowledge needed |

---

## Database Schema

```sql
-- Stores one row per day for the deficit tracker
CREATE TABLE daily_deficit (
  id SERIAL PRIMARY KEY,
  date DATE UNIQUE NOT NULL,
  ais_tanker_count INTEGER,             -- scraped tanker count in Strait corridor
  eia_weekly_production_mb DECIMAL,     -- U.S. crude production (mb/d, interpolated daily)
  estimated_throughput_mb DECIMAL,      -- blended estimate of Strait throughput
  daily_deficit_mb DECIMAL,             -- 20.0 - estimated_throughput_mb
  cumulative_deficit_mb DECIMAL,        -- running sum from Feb 28
  brent_price_at_calculation DECIMAL,   -- Brent price when row was written
  cumulative_deficit_dollars BIGINT,    -- cumulative_deficit_mb × brent × 1,000,000
  created_at TIMESTAMP DEFAULT NOW()
);

-- Stores weekly/monthly data points for slower metrics
CREATE TABLE market_snapshots (
  id SERIAL PRIMARY KEY,
  metric_key VARCHAR(100) NOT NULL,     -- e.g. 'eia_gasoline_national', 'drewry_wci'
  metric_date DATE NOT NULL,
  value DECIMAL NOT NULL,
  unit VARCHAR(50),                     -- e.g. '$/gallon', '$/FEU', 'index'
  source VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(metric_key, metric_date)
);

-- Stores baseline values (seeded once at initialization)
CREATE TABLE baselines (
  metric_key VARCHAR(100) PRIMARY KEY,
  baseline_date DATE NOT NULL,          -- Feb 27, 2026
  baseline_value DECIMAL NOT NULL,
  unit VARCHAR(50),
  notes TEXT
);
```

---

## Implementation Plan

> **How to use this plan:** Work through these phases in order inside Claude Code. At the start of each Claude Code session, tell Claude which phase you're on and paste the relevant section. Each phase builds on the last.

> **🔧 = requires action outside Claude Code** (refer to Setup Manual above)

---

### Phase 0 — Generate the Setup Companion Guide

**First thing to do inside Claude Code:**

> Tell Claude Code: *"Before we build anything, read this PRD and generate a plain-English 'for dummies' companion guide that walks me through every step marked 🔧 in the implementation plan. The guide should assume I have never deployed a web application before, explain what each service does and why I need it, and give me exact click-by-click instructions. Format it as a separate markdown file."*

This gives you a personalized walkthrough document before a single line of code is written.

---

### Phase 1 — Project Scaffold & Local Development Environment

**Goal:** Get a working Node.js project running on your local machine.

**Steps:**
1. Create project folder structure:
   ```
   hormuz-tracker/
   ├── server/
   │   ├── index.js          (Express app entry point)
   │   ├── db.js             (Postgres connection)
   │   ├── cron/
   │   │   ├── deficit.js    (daily deficit calculation)
   │   │   ├── eia.js        (EIA data fetcher)
   │   │   ├── ais.js        (AIS scraper)
   │   │   └── logistics.js  (Drewry + DAT scraper)
   │   └── routes/
   │       └── api.js        (API endpoints for frontend)
   ├── client/
   │   ├── index.html
   │   ├── style.css
   │   └── app.js            (frontend JS, Yahoo Finance calls)
   ├── .env                  (local environment variables — never commit this)
   ├── .gitignore            (must include .env)
   ├── package.json
   └── README.md
   ```

2. Initialize npm project and install dependencies:
   ```bash
   npm init -y
   npm install express pg axios cheerio node-cron dotenv
   npm install --save-dev nodemon
   ```

3. Create `.env` file with local variables:
   ```
   EIA_API_KEY=your_key_here
   DATABASE_URL=postgresql://localhost:5432/hormuz_tracker
   PORT=3000
   NODE_ENV=development
   ```

4. Create `.gitignore`:
   ```
   node_modules/
   .env
   ```

🔧 **External step required:** You need Node.js installed locally. Download from `https://nodejs.org` — install the LTS version. No account needed.

🔧 **External step required:** You need a local Postgres instance for development, OR skip local Postgres and connect directly to your Railway database during development (easier for beginners — just use the Railway DATABASE_URL in your local `.env`).

---

### Phase 2 — Database Initialization & Baseline Seeding

**Goal:** Create the database schema and seed it with all Feb 27 baseline values.

**Steps:**
1. Write `server/db.js` — Postgres connection pool using the `pg` package
2. Write `server/migrations/001_create_tables.sql` — the schema from above
3. Write `server/seed/baselines.js` — seeds the `baselines` table with all Feb 27 values:

**Baseline seed data to hardcode:**

```javascript
const BASELINES = [
  // Oil & Energy (Yahoo Finance closing prices Feb 27, 2026)
  { key: 'wti_crude',        date: '2026-02-27', value: 70.45,  unit: '$/bbl' },
  { key: 'brent_crude',      date: '2026-02-27', value: 71.00,  unit: '$/bbl' },
  { key: 'nat_gas',          date: '2026-02-27', value: 3.87,   unit: '$/MMBtu' },
  { key: 'rbob_gasoline',    date: '2026-02-27', value: 2.12,   unit: '$/gallon' },
  { key: 'heating_oil',      date: '2026-02-27', value: 2.28,   unit: '$/gallon' },
  // Indices
  { key: 'sp500',            date: '2026-02-27', value: 5842.0, unit: 'index' },
  { key: 'nasdaq',           date: '2026-02-27', value: 18890.0,unit: 'index' },
  { key: 'dow',              date: '2026-02-27', value: 43200.0, unit: 'index' },
  // Metals
  { key: 'gold',             date: '2026-02-27', value: 2880.0, unit: '$/oz' },
  { key: 'silver',           date: '2026-02-27', value: 31.80,  unit: '$/oz' },
  { key: 'copper',           date: '2026-02-27', value: 4.52,   unit: '$/lb' },
  // Crypto
  { key: 'bitcoin',          date: '2026-02-27', value: 85200.0,unit: '$/BTC' },
  // Deficit tracker
  { key: 'strait_throughput',date: '2026-02-27', value: 20.0,   unit: 'mb/d' },
  { key: 'strait_baseline_tankers', date: '2026-02-27', value: 37, unit: 'vessels/day' },
];
```

> **Note to Claude Code:** Verify the Feb 27 closing prices for each ticker by fetching them from Yahoo Finance historical data before seeding. Use the actual closing prices, not estimates.

4. Run migration and seed scripts to initialize the database
5. Verify all baseline rows exist with a simple SELECT query

---

### Phase 3 — Backend API & Cron Jobs

**Goal:** Build the server that fetches, stores, and serves all data.

#### 3a — EIA Data Fetcher (`server/cron/eia.js`)

Runs every Wednesday at 14:00 ET (EIA releases weekly data at ~10:30am ET Wednesdays).

```javascript
// Fetch and store these EIA series:
// EMM_EPMR_PTE_NUS_DPG  — gasoline
// EMM_EPD2D_PTE_NUS_DPM — diesel
// WCRFPUS2              — U.S. crude production
// WCRRIUS2              — refinery inputs

// EIA API endpoint pattern:
// https://api.eia.gov/v2/petroleum/pri/gnd/data/?api_key={KEY}&frequency=weekly&data[0]=value&facets[product][]=EPM0&sort[0][column]=period&sort[0][direction]=desc&length=4
```

Store results in `market_snapshots` table with appropriate `metric_key` values.

#### 3b — AIS Tanker Proxy Scraper (`server/cron/ais.js`)

Runs daily at 06:00 UTC.

Strategy: Use `axios` + `cheerio` to fetch the VesselFinder public vessel list page filtered to the Strait of Hormuz geographic area. Count vessels with vessel type "Tanker" in the defined bounding box. This is a directional proxy — precision is not required, trend is what matters.

If VesselFinder changes its page structure and scraping breaks, fall back to storing `null` for that day and using 100% EIA interpolation for the deficit calculation. The dashboard should degrade gracefully — label the AIS panel "data unavailable" without breaking the rest of the page.

🔧 **External consideration:** Web scraping public pages is generally acceptable for personal use, but may occasionally break if the source site updates its HTML structure. Claude Code can help you fix the scraper when this happens — just paste the error and the new page HTML.

#### 3c — Logistics Scrapers (`server/cron/logistics.js`)

Runs every Thursday at 12:00 UTC (after Drewry publishes).

- **Drewry WCI:** Scrape the composite index number from the Drewry public page
- **DAT Trucking:** Scrape the weekly dry van spot rate summary from DAT's public trends page
- **Baltic indices:** Fetch from FRED API (free, no key required for CSV endpoint):
  - `https://fred.stlouisfed.org/graph/fredgraph.csv?id=BDIY` (Baltic Dry)
  - Store BDTI separately via the same FRED pattern

#### 3d — Daily Deficit Calculator (`server/cron/deficit.js`)

Runs daily at 00:05 UTC (just after midnight, so it picks up the previous day's data).

```javascript
// Algorithm:
// 1. Get most recent EIA weekly crude production figure
// 2. Get today's AIS tanker count (if available)
// 3. Compute blended throughput estimate:
//    ais_fraction = ais_count / 37  (37 = baseline tankers/day)
//    eia_interpolated = last_eia_production / baseline_production  (as fraction)
//    blended = (eia_interpolated × 0.7 + ais_fraction × 0.3) × 20.0  (mb/d)
// 4. daily_deficit = 20.0 - blended
// 5. cumulative = previous day cumulative + daily_deficit
// 6. dollar_value = cumulative × current_brent (fetch live from Yahoo Finance)
// 7. INSERT into daily_deficit table
```

#### 3e — REST API Endpoints (`server/routes/api.js`)

```
GET /api/deficit/current     — today's deficit row
GET /api/deficit/history     — all daily_deficit rows since Feb 28 (for charts)
GET /api/snapshots/:key      — latest value for a given metric_key
GET /api/snapshots/all       — all latest snapshots (for weekly/monthly panels)
GET /api/baselines           — all baseline values (for delta calculations)
```

---

### Phase 4 — Frontend Build

**Goal:** Build the dashboard UI as a single HTML page served by Express.

#### 4a — Static File Serving

Configure Express to serve everything in `client/` as static files:
```javascript
app.use(express.static(path.join(__dirname, '../client')));
```

#### 4b — HTML Structure (`client/index.html`)

Implement the layout from the Page Layout section above. Key structural elements:
- Header bar with day counter, baseline reminder, and last-updated timestamp
- Deficit hero section (3 big number cards + 2 charts below)
- 2×2 grid for the four market panels
- Full-width U.S. domestic energy panel at bottom

#### 4c — Live Yahoo Finance Data (`client/app.js`)

On page load, fetch all live tickers from Yahoo Finance. Because Yahoo Finance doesn't support CORS from browsers directly, route these calls through your own backend:

```
GET /api/live/:ticker   — backend proxies Yahoo Finance call and returns price
```

This keeps the frontend simple and avoids CORS issues.

#### 4d — Data Display Logic

For every metric displayed:
1. Fetch current value (live or from `/api/snapshots`)
2. Fetch baseline value from `/api/baselines`
3. Compute delta: `current - baseline`
4. Compute pct change: `(current - baseline) / baseline × 100`
5. Display: current price, delta (colored red/green), pct change

#### 4e — Charts (Chart.js)

Two charts in the deficit section:
- **AIS Tanker Count Trend:** Line chart, Feb 28 → today, daily points, reference line at 37 (baseline)
- **Cumulative Deficit (mb):** Area chart, Feb 28 → today, daily points

One chart per financial panel (optional, space permitting):
- Sparkline of price since Feb 28 for each key instrument

#### 4f — Data Freshness Labels

Every data panel must display its cadence clearly:
- Live data: "Live (15-min delay)"
- Daily data: "Updated daily · Last: [date]"
- Weekly data: "Updated weekly · Last: [date]"
- Monthly data: "Updated monthly · Last: [date]"

This is non-negotiable — mixed cadence data without labeling is misleading.

---

### Phase 5 — Deployment to Railway

🔧 **External steps required — refer to Setup Manual Steps 2–4 above**

1. Ensure `.gitignore` includes `.env` and `node_modules/`
2. Add a `start` script to `package.json`:
   ```json
   "scripts": {
     "start": "node server/index.js",
     "dev": "nodemon server/index.js"
   }
   ```
3. Push all code to GitHub:
   ```bash
   git add .
   git commit -m "Initial build"
   git push origin main
   ```
4. Railway will detect the push and auto-deploy
5. Check the Railway deployment logs for errors
6. Run the database migration script against the Railway Postgres instance
7. Run the baseline seed script
8. Manually trigger each cron job once to populate initial data
9. Verify all API endpoints return correct data
10. Visit your Railway-generated URL and confirm the dashboard renders

---

### Phase 6 — Hardening & Edge Cases

**Goal:** Make the dashboard resilient to data gaps and scraping failures.

1. **Graceful degradation:** Every data panel should render with "—" or "Data temporarily unavailable" if its API call fails — never a broken/blank page
2. **AIS scraper failure handling:** If scraping fails, log the error, store `null` for that day, use 100% EIA interpolation in deficit calculation
3. **EIA API timeout handling:** Retry once after 5 seconds; if still failing, use previous week's value
4. **Brent proxy for dollar deficit:** If Yahoo Finance live fetch fails, use most recent stored Brent value from `market_snapshots`
5. **Cron job logging:** Log every cron job run (success/failure, values fetched) to console — Railway captures these logs and they're invaluable for debugging
6. **Rate limiting:** Add `express-rate-limit` to the `/api/live/:ticker` endpoint to prevent abuse

---

### Phase 7 — Visual Polish

**Goal:** Make it look like something you'd share.

1. Dark color scheme — deep navy or near-black background (`#0a0e1a` or similar)
2. Crisis-red accent color for negative deltas, crisis-amber for warnings, muted green for positive
3. Monospace font for all numbers (suggests data precision) — use `JetBrains Mono` or `IBM Plex Mono` (both free via Google Fonts)
4. Large, bold deficit counter — this should be readable from across the room
5. Subtle grid lines and panel borders — enough to organize, not enough to clutter
6. Mobile-responsive layout — stack panels vertically on small screens
7. Favicon and page title: "Hormuz Crisis Tracker"
8. "Data sources" footer: list EIA, IEA, Yahoo Finance, FRED, Drewry, DAT, MarineTraffic

---

## Appendix: Key Reference Numbers

| Figure | Value | Source | Date |
|---|---|---|---|
| Pre-crisis Brent price | $71/bbl | EIA STEO March 2026 | Feb 27, 2026 |
| Brent price March 9 | $94/bbl | EIA STEO March 2026 | Mar 9, 2026 |
| Strait daily throughput | 20 mb/d | EIA 2024 annual average | Pre-crisis |
| Crude stranded daily | 15 mb/d | IEA Director statement | Mar 2026 |
| Products stranded daily | 5 mb/d | IEA Director statement | Mar 2026 |
| Baseline tankers/day | ~37 VLCCs | Industry estimate | Pre-crisis |
| Global refinery runs | 84.4 mb/d | IEA Dec 2025 OMR | Pre-crisis |
| % of world oil through Strait | ~20% | EIA / IEA | 2024 |
| Strikes begin | Feb 28, 2026 | Operation Epic Fury | — |
| Strait formally closed | Mar 2, 2026 | IRGC official statement | — |
| Active ship attacks begin | Mar 4, 2026 | UKMTO reports | — |
| IEA emergency release | 400 million bbl | IEA announcement | Mar 2026 |

---

## Appendix: Suggested Claude Code Session Prompts

Use these prompts to kick off each phase efficiently:

**Phase 0:**
> "Read this PRD carefully. Before writing any code, generate a companion 'for dummies' setup guide covering every step marked 🔧. Assume the reader has never deployed a web app. Output it as `SETUP_GUIDE.md`."

**Phase 1:**
> "We're building the Hormuz Crisis Tracker per this PRD. Start Phase 1: scaffold the full project folder structure, initialize npm, install all listed dependencies, create the `.env.example` file, and create a minimal Express server that returns 'ok' at GET /health. Do not write any cron or data logic yet."

**Phase 2:**
> "Phase 2: Write the database migration SQL and the baseline seed script. Before seeding, fetch the actual Feb 27, 2026 closing prices for each ticker listed in the baselines section using Yahoo Finance historical data to verify the hardcoded values. Run the migration and seed against the database."

**Phase 3:**
> "Phase 3: Build the cron jobs and API routes. Start with the EIA fetcher (3a), then the deficit calculator (3d), then the API endpoints (3e). Leave AIS scraping and logistics scrapers for last — they're the most fragile."

**Phase 4:**
> "Phase 4: Build the frontend. Use the layout spec in the PRD. Keep the HTML/CSS/JS in separate files under client/. Use Chart.js for the two deficit charts. Implement the delta calculation for every metric using the baselines from /api/baselines."

**Phase 5:**
> "Phase 5: Prepare the app for Railway deployment. Check the package.json start script, confirm .gitignore is correct, and walk me through pushing to GitHub and triggering the first Railway deploy."
