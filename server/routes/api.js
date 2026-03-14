const express = require('express');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const db = require('../db');

const router = express.Router();

// Rate limit for Yahoo Finance proxy
const liveTickerLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many requests, try again in a minute' },
});

// GET /api/deficit/current
router.get('/deficit/current', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM daily_deficit ORDER BY date DESC LIMIT 1`
    );
    res.json(result.rows[0] || null);
  } catch (err) {
    console.error('[api] /deficit/current error:', err.message);
    res.status(500).json({ error: 'Failed to fetch deficit data' });
  }
});

// GET /api/deficit/history
router.get('/deficit/history', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM daily_deficit
       WHERE date >= '2026-02-28'
       ORDER BY date ASC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[api] /deficit/history error:', err.message);
    res.status(500).json({ error: 'Failed to fetch deficit history' });
  }
});

// GET /api/snapshots/all — one row per metric_key (most recent value)
router.get('/snapshots/all', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT DISTINCT ON (metric_key) metric_key, metric_date, value, unit, source
       FROM market_snapshots
       ORDER BY metric_key, metric_date DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[api] /snapshots/all error:', err.message);
    res.status(500).json({ error: 'Failed to fetch snapshots' });
  }
});

// GET /api/snapshots/:key
router.get('/snapshots/:key', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM market_snapshots
       WHERE metric_key = $1
       ORDER BY metric_date DESC LIMIT 1`,
      [req.params.key]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Metric not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(`[api] /snapshots/${req.params.key} error:`, err.message);
    res.status(500).json({ error: 'Failed to fetch snapshot' });
  }
});

// GET /api/baselines
router.get('/baselines', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM baselines ORDER BY metric_key');
    res.json(result.rows);
  } catch (err) {
    console.error('[api] /baselines error:', err.message);
    res.status(500).json({ error: 'Failed to fetch baselines' });
  }
});

// GET /api/live/:ticker — Yahoo Finance proxy with multiple fallback endpoints
async function fetchYahooPrice(ticker) {
  const endpoints = [
    `https://query2.finance.yahoo.com/v8/finance/chart/${ticker}`,
    `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`,
  ];
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json',
  };

  for (const url of endpoints) {
    try {
      const response = await axios.get(url, { timeout: 8000, headers });
      const result = response.data?.chart?.result?.[0];
      if (result) {
        return result.meta.regularMarketPrice;
      }
    } catch {
      continue;
    }
  }

  // Final fallback: try Yahoo Finance download CSV (delayed quotes)
  try {
    const csvUrl = `https://query1.finance.yahoo.com/v7/finance/download/${ticker}?period1=${Math.floor(Date.now()/1000) - 86400*5}&period2=${Math.floor(Date.now()/1000)}&interval=1d`;
    const csvRes = await axios.get(csvUrl, { timeout: 8000, headers });
    const lines = csvRes.data.trim().split('\n');
    const lastLine = lines[lines.length - 1];
    const cols = lastLine.split(',');
    const closePrice = parseFloat(cols[4]); // Close column
    if (!isNaN(closePrice)) return closePrice;
  } catch {
    // all methods exhausted
  }

  return null;
}

router.get('/live/:ticker', liveTickerLimiter, async (req, res) => {
  try {
    const ticker = req.params.ticker;
    const price = await fetchYahooPrice(ticker);
    if (price !== null) {
      res.json({ ticker, price, timestamp: new Date() });
    } else {
      // Fall back to baseline value if available
      const baseline = await db.query(
        `SELECT baseline_value FROM baselines WHERE metric_key = (
          SELECT metric_key FROM baselines LIMIT 0
        )`
      ).catch(() => null);
      console.error(`[api] /live/${ticker}: all Yahoo endpoints failed`);
      res.status(502).json({ error: 'Failed to fetch live price' });
    }
  } catch (err) {
    console.error(`[api] /live/${req.params.ticker} error:`, err.message);
    res.status(502).json({ error: 'Failed to fetch live price' });
  }
});

// Admin manual triggers
const { runEIA } = require('../cron/eia');
const { runAIS } = require('../cron/ais');
const { runLogistics } = require('../cron/logistics');
const { calculateDeficit } = require('../cron/deficit');

router.post('/admin/run-eia', async (req, res) => {
  try {
    await runEIA();
    res.json({ status: 'ok', job: 'eia' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin/run-ais', async (req, res) => {
  try {
    await runAIS();
    res.json({ status: 'ok', job: 'ais' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin/run-logistics', async (req, res) => {
  try {
    await runLogistics();
    res.json({ status: 'ok', job: 'logistics' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin/run-deficit', async (req, res) => {
  try {
    await calculateDeficit();
    res.json({ status: 'ok', job: 'deficit' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
