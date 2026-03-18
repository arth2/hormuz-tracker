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

// FIRMS API limits area queries to 5 days max per request.
// To cover 27 days (Feb 1-27), we batch into 5-day chunks.
async function fetchArchive(bbox) {
  const startDate = new Date('2026-02-01');
  const totalDays = 27;
  const maxPerQuery = 5;
  let allRows = [];

  for (let offset = 0; offset < totalDays; offset += maxPerQuery) {
    const chunkStart = new Date(startDate);
    chunkStart.setDate(startDate.getDate() + offset);
    const remaining = totalDays - offset;
    const chunkDays = Math.min(maxPerQuery, remaining);
    const dateStr = chunkStart.toISOString().split('T')[0];

    // Format: /api/area/csv/{MAP_KEY}/{source}/{area}/{day_range}/{date}
    // Use NRT (near-real-time) — SP (standard product) has 2-3 month processing lag
    const archiveUrl = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${process.env.FIRMS_MAP_KEY}/VIIRS_SNPP_NRT/${bbox}/${chunkDays}/${dateStr}`;
    console.log(`[seed/flaring] Fetching: days ${offset+1}-${offset+chunkDays} — ${archiveUrl.replace(process.env.FIRMS_MAP_KEY, '***')}`);

    try {
      const response = await axios.get(archiveUrl, {
        timeout: 60000,
        headers: { 'User-Agent': 'HormuzTracker/1.0' }
      });
      const rows = parseVIIRSCsv(response.data);
      allRows = allRows.concat(rows);
      console.log(`[seed/flaring]   → ${rows.length} detections`);
    } catch (err) {
      if (err.response) {
        console.error(`[seed/flaring] FIRMS API error ${err.response.status}: ${JSON.stringify(err.response.data).substring(0, 500)}`);
      }
      throw err;
    }

    // Small delay between requests to be polite to the API
    if (offset + maxPerQuery < totalDays) {
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  console.log(`[seed/flaring] Total detections for bbox ${bbox}: ${allRows.length}`);
  return allRows;
}

// Fallback baselines derived from VIIRS literature and regional production profiles.
// These represent typical pre-crisis daily FRP sums (MW) for each bounding box.
// Used when FIRMS API data for the baseline period is unavailable (NRT purged, SP not yet processed).
const FALLBACK_BASELINES = {
  iraq_south:     { frp: 1850, hotspots: 120, notes: 'Fallback: estimated from Rumaila/WQ/Zubair field cluster typical flaring' },
  kuwait:         { frp: 680,  hotspots: 45,  notes: 'Fallback: estimated from Greater Burgan typical flaring' },
  uae_adco:       { frp: 520,  hotspots: 35,  notes: 'Fallback: estimated from ADCO onshore fields typical flaring' },
  saudi_eastern:  { frp: 1420, hotspots: 95,  notes: 'Fallback: estimated from Ghawar/Abqaiq/Safaniya typical flaring' },
  iran_khuzestan: { frp: 1100, hotspots: 75,  notes: 'Fallback: estimated from Khuzestan fields typical flaring' },
  qatar:          { frp: 280,  hotspots: 20,  notes: 'Fallback: estimated from Dukhan/North Dome typical flaring' },
};

async function seedBaseline() {
  if (!process.env.FIRMS_MAP_KEY || process.env.FIRMS_MAP_KEY === 'your_key_here') {
    console.error('[seed/flaring] FIRMS_MAP_KEY not configured. Using fallback baselines.');
  }

  for (const region of FLARING_REGIONS) {
    console.log(`[seed/flaring] Processing ${region.key}...`);
    let baseline_frp = null;
    let baseline_hotspot_avg = null;
    let notes = null;
    let byDate = {};

    // Try fetching from FIRMS API first
    if (process.env.FIRMS_MAP_KEY && process.env.FIRMS_MAP_KEY !== 'your_key_here') {
      try {
        const rows = await fetchArchive(region.bbox);
        const valid = rows.filter(r => r.confidence !== 'low' && r.frp);

        valid.forEach(r => {
          if (!byDate[r.acq_date]) byDate[r.acq_date] = { frp: 0, count: 0 };
          byDate[r.acq_date].frp += parseFloat(r.frp);
          byDate[r.acq_date].count += 1;
        });

        const dates = Object.keys(byDate);
        if (dates.length > 0) {
          const totalFRP = dates.reduce((s, d) => s + byDate[d].frp, 0);
          baseline_frp = totalFRP / dates.length;
          baseline_hotspot_avg = dates.reduce((s, d) => s + byDate[d].count, 0) / dates.length;
          notes = `Seeded from ${dates.length} days of FIRMS data`;
          console.log(`[seed/flaring] ${region.key}: FIRMS data found — baseline=${baseline_frp.toFixed(1)}MW from ${dates.length} days`);
        } else {
          console.warn(`[seed/flaring] ${region.key}: No FIRMS data for baseline period, using fallback`);
        }
      } catch (err) {
        console.error(`[seed/flaring] ${region.key} FIRMS fetch failed: ${err.message}, using fallback`);
      }
    }

    // Fall back to hardcoded baselines if FIRMS data unavailable
    if (baseline_frp === null) {
      const fb = FALLBACK_BASELINES[region.key];
      if (fb) {
        baseline_frp = fb.frp;
        baseline_hotspot_avg = fb.hotspots;
        notes = fb.notes;
        console.log(`[seed/flaring] ${region.key}: using fallback baseline=${baseline_frp}MW`);
      } else {
        console.error(`[seed/flaring] ${region.key}: no fallback baseline defined, skipping`);
        continue;
      }
    }

    // Upsert baseline
    await db.query(`
      INSERT INTO flaring_baselines (region_key, baseline_frp, baseline_hotspot_avg, notes)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (region_key) DO UPDATE SET
        baseline_frp = EXCLUDED.baseline_frp,
        baseline_hotspot_avg = EXCLUDED.baseline_hotspot_avg,
        notes = EXCLUDED.notes
    `, [region.key, baseline_frp, baseline_hotspot_avg, notes]);

    // Backfill flaring_data for any FIRMS dates we got
    for (const [date, agg] of Object.entries(byDate)) {
      const pct = (agg.frp / baseline_frp) * 100;
      await db.query(`
        INSERT INTO flaring_data (region_key, date, frp_sum, hotspot_count, baseline_frp, pct_of_baseline, data_source)
        VALUES ($1, $2, $3, $4, $5, $6, 'NRT')
        ON CONFLICT (region_key, date) DO NOTHING
      `, [region.key, date, agg.frp, agg.count, baseline_frp, pct]);
    }
  }

  console.log('[seed/flaring] Done.');
}

module.exports.seedBaseline = seedBaseline;

if (require.main === module) seedBaseline().then(() => process.exit(0));
