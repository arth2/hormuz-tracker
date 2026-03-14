const axios = require('axios');
const db = require('../db');

const BASELINE_THROUGHPUT = 20.0;       // mb/d total Strait transit
const BASELINE_TANKERS = 37;            // VLCCs/day in Strait corridor
const BASELINE_US_PRODUCTION = 13.5;    // mb/d approx pre-crisis

async function calculateDeficit() {
  console.log(`[deficit] Starting calculation at ${new Date().toISOString()}`);
  const today = new Date().toISOString().split('T')[0];

  // 1. Get most recent EIA crude production figure
  const eiaRow = await db.query(
    `SELECT value FROM market_snapshots
     WHERE metric_key = 'eia_crude_production'
     ORDER BY metric_date DESC LIMIT 1`
  );
  const eia_production_mb = eiaRow.rows[0]?.value ? parseFloat(eiaRow.rows[0].value) : null;

  // 2. Get today's AIS count (may be null if scraper failed)
  const aisRow = await db.query(
    `SELECT ais_tanker_count FROM daily_deficit
     WHERE date = $1`, [today]
  );
  const ais_count = aisRow.rows[0]?.ais_tanker_count ? parseInt(aisRow.rows[0].ais_tanker_count) : null;

  // 3. Compute blended throughput estimate
  let blended_throughput;

  if (ais_count !== null && eia_production_mb !== null) {
    const ais_fraction = ais_count / BASELINE_TANKERS;
    const eia_fraction = eia_production_mb / BASELINE_US_PRODUCTION;
    const eia_interpolated = eia_fraction * BASELINE_THROUGHPUT;
    const ais_estimate = ais_fraction * BASELINE_THROUGHPUT;
    blended_throughput = (eia_interpolated * 0.7) + (ais_estimate * 0.3);
  } else if (eia_production_mb !== null) {
    const eia_fraction = eia_production_mb / BASELINE_US_PRODUCTION;
    blended_throughput = eia_fraction * BASELINE_THROUGHPUT;
  } else {
    // No data — use previous day's throughput estimate
    const prevRow = await db.query(
      `SELECT estimated_throughput_mb FROM daily_deficit
       ORDER BY date DESC LIMIT 1`
    );
    blended_throughput = prevRow.rows[0]?.estimated_throughput_mb
      ? parseFloat(prevRow.rows[0].estimated_throughput_mb)
      : BASELINE_THROUGHPUT * 0.25; // assume 75% disruption if no data
  }

  // 4. Daily deficit
  const daily_deficit_mb = BASELINE_THROUGHPUT - blended_throughput;

  // 5. Cumulative deficit
  const prevCumRow = await db.query(
    `SELECT cumulative_deficit_mb FROM daily_deficit
     ORDER BY date DESC LIMIT 1`
  );
  const prev_cumulative = prevCumRow.rows[0]?.cumulative_deficit_mb
    ? parseFloat(prevCumRow.rows[0].cumulative_deficit_mb)
    : 0;
  const cumulative_deficit_mb = prev_cumulative + daily_deficit_mb;

  // 6. Fetch live Brent for dollar value
  let brent_price;
  let brentSource = 'baseline';

  // Try Twelve Data first (works from cloud IPs)
  const tdKey = process.env.TWELVE_DATA_API_KEY;
  if (tdKey) {
    try {
      const tdRes = await axios.get('https://api.twelvedata.com/price', {
        params: { symbol: 'BZ', apikey: tdKey },
        timeout: 8000,
      });
      const price = parseFloat(tdRes.data?.price);
      if (!isNaN(price) && price > 0) {
        brent_price = price;
        brentSource = 'twelvedata';
      }
    } catch {
      // fall through
    }
  }

  // Fallback: Yahoo Finance (works from residential IPs)
  if (!brent_price) {
    const yahooHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };
    for (const domain of ['query2.finance.yahoo.com', 'query1.finance.yahoo.com']) {
      try {
        const yahooRes = await axios.get(
          `https://${domain}/v8/finance/chart/BZ=F`,
          { timeout: 5000, headers: yahooHeaders }
        );
        brent_price = yahooRes.data.chart.result[0].meta.regularMarketPrice;
        brentSource = 'yahoo';
        break;
      } catch {
        continue;
      }
    }
  }

  // Final fallback: stored value
  if (!brent_price) {
    const storedBrent = await db.query(
      `SELECT value FROM market_snapshots
       WHERE metric_key = 'brent_crude'
       ORDER BY metric_date DESC LIMIT 1`
    );
    brent_price = storedBrent.rows[0]?.value ? parseFloat(storedBrent.rows[0].value) : 71.0;
    brentSource = storedBrent.rows[0]?.value ? 'stored' : 'baseline';
  }

  // 7. Dollar value
  const cumulative_deficit_dollars = Math.round(cumulative_deficit_mb * 1_000_000 * brent_price);

  // 8. Upsert into daily_deficit
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

  const blend = ais_count !== null && eia_production_mb !== null ? 'EIA+AIS' : eia_production_mb !== null ? 'EIA-only' : 'fallback';
  console.log(`[deficit] ${today}: deficit=${daily_deficit_mb.toFixed(2)} mb/d, cumulative=${cumulative_deficit_mb.toFixed(1)} mb, $${(cumulative_deficit_dollars / 1e9).toFixed(2)}B (blend=${blend}, brent=${brentSource})`);
}

module.exports = { calculateDeficit };
