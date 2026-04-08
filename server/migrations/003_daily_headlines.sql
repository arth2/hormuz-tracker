CREATE TABLE IF NOT EXISTS daily_headlines (
  id SERIAL PRIMARY KEY,
  headline TEXT NOT NULL,
  source_article_ids INTEGER[],
  generated_at TIMESTAMP DEFAULT NOW(),
  model_used VARCHAR(50)
);

CREATE INDEX IF NOT EXISTS idx_headlines_generated ON daily_headlines (generated_at DESC);
