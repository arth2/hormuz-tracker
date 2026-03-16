require('dotenv').config();
const axios = require('axios');
const db = require('../db');

// ─── Region definitions ────────────────────────────────────────────────────
const FLARING_REGIONS = [
  {
    key: 'iraq_south',
    label: 'Iraq — Southern Fields',
    sublabel: 'Rumaila, West Qurna, Zubair, Majnoon',
    bbox: '46.8,29.5,48.5,31.5',
    weight: 4.2,    // pre-crisis production mb/d
    contextNote: null,
  },
  {
    key: 'kuwait',
    label: 'Kuwait',
    sublabel: 'Greater Burgan, Minagish, Wafra',
    bbox: '46.8,28.3,48.5,29.8',
    weight: 1.7,
    contextNote: null,
  },
  {
    key: 'uae_adco',
    label: 'UAE — Abu Dhabi',
    sublabel: 'Bu Hasa, Asab, Murban, Bab (ADCO concession)',
    bbox: '52.5,22.5,54.5,24.5',
    weight: 2.8,
    contextNote: 'Approximately 1.5 mb/d can bypass via the Habshan–Fujairah pipeline; the remainder is Strait-dependent.',
  },
  {
    key: 'saudi_eastern',
    label: 'Saudi Arabia — Eastern Province',
    sublabel: 'Ghawar, Abqaiq, Khurais, Safaniya',
    bbox: '48.0,23.5,51.5,27.5',
    weight: 6.0,
    contextNote: 'Saudi Arabia can reroute some output via the East–West (Petroline) pipeline to Yanbu on the Red Sea. Approximately 4 mb/d remains Strait-dependent.',
  },
  {
    key: 'iran_khuzestan',
    label: 'Iran — Khuzestan Province',
    sublabel: 'Ahwaz-Asmari, Gachsaran, Marun, Agha Jari',
    bbox: '48.5,29.5,52.5,32.5',
    weight: 2.8,
    contextNote: 'Iran initiated the Strait closure but cannot export via the Strait either. Declining flaring here reflects the economic pressure Iran is absorbing from the disruption it created.',
  },
  {
    key: 'qatar',
    label: 'Qatar',
    sublabel: 'Dukhan oil field, North Dome / South Pars condensate',
    bbox: '50.2,24.5,52.0,26.2',
    weight: 0.6,
    contextNote: 'Qatar\'s primary exports are LNG, all of which transit the Strait. Oil and condensate volumes are smaller but visible in flaring data.',
  },
];

const GULF_INDEX_TOTAL_WEIGHT = FLARING_REGIONS.reduce((s, r) => s + r.weight, 0); // 18.1

module.exports.FLARING_REGIONS = FLARING_REGIONS;
module.exports.GULF_INDEX_TOTAL_WEIGHT = GULF_INDEX_TOTAL_WEIGHT;

// ─── CSV parser (VIIRS response) ───────────────────────────────────────────
function parseVIIRSCsv(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const cols = line.split(',');
    return headers.reduce((obj, h, i) => { obj[h] = (cols[i] || '').trim(); return obj; }, {});
  }).filter(r => r.latitude);
}

// ─── Main cron function ────────────────────────────────────────────────────
async function runFlaring() {
  if (!process.env.FIRMS_MAP_KEY || process.env.FIRMS_MAP_KEY === 'your_key_here') {
    console.log('[flaring] No FIRMS_MAP_KEY configured, skipping');
    return;
  }

  const today = new Date().toISOString().split('T')[0];
  console.log(`[flaring] Starting run for ${today}`);

  for (const region of FLARING_REGIONS) {
    try {
      // Fetch last 2 days NRT — buffers for processing lag
      const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${process.env.FIRMS_MAP_KEY}/VIIRS_SNPP_NRT/${region.bbox}/2`;
      const response = await axios.get(url, {
        timeout: 20000,
        headers: { 'User-Agent': 'HormuzTracker/1.0' }
      });

      const rows = parseVIIRSCsv(response.data)
        .filter(r => r.confidence !== 'low')
        .filter(r => r.acq_date === today)
        .filter(r => parseFloat(r.frp) > 0);

      const frp_sum = rows.reduce((s, r) => s + parseFloat(r.frp), 0);
      const hotspot_count = rows.length;

      // Fetch stored baseline
      const blRow = await db.query(
        'SELECT baseline_frp FROM flaring_baselines WHERE region_key = $1',
        [region.key]
      );
      const baseline_frp = blRow.rows[0]?.baseline_frp ?? null;
      const pct_of_baseline = (baseline_frp && frp_sum > 0) ? (frp_sum / parseFloat(baseline_frp)) * 100 : null;

      // 7-day rolling average (use last 6 stored days + today)
      const recentRows = await db.query(`
        SELECT frp_sum FROM flaring_data
        WHERE region_key = $1 AND frp_sum IS NOT NULL AND date >= CURRENT_DATE - INTERVAL '7 days'
        ORDER BY date DESC LIMIT 6
      `, [region.key]);
      const pastFRPs = recentRows.rows.map(r => parseFloat(r.frp_sum));
      const allFRPs = frp_sum > 0 ? [frp_sum, ...pastFRPs] : pastFRPs;
      const rolling_avg_7d = allFRPs.length > 0 ? allFRPs.reduce((a, b) => a + b, 0) / allFRPs.length : null;

      await db.query(`
        INSERT INTO flaring_data
          (region_key, date, frp_sum, hotspot_count, rolling_avg_7d, baseline_frp, pct_of_baseline, data_source)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'NRT')
        ON CONFLICT (region_key, date) DO UPDATE SET
          frp_sum = EXCLUDED.frp_sum,
          hotspot_count = EXCLUDED.hotspot_count,
          rolling_avg_7d = EXCLUDED.rolling_avg_7d,
          pct_of_baseline = EXCLUDED.pct_of_baseline
      `, [region.key, today, frp_sum > 0 ? frp_sum : null, hotspot_count > 0 ? hotspot_count : null,
          rolling_avg_7d, baseline_frp, pct_of_baseline]);

      console.log(`[flaring] ${region.key} ${today}: ${frp_sum.toFixed(1)}MW (${hotspot_count} pts), ${pct_of_baseline?.toFixed(1) ?? '—'}% of baseline`);

    } catch (err) {
      console.error(`[flaring] ${region.key} failed: ${err.message}`);
      // Store NULL row so we know this date was attempted
      await db.query(`
        INSERT INTO flaring_data (region_key, date, data_source)
        VALUES ($1, $2, 'NRT')
        ON CONFLICT (region_key, date) DO NOTHING
      `, [region.key, today]);
    }
  }
}

module.exports.runFlaring = runFlaring;

// Allow direct execution for testing
if (require.main === module) runFlaring().then(() => process.exit(0));
