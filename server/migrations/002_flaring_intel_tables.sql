CREATE TABLE IF NOT EXISTS flaring_data (
  id SERIAL PRIMARY KEY,
  region_key VARCHAR(50) NOT NULL,
  date DATE NOT NULL,
  frp_sum DECIMAL,                   -- total Fire Radiative Power (MW) for this region/date; NULL if fetch failed
  hotspot_count INTEGER,             -- number of VIIRS detections (confidence != 'low')
  rolling_avg_7d DECIMAL,            -- 7-day rolling average FRP; computed on insert
  baseline_frp DECIMAL,              -- pre-crisis baseline FRP for this region (stored for convenience)
  pct_of_baseline DECIMAL,           -- (frp_sum / baseline_frp) * 100; NULL if baseline not yet set
  data_source VARCHAR(20) DEFAULT 'NRT',  -- 'NRT' (near-real-time) or 'SP' (archive)
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(region_key, date)
);

CREATE TABLE IF NOT EXISTS flaring_baselines (
  region_key VARCHAR(50) PRIMARY KEY,
  baseline_frp DECIMAL NOT NULL,         -- mean daily FRP over Feb 1-27, 2026
  baseline_hotspot_avg DECIMAL,
  baseline_date_start DATE DEFAULT '2026-02-01',
  baseline_date_end DATE DEFAULT '2026-02-27',
  notes TEXT
);

CREATE TABLE IF NOT EXISTS intelligence_feed (
  id SERIAL PRIMARY KEY,
  source VARCHAR(100) NOT NULL,
  source_url TEXT,
  headline TEXT NOT NULL,
  summary TEXT,
  metric_extracted TEXT,             -- e.g. '3.2 mb/d' if parseable from text
  published_at TIMESTAMP,
  fetched_at TIMESTAMP DEFAULT NOW(),
  category VARCHAR(20),              -- PRODUCTION / SHIPPING / STORAGE / POLICY / MARKETS
  relevance_score INTEGER DEFAULT 1,
  is_duplicate BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flaring_region_date ON flaring_data (region_key, date);
CREATE INDEX IF NOT EXISTS idx_intel_fetched ON intelligence_feed (fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_intel_category ON intelligence_feed (category);
