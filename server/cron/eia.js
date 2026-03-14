const axios = require('axios');
const db = require('../db');

const EIA_SERIES = [
  { key: 'eia_gasoline_national', seriesId: 'EMM_EPMR_PTE_NUS_DPG',  unit: '$/gallon', endpoint: 'pri/gnd' },
  { key: 'eia_diesel_national',   seriesId: 'EMM_EPD2D_PTE_NUS_DPM', unit: '$/gallon', endpoint: 'pri/gnd' },
  { key: 'eia_jet_fuel',          seriesId: 'EER_EPJK_PF4_RGC_DPG',  unit: '$/gallon', endpoint: 'pri/gnd' },
  { key: 'eia_heating_oil_ne',    seriesId: 'W_EPD2F_PRS_R10_DPG',   unit: '$/gallon', endpoint: 'pri/gnd' },
  { key: 'eia_crude_production',  seriesId: 'WCRFPUS2',               unit: 'mb/d',     endpoint: 'sum/sndw' },
  { key: 'eia_refinery_inputs',   seriesId: 'WCRRIUS2',               unit: 'mb/d',     endpoint: 'sum/sndw' },
];

async function fetchSeries(series, apiKey) {
  const url = `https://api.eia.gov/v2/petroleum/${series.endpoint}/data/`;
  const params = {
    api_key: apiKey,
    frequency: 'weekly',
    'data[0]': 'value',
    'sort[0][column]': 'period',
    'sort[0][direction]': 'desc',
    length: 4,
    'facets[series][]': series.seriesId,
  };

  const response = await axios.get(url, { params, timeout: 10000 });
  const data = response.data?.response?.data;
  if (!data || data.length === 0) {
    throw new Error(`No data returned for ${series.key}`);
  }
  return data;
}

async function runEIA() {
  const apiKey = process.env.EIA_API_KEY;
  if (!apiKey || apiKey === 'your_key_here') {
    console.log('[eia] No EIA_API_KEY configured, skipping');
    return;
  }

  console.log(`[eia] Starting EIA fetch at ${new Date().toISOString()}`);

  for (const series of EIA_SERIES) {
    let attempts = 0;
    while (attempts < 2) {
      try {
        const data = await fetchSeries(series, apiKey);
        const latest = data[0];
        const metricDate = latest.period;
        const value = parseFloat(latest.value);

        await db.query(
          `INSERT INTO market_snapshots (metric_key, metric_date, value, unit, source)
           VALUES ($1, $2, $3, $4, 'eia')
           ON CONFLICT (metric_key, metric_date) DO UPDATE SET
             value = EXCLUDED.value`,
          [series.key, metricDate, value, series.unit]
        );

        console.log(`[eia] ${series.key}: ${value} ${series.unit} (${metricDate})`);
        break;
      } catch (err) {
        attempts++;
        if (attempts < 2) {
          console.log(`[eia] ${series.key} failed, retrying in 5s...`);
          await new Promise(r => setTimeout(r, 5000));
        } else {
          console.error(`[eia] ${series.key} failed after retry:`, err.message);
        }
      }
    }
  }

  console.log(`[eia] Completed at ${new Date().toISOString()}`);
}

module.exports = { runEIA };
