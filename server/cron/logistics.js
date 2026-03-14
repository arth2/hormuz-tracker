const axios = require('axios');
const cheerio = require('cheerio');
const db = require('../db');

const FRED_SERIES = [
  { key: 'brent_fred_confirm',        fredId: 'DCOILBRENTEU',  unit: '$/bbl' },
];

async function fetchFRED() {
  console.log('[logistics] Fetching FRED series...');

  for (const series of FRED_SERIES) {
    try {
      const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${series.fredId}`;
      const response = await axios.get(url, { timeout: 10000 });
      const lines = response.data.trim().split('\n');

      // Find last non-empty value (skip header, work backwards)
      let date = null;
      let value = null;
      for (let i = lines.length - 1; i >= 1; i--) {
        const parts = lines[i].split(',');
        if (parts.length >= 2 && parts[1] !== '.' && parts[1] !== '') {
          date = parts[0];
          value = parseFloat(parts[1]);
          break;
        }
      }

      if (date && value !== null && !isNaN(value)) {
        await db.query(
          `INSERT INTO market_snapshots (metric_key, metric_date, value, unit, source)
           VALUES ($1, $2, $3, $4, 'fred')
           ON CONFLICT (metric_key, metric_date) DO UPDATE SET
             value = EXCLUDED.value`,
          [series.key, date, value, series.unit]
        );
        console.log(`[logistics] ${series.key}: ${value} ${series.unit} (${date})`);
      } else {
        console.log(`[logistics] ${series.key}: no valid data found in CSV`);
      }
    } catch (err) {
      console.error(`[logistics] FRED ${series.key} failed:`, err.message);
    }
  }
}

async function fetchDrewry() {
  console.log('[logistics] Fetching Drewry WCI...');
  try {
    const url = 'https://www.drewry.co.uk/supply-chain-advisors/supply-chain-expertise/world-container-index-assessed-by-drewry';
    const response = await axios.get(url, {
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    const $ = cheerio.load(response.data);

    // Look for the composite WCI number ($/FEU)
    let wciValue = null;
    const pageText = $('body').text();
    const match = pageText.match(/\$\s*([\d,]+(?:\.\d+)?)\s*(?:per\s+)?(?:40|FEU|forty)/i)
      || pageText.match(/composite[:\s]*\$?\s*([\d,]+(?:\.\d+)?)/i);

    if (match) {
      wciValue = parseFloat(match[1].replace(/,/g, ''));
    }

    if (wciValue !== null && !isNaN(wciValue)) {
      const today = new Date().toISOString().split('T')[0];
      await db.query(
        `INSERT INTO market_snapshots (metric_key, metric_date, value, unit, source)
         VALUES ('drewry_wci', $1, $2, '$/FEU', 'drewry')
         ON CONFLICT (metric_key, metric_date) DO UPDATE SET
           value = EXCLUDED.value`,
        [today, wciValue]
      );
      console.log(`[logistics] drewry_wci: $${wciValue}/FEU`);
    } else {
      console.log('[logistics] Could not parse Drewry WCI value');
    }
  } catch (err) {
    console.error('[logistics] Drewry scrape failed:', err.message);
  }
}

async function runLogistics() {
  console.log(`[logistics] Starting logistics fetch at ${new Date().toISOString()}`);
  await fetchFRED();
  await fetchDrewry();
  console.log(`[logistics] Completed at ${new Date().toISOString()}`);
}

module.exports = { runLogistics };
