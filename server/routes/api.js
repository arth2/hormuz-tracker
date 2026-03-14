const express = require('express');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const db = require('../db');

const router = express.Router();

// Rate limit for live ticker endpoints
const liveTickerLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many requests, try again in a minute' },
});

// === PRICE CACHE (10-minute TTL) ===
const CACHE_TTL_MS = 10 * 60 * 1000;
const priceCache = new Map(); // ticker -> { price, timestamp }

// Yahoo Finance ticker → Twelve Data symbol mapping
const YAHOO_TO_TWELVEDATA = {
  // Oil & Energy futures
  'CL=F':      'CL',
  'BZ=F':      'BZ',
  'NG=F':      'NG',
  'RB=F':      'RB',
  'HO=F':      'HO',
  // Equity indices
  '^GSPC':     'SPX',
  '^IXIC':     'IXIC',
  '^DJI':      'DJI',
  '^FTSE':     'UKXGBP',
  '^GDAXI':    'GDAXI',
  '^N225':     'NI225',
  '000001.SS': '000001',
  '^KS11':     'KS11',
  '^NSEI':     'NSEI',
  // Metals & Agriculture (XAU/USD = gold spot $/oz; GC could resolve to wrong instrument)
  'GC=F':      'XAU/USD',
  'SI=F':      'SI',
  'HG=F':      'HG',
  'PA=F':      'PA',
  'ZW=F':      'ZW',
  'ZC=F':      'ZC',
  'ZS=F':      'ZS',
  // Crypto
  'BTC-USD':   'BTC/USD',
  'ETH-USD':   'ETH/USD',
};

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

// === PRICE FETCHERS ===

// Try Twelve Data API (works from cloud IPs)
async function fetchTwelveDataPrice(ticker) {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) return null;

  const tdSymbol = YAHOO_TO_TWELVEDATA[ticker];
  if (!tdSymbol) return null;

  try {
    const res = await axios.get('https://api.twelvedata.com/price', {
      params: { symbol: tdSymbol, apikey: apiKey },
      timeout: 8000,
    });
    const price = parseFloat(res.data?.price);
    if (!isNaN(price) && price > 0) return price;
  } catch {
    // fall through
  }
  return null;
}

// Try Yahoo Finance (works from residential IPs / local dev)
async function fetchYahooPrice(ticker) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json',
  };

  for (const domain of ['query2.finance.yahoo.com', 'query1.finance.yahoo.com']) {
    try {
      const response = await axios.get(
        `https://${domain}/v8/finance/chart/${ticker}`,
        { timeout: 8000, headers }
      );
      const result = response.data?.chart?.result?.[0];
      if (result) return result.meta.regularMarketPrice;
    } catch {
      continue;
    }
  }
  return null;
}

// Fetch price with fallback chain: Twelve Data → Yahoo Finance
async function fetchTickerPrice(ticker) {
  // Check cache first
  const cached = priceCache.get(ticker);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
    return cached.price;
  }

  // Try Twelve Data first (works from cloud)
  let price = await fetchTwelveDataPrice(ticker);

  // Fallback to Yahoo (works from residential IPs)
  if (price === null) {
    price = await fetchYahooPrice(ticker);
  }

  // Cache result if we got a price
  if (price !== null) {
    priceCache.set(ticker, { price, timestamp: Date.now() });
  }

  return price;
}

// GET /api/live/batch — fetch all tickers in one request
router.get('/live/batch', liveTickerLimiter, async (req, res) => {
  try {
    const allTickers = Object.keys(YAHOO_TO_TWELVEDATA);
    const prices = {};
    let oldestTimestamp = Date.now();

    // Check which tickers need refreshing
    const stale = [];
    for (const ticker of allTickers) {
      const cached = priceCache.get(ticker);
      if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
        prices[ticker] = { price: cached.price, timestamp: cached.timestamp };
        if (cached.timestamp < oldestTimestamp) oldestTimestamp = cached.timestamp;
      } else {
        stale.push(ticker);
      }
    }

    // Fetch stale tickers via Twelve Data batch (up to 8 per call)
    if (stale.length > 0) {
      const apiKey = process.env.TWELVE_DATA_API_KEY;
      if (apiKey) {
        // Twelve Data supports batch: comma-separated symbols
        const tdSymbols = stale
          .map(t => YAHOO_TO_TWELVEDATA[t])
          .filter(Boolean);

        // Fetch in chunks of 8 (Twelve Data rate limit)
        for (let i = 0; i < tdSymbols.length; i += 8) {
          const chunk = tdSymbols.slice(i, i + 8);
          try {
            const batchRes = await axios.get('https://api.twelvedata.com/price', {
              params: { symbol: chunk.join(','), apikey: apiKey },
              timeout: 15000,
            });

            // Single symbol returns { price: "X" }, multiple returns { SYM: { price: "X" } }
            const data = batchRes.data;
            if (chunk.length === 1) {
              const price = parseFloat(data?.price);
              if (!isNaN(price) && price > 0) {
                const yahooTicker = stale[i];
                priceCache.set(yahooTicker, { price, timestamp: Date.now() });
                prices[yahooTicker] = { price, timestamp: Date.now() };
              }
            } else {
              for (const [tdSym, val] of Object.entries(data)) {
                const price = parseFloat(val?.price);
                if (!isNaN(price) && price > 0) {
                  // Reverse lookup: find Yahoo ticker for this TD symbol
                  const yahooTicker = Object.entries(YAHOO_TO_TWELVEDATA)
                    .find(([, td]) => td === tdSym)?.[0];
                  if (yahooTicker) {
                    priceCache.set(yahooTicker, { price, timestamp: Date.now() });
                    prices[yahooTicker] = { price, timestamp: Date.now() };
                  }
                }
              }
            }
          } catch (err) {
            console.error('[api] Twelve Data batch fetch error:', err.message);
          }

          // Small delay between chunks to respect rate limits
          if (i + 8 < tdSymbols.length) {
            await new Promise(r => setTimeout(r, 1000));
          }
        }
      }

      // Any still-missing tickers: try Yahoo as fallback
      for (const ticker of stale) {
        if (!prices[ticker]) {
          const price = await fetchYahooPrice(ticker);
          if (price !== null) {
            priceCache.set(ticker, { price, timestamp: Date.now() });
            prices[ticker] = { price, timestamp: Date.now() };
          }
        }
      }
    }

    const cacheAge = Math.floor((Date.now() - oldestTimestamp) / 1000);
    res.json({ prices, cacheAge });
  } catch (err) {
    console.error('[api] /live/batch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch batch prices' });
  }
});

// GET /api/live/:ticker — single ticker (kept for backward compatibility + deficit refresh)
router.get('/live/:ticker', liveTickerLimiter, async (req, res) => {
  try {
    const ticker = req.params.ticker;
    const price = await fetchTickerPrice(ticker);
    if (price !== null) {
      res.json({ ticker, price, timestamp: new Date() });
    } else {
      console.error(`[api] /live/${ticker}: all price sources failed`);
      res.status(502).json({ error: 'Failed to fetch live price' });
    }
  } catch (err) {
    console.error(`[api] /live/${req.params.ticker} error:`, err.message);
    res.status(502).json({ error: 'Failed to fetch live price' });
  }
});

// GET /api/status — configuration status
router.get('/status', (req, res) => {
  const eiaKey = process.env.EIA_API_KEY;
  const tdKey = process.env.TWELVE_DATA_API_KEY;
  res.json({
    eia_configured: !!(eiaKey && eiaKey !== 'your_key_here'),
    twelvedata_configured: !!tdKey,
  });
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
