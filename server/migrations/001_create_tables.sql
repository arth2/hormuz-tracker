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
