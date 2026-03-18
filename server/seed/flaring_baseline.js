require('dotenv').config();
const axios = require('axios');
const db = require('../db');
const { FLARING_REGIONS } = require('../cron/flaring');

// CSV parser — inline, avoids dependency for seed script
function parseVIIRSCsv(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const cols = line.split(',');
    return headers.reduce((obj, h, i) => { obj[h] = (cols[i] || '').trim(); return obj; }, {});
  }).filter(r => r.latitude); // skip empty rows
}

async function fetchArchive(bbox) {
  // FIRMS API area query with date range
  // Format: /api/area/csv/{MAP_KEY}/{source}/{area}/{day_range}/{date}
  // date = YYYY-MM-DD of the start date; day_range = number of days
  const archiveUrl = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${process.env.FIRMS_MAP_KEY}/VIIRS_SNPP_SP/${bbox}/27/2026-02-01`;
  console.log(`[seed/flaring] Fetching: ${archiveUrl.replace(process.env.FIRMS_MAP_KEY, '***')}`);
  try {
    const response = await axios.get(archiveUrl, {
      timeout: 60000,
      headers: { 'User-Agent': 'HormuzTracker/1.0' }
    });
    return parseVIIRSCsv(response.data);
  } catch (err) {
    // Log response body for debugging 400/403 errors
    if (err.response) {
      console.error(`[seed/flaring] FIRMS API error ${err.response.status}: ${JSON.stringify(err.response.data).substring(0, 500)}`);
    }
    throw err;
  }
}

async function seedBaseline() {
  if (!process.env.FIRMS_MAP_KEY || process.env.FIRMS_MAP_KEY === 'your_key_here') {
    console.error('[seed/flaring] FIRMS_MAP_KEY not configured. Exiting.');
    return;
  }

  for (const region of FLARING_REGIONS) {
    console.log(`[seed/flaring] Processing ${region.key}...`);
    try {
      const rows = await fetchArchive(region.bbox);

      // Filter: exclude low confidence; include all types
      const valid = rows.filter(r => r.confidence !== 'low' && r.frp);

      // Aggregate by date
      const byDate = {};
      valid.forEach(r => {
        if (!byDate[r.acq_date]) byDate[r.acq_date] = { frp: 0, count: 0 };
        byDate[r.acq_date].frp += parseFloat(r.frp);
        byDate[r.acq_date].count += 1;
      });

      const dates = Object.keys(byDate);
      if (dates.length === 0) {
        console.warn(`[seed/flaring] ${region.key}: No data returned from FIRMS archive. Check bbox and API key.`);
        continue;
      }

      // Baseline = mean FRP across all pre-crisis days with detections
      const totalFRP = dates.reduce((s, d) => s + byDate[d].frp, 0);
      const baseline_frp = totalFRP / dates.length;
      const baseline_hotspot_avg = dates.reduce((s, d) => s + byDate[d].count, 0) / dates.length;

      // Upsert baseline
      await db.query(`
        INSERT INTO flaring_baselines (region_key, baseline_frp, baseline_hotspot_avg, notes)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (region_key) DO UPDATE SET
          baseline_frp = EXCLUDED.baseline_frp,
          baseline_hotspot_avg = EXCLUDED.baseline_hotspot_avg
      `, [region.key, baseline_frp, baseline_hotspot_avg, `Seeded from ${dates.length} days of FIRMS data`]);

      console.log(`[seed/flaring] ${region.key}: baseline=${baseline_frp.toFixed(1)}MW from ${dates.length} days`);

      // Backfill flaring_data for pre-crisis dates (useful for charts)
      for (const [date, agg] of Object.entries(byDate)) {
        const pct = (agg.frp / baseline_frp) * 100;
        await db.query(`
          INSERT INTO flaring_data (region_key, date, frp_sum, hotspot_count, baseline_frp, pct_of_baseline, data_source)
          VALUES ($1, $2, $3, $4, $5, $6, 'SP')
          ON CONFLICT (region_key, date) DO NOTHING
        `, [region.key, date, agg.frp, agg.count, baseline_frp, pct]);
      }

    } catch (err) {
      console.error(`[seed/flaring] ${region.key} failed: ${err.message}`);
      // Continue to next region
    }
  }

  console.log('[seed/flaring] Done. Run "node server/seed/flaring_baseline.js" again if any regions failed.');
}

module.exports.seedBaseline = seedBaseline;

if (require.main === module) seedBaseline().then(() => process.exit(0));
