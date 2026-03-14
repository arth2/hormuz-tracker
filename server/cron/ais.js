const axios = require('axios');
const cheerio = require('cheerio');
const db = require('../db');

async function runAIS() {
  console.log(`[ais] Starting AIS tanker scrape at ${new Date().toISOString()}`);
  const today = new Date().toISOString().split('T')[0];

  try {
    const url = 'https://www.vesselfinder.com/vessels?type=6&minlat=25.5&maxlat=27&minlon=55.5&maxlon=57';
    const response = await axios.get(url, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });

    const $ = cheerio.load(response.data);

    // Try multiple selectors to find vessel count
    let tankerCount = null;

    // Look for result count in common patterns
    const resultText = $('.results-count, .result-count, .vessels-count, .total-count, h1, .search-results-header').text();
    const countMatch = resultText.match(/(\d+)\s*(vessel|tanker|result|ship)/i);
    if (countMatch) {
      tankerCount = parseInt(countMatch[1], 10);
    }

    // Fallback: count vessel rows in table
    if (tankerCount === null) {
      const rows = $('table tbody tr, .vessel-row, .vessel-item, .ship-item').length;
      if (rows > 0) {
        tankerCount = rows;
      }
    }

    if (tankerCount !== null) {
      console.log(`[ais] Found ${tankerCount} tankers in Strait of Hormuz`);
    } else {
      console.log('[ais] Could not parse tanker count from page, storing null');
    }

    // Upsert into daily_deficit (just the AIS count for now)
    await db.query(
      `INSERT INTO daily_deficit (date, ais_tanker_count)
       VALUES ($1, $2)
       ON CONFLICT (date) DO UPDATE SET
         ais_tanker_count = EXCLUDED.ais_tanker_count`,
      [today, tankerCount]
    );

    console.log(`[ais] Completed at ${new Date().toISOString()}`);
  } catch (err) {
    console.error(`[ais] Scrape failed:`, err.message);

    // Store null for today so deficit calculator knows AIS is unavailable
    await db.query(
      `INSERT INTO daily_deficit (date, ais_tanker_count)
       VALUES ($1, NULL)
       ON CONFLICT (date) DO UPDATE SET
         ais_tanker_count = NULL`,
      [today]
    ).catch(e => console.error('[ais] DB fallback write failed:', e.message));

    console.log('[ais] Stored null, deficit calculator will use EIA-only fallback');
  }
}

module.exports = { runAIS };
