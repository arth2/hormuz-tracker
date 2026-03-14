// === CONSTANTS ===
const CRISIS_START = new Date('2026-02-28T00:00:00Z');
let BASELINES = {};
let currentCumulativeMb = 0;

// === LIVE TICKER DEFINITIONS ===
const LIVE_TICKERS = {
  oil: [
    { key: 'wti_crude',      ticker: 'CL=F',     label: 'WTI Crude',     unit: '$/bbl'    },
    { key: 'brent_crude',    ticker: 'BZ=F',     label: 'Brent Crude',   unit: '$/bbl'    },
    { key: 'nat_gas',        ticker: 'NG=F',     label: 'Natural Gas',   unit: '$/MMBtu'  },
    { key: 'rbob_gasoline',  ticker: 'RB=F',     label: 'RBOB Gasoline', unit: '$/gallon' },
    { key: 'heating_oil',    ticker: 'HO=F',     label: 'Heating Oil',   unit: '$/gallon' },
  ],
  markets: [
    { key: 'sp500',    ticker: '^GSPC',     label: 'S&P 500',   unit: '' },
    { key: 'nasdaq',   ticker: '^IXIC',     label: 'Nasdaq',    unit: '' },
    { key: 'dow',      ticker: '^DJI',      label: 'Dow Jones', unit: '' },
    { key: 'ftse',     ticker: '^FTSE',     label: 'FTSE 100',  unit: '' },
    { key: 'dax',      ticker: '^GDAXI',    label: 'DAX',       unit: '' },
    { key: 'nikkei',   ticker: '^N225',     label: 'Nikkei',    unit: '' },
    { key: 'shanghai', ticker: '000001.SS', label: 'Shanghai',  unit: '' },
  ],
  commodities: [
    { key: 'gold',      ticker: 'GC=F',    label: 'Gold',      unit: '$/oz'     },
    { key: 'silver',    ticker: 'SI=F',    label: 'Silver',    unit: '$/oz'     },
    { key: 'copper',    ticker: 'HG=F',    label: 'Copper',    unit: '$/lb'     },
    { key: 'palladium', ticker: 'PA=F',    label: 'Palladium', unit: '$/oz'     },
    { key: 'wheat',     ticker: 'ZW=F',    label: 'Wheat',     unit: '$/bushel' },
    { key: 'corn',      ticker: 'ZC=F',    label: 'Corn',      unit: '$/bushel' },
    { key: 'soybeans',  ticker: 'ZS=F',    label: 'Soybeans',  unit: '$/bushel' },
    { key: 'bitcoin',   ticker: 'BTC-USD', label: 'Bitcoin',   unit: '$/BTC'    },
    { key: 'ethereum',  ticker: 'ETH-USD', label: 'Ethereum',  unit: '$/ETH'    },
  ],
};

const LOGISTICS_KEYS = [
  { key: 'drewry_wci',                label: 'Drewry WCI',         unit: '$/FEU' },
  { key: 'brent_fred_confirm',        label: 'Brent (FRED)',       unit: '$/bbl' },
];

const US_ENERGY_KEYS = [
  { key: 'eia_gasoline_national', label: 'Gasoline (National Avg)', unit: '$/gallon' },
  { key: 'eia_diesel_national',   label: 'Diesel (National Avg)',   unit: '$/gallon' },
  { key: 'eia_jet_fuel',          label: 'Jet Fuel',                unit: '$/gallon' },
  { key: 'eia_heating_oil_ne',    label: 'Heating Oil (Northeast)', unit: '$/gallon' },
  { key: 'eia_crude_production',  label: 'U.S. Crude Production',   unit: 'mb/d'     },
  { key: 'eia_refinery_inputs',   label: 'Refinery Inputs',         unit: 'mb/d'     },
];

const SHUTIN_ESTIMATES = {
  Iraq:   { baseline: 4.2, current: 0.4 },
  Saudi:  { baseline: 6.0, current: 5.1 },
  Kuwait: { baseline: 1.7, current: 0.2 },
  UAE:    { baseline: 2.8, current: 0.4 },
};

// === UTILITY FUNCTIONS ===

function formatDelta(current, baseline) {
  if (current == null || baseline == null) return '<span class="delta neutral">&mdash;</span>';
  const delta = current - baseline;
  const pct = ((delta / baseline) * 100).toFixed(2);
  const sign = delta >= 0 ? '+' : '';
  const cls = delta >= 0 ? 'positive' : 'negative';
  return `<span class="delta ${cls}">${sign}${delta.toFixed(2)} (${sign}${pct}%)</span>`;
}

function formatPercentChange(current, baseline) {
  if (current == null || baseline == null || baseline === 0) return '<span class="delta neutral">&mdash;</span>';
  const delta = current - baseline;
  const pct = ((delta / baseline) * 100).toFixed(2);
  const sign = delta >= 0 ? '+' : '';
  const cls = delta >= 0 ? 'positive' : 'negative';
  return `<span class="delta ${cls}">${sign}${pct}%</span>`;
}

function formatNumber(val, decimals) {
  if (val == null) return '&mdash;';
  const n = parseFloat(val);
  if (isNaN(n)) return '&mdash;';
  if (Math.abs(n) >= 10000) return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return n.toFixed(decimals);
}

function daysSinceCrisis() {
  const now = new Date();
  return Math.floor((now - CRISIS_START) / (1000 * 60 * 60 * 24));
}

async function fetchJSON(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// === DATA LOADING ===

async function loadBaselines() {
  const data = await fetchJSON('/api/baselines');
  if (!data) return;
  BASELINES = {};
  for (const row of data) {
    BASELINES[row.metric_key] = parseFloat(row.baseline_value);
  }
}

async function loadDeficit() {
  const data = await fetchJSON('/api/deficit/current');
  if (!data) {
    document.getElementById('val-today-deficit').textContent = 'N/A';
    document.getElementById('val-cumulative').textContent = 'N/A';
    document.getElementById('val-dollar').textContent = 'N/A';
    return;
  }

  const dailyDeficit = parseFloat(data.daily_deficit_mb);
  const cumulative = parseFloat(data.cumulative_deficit_mb);
  const dollars = parseInt(data.cumulative_deficit_dollars);
  const brent = parseFloat(data.brent_price_at_calculation);

  currentCumulativeMb = cumulative;

  document.getElementById('val-today-deficit').textContent = formatNumber(dailyDeficit, 1);
  document.getElementById('val-cumulative').textContent = formatNumber(cumulative, 1);
  document.getElementById('val-dollar').textContent = `$${(dollars / 1e9).toFixed(1)}B`;
  document.getElementById('val-dollar-brent').textContent = `at $${formatNumber(brent, 2)}/bbl Brent`;
}

async function loadDeficitHistory() {
  const data = await fetchJSON('/api/deficit/history');
  if (!data || data.length === 0) return;

  // AIS Tanker Count Chart
  const aisCtx = document.getElementById('chart-ais').getContext('2d');
  const aisLabels = data.map(r => r.date.split('T')[0]);
  const aisData = data.map(r => r.ais_tanker_count != null ? parseInt(r.ais_tanker_count) : null);

  new Chart(aisCtx, {
    type: 'line',
    data: {
      labels: aisLabels,
      datasets: [{
        label: 'Tanker Count',
        data: aisData,
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: 2,
        spanGaps: true,
      }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        annotation: undefined,
      },
      scales: {
        x: {
          ticks: { color: '#6b7280', font: { family: "'JetBrains Mono'", size: 10 }, maxTicksLimit: 10 },
          grid: { color: 'rgba(31,41,55,0.5)' },
        },
        y: {
          ticks: { color: '#6b7280', font: { family: "'JetBrains Mono'", size: 10 } },
          grid: { color: 'rgba(31,41,55,0.5)' },
        },
      },
    },
  });

  // Cumulative Deficit Chart
  const defCtx = document.getElementById('chart-deficit').getContext('2d');
  const defLabels = data.map(r => r.date.split('T')[0]);
  const defData = data.map(r => r.cumulative_deficit_mb != null ? parseFloat(r.cumulative_deficit_mb) : null);

  new Chart(defCtx, {
    type: 'line',
    data: {
      labels: defLabels,
      datasets: [{
        label: 'Cumulative Deficit (mb)',
        data: defData,
        borderColor: '#ef4444',
        backgroundColor: 'rgba(239, 68, 68, 0.15)',
        fill: true,
        tension: 0.3,
        pointRadius: 2,
      }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          ticks: { color: '#6b7280', font: { family: "'JetBrains Mono'", size: 10 }, maxTicksLimit: 10 },
          grid: { color: 'rgba(31,41,55,0.5)' },
        },
        y: {
          title: { display: true, text: 'Million barrels', color: '#6b7280', font: { family: "'JetBrains Mono'", size: 10 } },
          ticks: { color: '#6b7280', font: { family: "'JetBrains Mono'", size: 10 } },
          grid: { color: 'rgba(31,41,55,0.5)' },
        },
      },
    },
  });
}

function renderShutinChart() {
  const ctx = document.getElementById('chart-shutin').getContext('2d');
  const countries = Object.keys(SHUTIN_ESTIMATES);
  const curtailment = countries.map(c => SHUTIN_ESTIMATES[c].baseline - SHUTIN_ESTIMATES[c].current);
  const baselines = countries.map(c => SHUTIN_ESTIMATES[c].baseline);

  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: countries,
      datasets: [
        {
          label: 'Curtailment (mb/d)',
          data: curtailment,
          backgroundColor: 'rgba(239, 68, 68, 0.7)',
          borderColor: '#ef4444',
          borderWidth: 1,
        },
        {
          label: 'Remaining (mb/d)',
          data: countries.map(c => SHUTIN_ESTIMATES[c].current),
          backgroundColor: 'rgba(59, 130, 246, 0.3)',
          borderColor: '#3b82f6',
          borderWidth: 1,
        },
      ],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      plugins: {
        legend: {
          labels: { color: '#6b7280', font: { family: "'JetBrains Mono'", size: 10 } },
        },
      },
      scales: {
        x: {
          stacked: true,
          title: { display: true, text: 'mb/d', color: '#6b7280', font: { family: "'JetBrains Mono'", size: 10 } },
          ticks: { color: '#6b7280', font: { family: "'JetBrains Mono'", size: 10 } },
          grid: { color: 'rgba(31,41,55,0.5)' },
        },
        y: {
          stacked: true,
          ticks: { color: '#6b7280', font: { family: "'JetBrains Mono'", size: 10 } },
          grid: { display: false },
        },
      },
    },
  });
}

// === TABLE RENDERERS ===

function buildTableHTML(headers, rows) {
  let html = '<table><thead><tr>';
  for (const h of headers) {
    html += `<th>${h}</th>`;
  }
  html += '</tr></thead><tbody>';
  for (const row of rows) {
    html += '<tr>';
    for (const cell of row) {
      html += cell;
    }
    html += '</tr>';
  }
  html += '</tbody></table>';
  return html;
}

function renderTickerTable(category, containerId, batchPrices) {
  const tickers = LIVE_TICKERS[category];
  const container = document.getElementById(containerId);
  const headers = ['', 'CURRENT', 'AT BASELINE', 'PRE-CRISIS', '% CHANGE', 'UNIT'];

  const rows = tickers.map(t => {
    const baseline = BASELINES[t.key];
    const liveData = batchPrices[t.ticker];
    let price = liveData?.price ?? null;
    let isBaseline = false;

    // Fall back to baseline if live fetch failed
    if (price == null && baseline != null) {
      price = baseline;
      isBaseline = true;
    }

    const currentStr = price != null ? formatNumber(price, 2) : '&mdash;';
    const noteStr = isBaseline ? ' <span style="color:var(--amber);font-size:0.6rem">(baseline)</span>' : '';
    const atBaselineStr = isBaseline ? '<span style="color:var(--amber)">Yes</span>' : '&mdash;';
    const preCrisisStr = baseline != null ? formatNumber(baseline, 2) : '&mdash;';
    const pctStr = price != null && baseline != null && !isBaseline ? formatPercentChange(price, baseline) : '<span class="delta neutral">&mdash;</span>';
    return [
      `<td class="label-cell">${t.label}</td>`,
      `<td class="value-cell">${currentStr}${noteStr}</td>`,
      `<td class="value-cell">${atBaselineStr}</td>`,
      `<td class="value-cell">${preCrisisStr}</td>`,
      `<td class="delta-cell">${pctStr}</td>`,
      `<td class="unit-cell">${t.unit}</td>`,
    ];
  });

  container.innerHTML = buildTableHTML(headers, rows);
}

async function loadAllLiveTickers() {
  // Show loading state for all panels
  const headers = ['', 'CURRENT', 'AT BASELINE', 'PRE-CRISIS', '% CHANGE', 'UNIT'];
  for (const [category, containerId] of [['oil', 'table-oil'], ['markets', 'table-markets'], ['commodities', 'table-commodities']]) {
    const container = document.getElementById(containerId);
    const loadingRows = LIVE_TICKERS[category].map(t => [
      `<td class="label-cell">${t.label}</td>`,
      `<td class="value-cell loading-cell">loading...</td>`,
      `<td class="value-cell">&mdash;</td>`,
      `<td class="value-cell">&mdash;</td>`,
      `<td class="delta-cell">&mdash;</td>`,
      `<td class="unit-cell">${t.unit}</td>`,
    ]);
    container.innerHTML = buildTableHTML(headers, loadingRows);
  }

  // Single batch request for all tickers
  const data = await fetchJSON('/api/live/batch');
  const prices = data?.prices || {};

  // Update freshness badges based on cache age
  if (data?.cacheAge != null) {
    const age = data.cacheAge;
    const label = age < 60 ? 'Live' : age < 600 ? `${Math.floor(age / 60)} min delay` : 'Cached';
    for (const panelId of ['panel-oil', 'panel-markets', 'panel-commodities']) {
      const badge = document.querySelector(`#${panelId} .freshness-badge`);
      if (badge) badge.textContent = label;
    }
  }

  renderTickerTable('oil', 'table-oil', prices);
  renderTickerTable('markets', 'table-markets', prices);
  renderTickerTable('commodities', 'table-commodities', prices);
}

async function loadSnapshotTable(keys, containerId) {
  const container = document.getElementById(containerId);
  const snapshots = await fetchJSON('/api/snapshots/all');
  const snapshotMap = {};
  if (snapshots) {
    for (const s of snapshots) {
      snapshotMap[s.metric_key] = s;
    }
  }

  const headers = ['', 'VALUE', 'DATE', 'UNIT'];
  const rows = keys.map(k => {
    const snap = snapshotMap[k.key];
    const val = snap ? formatNumber(snap.value, 2) : '&mdash;';
    const date = snap ? snap.metric_date.split('T')[0] : '&mdash;';
    return [
      `<td class="label-cell">${k.label}</td>`,
      `<td class="value-cell">${val}</td>`,
      `<td class="unit-cell">${date}</td>`,
      `<td class="unit-cell">${k.unit}</td>`,
    ];
  });

  container.innerHTML = buildTableHTML(headers, rows);
}

// === DOLLAR VALUE LIVE UPDATE ===

async function updateDollarValue() {
  try {
    const data = await fetchJSON('/api/live/BZ%3DF');
    if (!data || !data.price) return;
    const price = data.price;
    const dollarValue = currentCumulativeMb * 1_000_000 * price;
    document.getElementById('val-dollar').textContent = `$${(dollarValue / 1e9).toFixed(1)}B`;
    document.getElementById('val-dollar-brent').textContent = `at $${price.toFixed(2)}/bbl Brent`;
  } catch {
    // silently fail, keep previous value
  }
}

// === EIA CONFIGURATION CHECK ===

async function checkConfigStatus() {
  const status = await fetchJSON('/api/status');
  if (status && !status.eia_configured) {
    const panel = document.getElementById('panel-us-energy');
    const table = panel.querySelector('.data-table');
    const warning = document.createElement('div');
    warning.className = 'config-warning';
    warning.textContent = 'EIA API key not configured. Set EIA_API_KEY in Railway Variables.';
    panel.insertBefore(warning, table);
  }
}

// === INIT ===

async function init() {
  // Set day counter
  document.getElementById('day-counter').textContent = `Day ${daysSinceCrisis()} of closure`;

  // Load baselines first (needed for delta calculations)
  await loadBaselines();

  // Load deficit data and history
  await loadDeficit();
  loadDeficitHistory();
  renderShutinChart();

  // Load all live market data panels via batch endpoint
  await loadAllLiveTickers();

  // Load snapshot-based tables
  loadSnapshotTable(LOGISTICS_KEYS, 'table-logistics');
  loadSnapshotTable(US_ENERGY_KEYS, 'table-us-energy');

  // Check configuration status
  checkConfigStatus();

  // Update timestamp
  document.getElementById('last-updated').textContent =
    `Updated: ${new Date().toLocaleTimeString()}`;

  // Refresh dollar value every 5 minutes (saves API credits)
  setInterval(updateDollarValue, 5 * 60_000);
}

init();
