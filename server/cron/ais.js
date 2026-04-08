const axios = require('axios');
const cheerio = require('cheerio');
const db = require('../db');

// Common pagination page sizes — if we get one of these, it's likely an artifact
const SUSPICIOUS_PAGE_SIZES = new Set([10, 15, 20, 25, 30, 50, 100]);

async function runAIS() {
  console.log(`[ais] Starting AIS tanker scrape at ${new Date().toISOString()}`);
  const today = new Date().toISOString().split('T')[0];

  try {
    // VesselFinder's /vessels page does NOT support geographic filtering via URL params.
    // The minlat/maxlat/minlon/maxlon params are ignored — the page always returns global results.
    // We scrape it anyway and try to extract a total tanker count from the page, but this is
    // a global count, not Strait-specific. Free AIS geographic data requires paid API access.
    const url = 'https://www.vesselfinder.com/vessels?type=6';
    const response = await axios.get(url, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });

    const $ = cheerio.load(response.data);
    let tankerCount = null;

    // Try to find the global tanker count from page text (e.g., "26,040 ships")
    const bodyText = $('body').text();
    const globalCountMatch = bodyText.match(/([\d,]+)\s*ships?/i);
    if (globalCountMatch) {
      const globalCount = parseInt(globalCountMatch[1].replace(/,/g, ''), 10);
      console.log(`[ais] VesselFinder reports ${globalCount} tankers globally (not Strait-specific)`);
    }

    // Count actual vessel rows on the page
    const rowCount = $('table tbody tr').length;
    if (rowCount > 0) {
      // Sanity check: if this matches a common page size, it's a pagination artifact
      if (SUSPICIOUS_PAGE_SIZES.has(rowCount)) {
        console.log(`[ais] Row count ${rowCount} matches common page size — likely pagination artifact, storing NULL`);
        tankerCount = null;
      } else {
        tankerCount = rowCount;
        console.log(`[ais] Found ${tankerCount} vessel rows (unusual count, may be valid)`);
      }
    }

    // NOTE: Without a paid AIS API key (VesselFinder, MarineTraffic, etc.), we cannot
    // get geographic vessel counts for the Strait of Hormuz. When tankerCount is NULL,
    // the deficit calculator falls back to EIA-only throughput estimation (100% weight on
    // U.S. crude production data instead of the 70/30 EIA/AIS blend).
    if (tankerCount === null) {
      console.log('[ais] No reliable Strait-specific AIS data available, storing NULL');
      console.log('[ais] Deficit calculator will use EIA-only fallback');
    }

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
