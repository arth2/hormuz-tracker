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
    { key: 'sp500',    ticker: '^GSPC',     label: 'S&P 500',        unit: '' },
    { key: 'nasdaq',   ticker: '^IXIC',     label: 'Nasdaq',         unit: '' },
    { key: 'dow',      ticker: '^DJI',      label: 'Dow Jones',      unit: '' },
    { key: 'ftse',     ticker: '^FTSE',     label: 'FTSE 100 (UK)',  unit: '' },
    { key: 'dax',      ticker: '^GDAXI',    label: 'DAX (Germany)',  unit: '' },
    { key: 'nikkei',   ticker: '^N225',     label: 'Nikkei (Japan)', unit: '' },
    { key: 'shanghai', ticker: '000001.SS', label: 'Shanghai (China)', unit: '' },
    { key: 'kospi',    ticker: '^KS11',     label: 'KOSPI (South Korea)', unit: '' },
    { key: 'nifty',    ticker: '^NSEI',     label: 'Nifty 50 (India)', unit: '' },
  ],
  commodities: [
    { key: 'gold',      ticker: 'GC=F',    label: 'Gold (GC=F)',      unit: '$/oz'     },
    { key: 'silver',    ticker: 'SI=F',    label: 'Silver (SI=F)',    unit: '$/oz'     },
    { key: 'copper',    ticker: 'HG=F',    label: 'Copper (HG=F)',    unit: '$/lb'     },
    { key: 'palladium', ticker: 'PA=F',    label: 'Palladium (PA=F)', unit: '$/oz'     },
    { key: 'wheat',     ticker: 'ZW=F',    label: 'Wheat (ZW=F)',     unit: '$/bushel' },
    { key: 'corn',      ticker: 'ZC=F',    label: 'Corn (ZC=F)',      unit: '$/bushel' },
    { key: 'soybeans',  ticker: 'ZS=F',    label: 'Soybeans (ZS=F)',  unit: '$/bushel' },
    { key: 'bitcoin',   ticker: 'BTC-USD', label: 'Bitcoin (BTC-USD)', unit: '$/BTC'    },
    { key: 'ethereum',  ticker: 'ETH-USD', label: 'Ethereum (ETH-USD)', unit: '$/ETH'    },
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

// ═══════════════════════════════════════════════════════════════
// SECTION: WELLHEAD PRODUCTION ACTIVITY (VIIRS FLARING)
// ═══════════════════════════════════════════════════════════════

// Stores fetched data keyed by region for re-rendering on date change
const flaringData = {};
let gulfIndexChart = null;

// ─── UI helpers ──────────────────────────────────────────────────────────────

function toggleSection(sectionId) {
  const section = document.getElementById(sectionId);
  if (!section) return;
  section.classList.toggle('expanded');
  const toggle = document.getElementById(`toggle-${sectionId}`);
  if (toggle) toggle.textContent = section.classList.contains('expanded') ? '\u25BC' : '\u25B6';
}

function toggleTooltip(tooltipId) {
  document.querySelectorAll('.info-tooltip').forEach(t => {
    if (t.id !== tooltipId) t.classList.remove('visible');
  });
  document.getElementById(tooltipId)?.classList.toggle('visible');
}

function toggleTooltipExpand(tooltipId) {
  const tooltip = document.getElementById(tooltipId);
  if (!tooltip) return;
  const expanded = tooltip.querySelector('.tooltip-expanded');
  const btn = tooltip.querySelector('.tooltip-expand-btn');
  if (!expanded) return;
  expanded.classList.toggle('hidden');
  if (btn) btn.textContent = expanded.classList.contains('hidden') ? 'Read more \u25BC' : 'Show less \u25B2';
}

// Close tooltips when clicking outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('.info-btn') && !e.target.closest('.info-tooltip')) {
    document.querySelectorAll('.info-tooltip').forEach(t => t.classList.remove('visible'));
  }
});

function getPctClass(pct) {
  if (pct === null || pct === undefined) return '';
  if (pct >= 90) return 'high';
  if (pct >= 60) return 'medium';
  return 'low';
}

// ─── Build per-region HTML panels ────────────────────────────────────────────

function buildRegionPanels(regions) {
  const container = document.getElementById('flaring-regions-container');
  if (!container) return;
  container.innerHTML = '';
  regions.forEach(region => {
    const panel = document.createElement('div');
    panel.className = 'flaring-region-section';
    panel.id = `flaring-panel-${region.key}`;
    panel.innerHTML = `
      <div class="flaring-region-header" onclick="toggleRegionPanel('${region.key}')">
        <div>
          <div class="flaring-region-title">${region.label}</div>
          <div class="flaring-region-sublabel">${region.sublabel || ''}</div>
        </div>
        <div class="flaring-region-right">
          <div class="frp-stat">
            <div class="frp-stat-value" id="frp-val-${region.key}">&mdash;</div>
            <div class="frp-stat-label">7-day avg FRP (MW)</div>
          </div>
          <div class="pct-badge" id="pct-badge-${region.key}">&mdash;%</div>
          <button class="info-btn" onclick="event.stopPropagation(); toggleTooltip('tooltip-${region.key}')" aria-label="What is this?">&#9432;</button>
        </div>
      </div>
      <div class="info-tooltip" id="tooltip-${region.key}">
        <p>This chart tracks gas flaring intensity in the ${region.label} oil fields using NASA VIIRS satellite data. Flaring is a direct byproduct of crude production &mdash; when output is curtailed, flaring drops. The line shows Fire Radiative Power (MW) vs. the pre-crisis baseline.</p>
        <button class="tooltip-expand-btn" onclick="toggleTooltipExpand('tooltip-${region.key}')">Read more &#9660;</button>
        <div class="tooltip-expanded hidden">
          <p>Pre-crisis baseline FRP: <strong>${region.baseline_frp ? parseFloat(region.baseline_frp).toFixed(1) + ' MW' : 'Calculating...'}</strong> (mean daily average, Feb 1&ndash;27, 2026). The 7-day rolling average smooths day-to-day variability from cloud cover and satellite pass timing. The thin line shows raw daily detections.</p>
          ${region.contextNote ? `<p>${region.contextNote}</p>` : ''}
          <button class="tooltip-expand-btn" onclick="toggleTooltipExpand('tooltip-${region.key}')">Show less &#9650;</button>
        </div>
      </div>
      <div class="flaring-region-body" id="flaring-body-${region.key}">
        <div class="flaring-chart-controls">
          <span style="font-size:0.8rem; color:var(--muted)">Date range:</span>
          <select class="date-range-select" id="daterange-${region.key}"
                  onchange="onDateRangeChange('${region.key}', this.value)">
            <option value="2026-02-28" selected>Since Crisis Start</option>
            <option value="last7">Last 7 days</option>
            <option value="last14">Last 14 days</option>
            <option value="last30">Last 30 days</option>
            <option value="last60">Last 60 days</option>
          </select>
        </div>
        <div class="chart-container">
          <canvas id="chart-flaring-${region.key}"></canvas>
        </div>
        <div class="flaring-chart-stats">
          <span>Latest 7-day avg: <strong id="stat-avg-${region.key}">&mdash;</strong> MW</span>
          <span>Pre-crisis baseline: <strong>${region.baseline_frp ? parseFloat(region.baseline_frp).toFixed(1) : '&mdash;'}</strong> MW</span>
          <span>Change from baseline: <strong id="stat-chg-${region.key}">&mdash;</strong></span>
        </div>
        ${region.contextNote ? `<div class="region-context-note">${region.contextNote}</div>` : ''}
      </div>
    `;
    container.appendChild(panel);
  });
}

function toggleRegionPanel(regionKey) {
  const panel = document.getElementById(`flaring-panel-${regionKey}`);
  if (!panel) return;
  panel.classList.toggle('expanded');
  // Lazy-load chart when first expanded
  if (panel.classList.contains('expanded') && flaringData[regionKey]) {
    renderRegionChart(regionKey, flaringData[regionKey]);
  }
}

// ─── Chart rendering ──────────────────────────────────────────────────────────

function computeDateFrom(value) {
  if (value.startsWith('last')) {
    const days = parseInt(value.replace('last', ''));
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().split('T')[0];
  }
  return value; // already a YYYY-MM-DD string
}

function renderRegionChart(regionKey, data, fromDate) {
  const from = fromDate || computeDateFrom(
    document.getElementById(`daterange-${regionKey}`)?.value || '2026-02-28'
  );
  const filtered = data.filter(d => {
    const dateStr = d.date instanceof Date ? d.date.toISOString().split('T')[0] : (d.date || '').split('T')[0];
    return dateStr >= from;
  });
  const labels   = filtered.map(d => {
    const dateStr = d.date instanceof Date ? d.date.toISOString().split('T')[0] : (d.date || '').split('T')[0];
    return dateStr;
  });
  const rawFRP   = filtered.map(d => d.frp_sum !== null ? parseFloat(d.frp_sum) : null);
  const avgFRP   = filtered.map(d => d.rolling_avg_7d !== null ? parseFloat(d.rolling_avg_7d) : null);
  const baseline = filtered[0]?.baseline_frp ? parseFloat(filtered[0].baseline_frp) : null;

  const canvasId = `chart-flaring-${regionKey}`;
  const existing = Chart.getChart(canvasId);
  if (existing) existing.destroy();

  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return;

  const baselineDataset = baseline ? {
    label: 'Pre-crisis baseline',
    data: labels.map(() => baseline),
    borderColor: 'rgba(107,114,128,0.6)',
    borderDash: [5, 5],
    borderWidth: 1,
    pointRadius: 0,
    fill: false,
  } : null;

  new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Raw daily FRP (MW)',
          data: rawFRP,
          borderColor: 'rgba(245,158,11,0.35)',
          borderWidth: 1,
          pointRadius: 1.5,
          fill: false,
          spanGaps: false,
        },
        {
          label: '7-day rolling avg (MW)',
          data: avgFRP,
          borderColor: 'rgba(245,158,11,1)',
          borderWidth: 2,
          pointRadius: 0,
          fill: { target: 'origin', above: 'rgba(245,158,11,0.06)' },
          spanGaps: true,
        },
        ...(baselineDataset ? [baselineDataset] : []),
      ],
    },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: '#6b7280', font: { family: 'JetBrains Mono, monospace', size: 10 } } },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y !== null ? ctx.parsed.y.toFixed(1) + ' MW' : 'N/A'}`,
          }
        }
      },
      scales: {
        x: { ticks: { color: '#6b7280', font: { size: 10 }, maxRotation: 45 }, grid: { color: '#1f2937' } },
        y: {
          ticks: { color: '#6b7280', font: { family: 'JetBrains Mono, monospace', size: 10 } },
          grid: { color: '#1f2937' },
          title: { display: true, text: 'FRP (MW)', color: '#6b7280', font: { size: 10 } },
        }
      }
    }
  });

  // Update stats footer
  const latest = avgFRP.filter(v => v !== null).slice(-1)[0];
  if (latest !== undefined) {
    document.getElementById(`stat-avg-${regionKey}`).textContent = latest.toFixed(1);
    if (baseline) {
      const chg = ((latest - baseline) / baseline * 100).toFixed(1);
      const el = document.getElementById(`stat-chg-${regionKey}`);
      el.textContent = `${chg > 0 ? '+' : ''}${chg}%`;
      el.style.color = chg < -10 ? 'var(--red)' : chg > 5 ? 'var(--green)' : 'var(--amber)';
    }
  }
}

function onDateRangeChange(regionKey, value) {
  if (flaringData[regionKey]) {
    const from = computeDateFrom(value);
    renderRegionChart(regionKey, flaringData[regionKey], from);
  }
  // Persist preference in localStorage
  try { localStorage.setItem(`flaring-daterange-${regionKey}`, value); } catch(e) {}
}

// Restore saved date range preferences on load
function restoreDateRangePreferences() {
  document.querySelectorAll('.date-range-select').forEach(sel => {
    const regionKey = sel.id.replace('daterange-', '');
    try {
      const saved = localStorage.getItem(`flaring-daterange-${regionKey}`);
      if (saved) sel.value = saved;
    } catch(e) {}
  });
}

// ─── Gulf Index chart ─────────────────────────────────────────────────────────

function renderGulfIndexChart(indexSeries) {
  const labels = indexSeries.map(d => d.date);
  const values = indexSeries.map(d => d.index_value !== null ? parseFloat(d.index_value) : null);

  const latest = values.filter(v => v !== null).slice(-1)[0];
  if (latest !== undefined) {
    const color = latest >= 90 ? 'var(--green)' : latest >= 60 ? 'var(--amber)' : 'var(--red)';
    document.getElementById('gulf-index-big-value').textContent = latest.toFixed(1);
    document.getElementById('gulf-index-big-value').style.color = color;
    document.getElementById('gulf-index-headline').textContent = latest.toFixed(1);
    document.getElementById('gulf-index-headline').style.color = color;
  }

  const existing = Chart.getChart('chart-gulf-index');
  if (existing) existing.destroy();

  const ctx = document.getElementById('chart-gulf-index')?.getContext('2d');
  if (!ctx) return;

  gulfIndexChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Gulf Production Activity Index',
          data: values,
          borderColor: 'rgba(245,158,11,1)',
          borderWidth: 2,
          pointRadius: 0,
          fill: { target: 'origin', above: 'rgba(245,158,11,0.08)' },
          spanGaps: true,
        },
        {
          label: 'Pre-crisis baseline (100)',
          data: labels.map(() => 100),
          borderColor: 'rgba(107,114,128,0.5)',
          borderDash: [5,5],
          borderWidth: 1,
          pointRadius: 0,
          fill: false,
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { color: '#6b7280', font: { size: 10 } } },
        tooltip: { callbacks: { label: ctx => `Index: ${ctx.parsed.y?.toFixed(1)}` } }
      },
      scales: {
        x: { ticks: { color: '#6b7280', font: { size: 10 } }, grid: { color: '#1f2937' } },
        y: {
          ticks: { color: '#6b7280', font: { family: 'JetBrains Mono, monospace', size: 10 } },
          grid: { color: '#1f2937' },
          suggestedMin: 0, suggestedMax: 110,
        }
      }
    }
  });
}

// ─── Main flaring loader ──────────────────────────────────────────────────────

async function loadFlaring() {
  try {
    // 1. Load region metadata
    const regionsRes = await fetch('/api/flaring/regions');
    const regions = await regionsRes.json();
    buildRegionPanels(regions);
    restoreDateRangePreferences();

    // 2. Load per-region time series
    for (const region of regions) {
      try {
        const res = await fetch(`/api/flaring/${region.key}?from=2026-02-28`);
        const json = await res.json();
        flaringData[region.key] = json.data;

        // Update summary stats in collapsed header
        const latest = json.data.filter(d => d.rolling_avg_7d !== null).slice(-1)[0];
        if (latest) {
          document.getElementById(`frp-val-${region.key}`).textContent =
            parseFloat(latest.rolling_avg_7d).toFixed(1);
          const pct = latest.pct_of_baseline !== null ? parseFloat(latest.pct_of_baseline) : null;
          const badge = document.getElementById(`pct-badge-${region.key}`);
          if (pct !== null) {
            badge.textContent = `${pct.toFixed(0)}%`;
            badge.className = `pct-badge ${getPctClass(pct)}`;
          }
        }
      } catch(e) {
        console.warn(`[flaring] Failed to load ${region.key}:`, e.message);
      }
    }

    // 3. Load Gulf Index
    const indexRes = await fetch('/api/flaring/index/daily?from=2026-02-28');
    const indexData = await indexRes.json();
    renderGulfIndexChart(indexData);

  } catch(err) {
    console.error('[flaring] Load failed:', err.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// SECTION: CRISIS INTELLIGENCE FEED
// ═══════════════════════════════════════════════════════════════

let intelItems = [];
let intelOffset = 0;
const INTEL_PAGE_SIZE = 20;
let currentIntelCategory = 'ALL';
let lastIntelCheckCount = 0;

function timeAgo(dateStr) {
  if (!dateStr) return 'recently';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60)  return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs} hour${hrs !== 1 ? 's' : ''} ago`;
  return `${Math.floor(hrs / 24)} day${Math.floor(hrs/24) !== 1 ? 's' : ''} ago`;
}

function renderIntelCards(items, append) {
  const container = document.getElementById('intel-feed-container');
  if (!container) return;
  if (!append) container.innerHTML = '';
  if (items.length === 0 && !append) {
    container.innerHTML = '<p class="data-placeholder">Intelligence feed populating &mdash; check back in a few hours.</p>';
    return;
  }
  items.forEach(item => {
    const card = document.createElement('div');
    card.className = 'intel-card';
    card.dataset.category = item.category || 'MARKETS';
    card.innerHTML = `
      <div class="intel-card-meta">
        <span class="intel-source">${item.source}</span>
        <span class="intel-time">${timeAgo(item.published_at || item.fetched_at)}</span>
        <span class="intel-cat-badge intel-cat-${item.category || 'MARKETS'}">${item.category || 'MARKETS'}</span>
      </div>
      <div class="intel-headline">${item.headline}</div>
      ${item.summary ? `<div class="intel-summary">${item.summary.substring(0, 200)}${item.summary.length > 200 ? '\u2026' : ''}</div>` : ''}
      ${item.metric_extracted ? `<div class="intel-metric">\u21B3 ${item.metric_extracted}</div>` : ''}
      ${item.source_url ? `<a class="intel-link" href="${item.source_url}" target="_blank" rel="noopener">Read more \u2192</a>` : ''}
    `;
    container.appendChild(card);
  });
}

function filterIntel(category, btn) {
  currentIntelCategory = category;
  document.querySelectorAll('.intel-tab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');

  const cards = document.querySelectorAll('#intel-feed-container .intel-card');
  let visible = 0;
  cards.forEach(card => {
    const show = category === 'ALL' || card.dataset.category === category;
    card.style.display = show ? '' : 'none';
    if (show) visible++;
  });

  // Show empty state if needed
  const container = document.getElementById('intel-feed-container');
  const placeholder = container.querySelector('.data-placeholder');
  if (visible === 0 && !placeholder) {
    const p = document.createElement('p');
    p.className = 'data-placeholder category-empty';
    p.textContent = `No ${category} items yet.`;
    container.appendChild(p);
  } else if (visible > 0) {
    container.querySelector('.category-empty')?.remove();
  }
}

async function loadMoreIntel() {
  intelOffset += INTEL_PAGE_SIZE;
  try {
    const res = await fetch(`/api/intelligence?limit=${INTEL_PAGE_SIZE}&offset=${intelOffset}`);
    const items = await res.json();
    renderIntelCards(items, true);
    if (items.length < INTEL_PAGE_SIZE) {
      document.getElementById('intel-load-more').classList.add('hidden');
    }
  } catch(e) {
    console.warn('[intelligence] Load more failed:', e.message);
  }
}

async function loadIntelligence() {
  try {
    const res = await fetch('/api/intelligence?limit=40');
    intelItems = await res.json();
    renderIntelCards(intelItems);
    document.getElementById('intel-last-updated').textContent =
      `Updated ${timeAgo(new Date().toISOString())}`;
    lastIntelCheckCount = intelItems.length;

    const loadMoreBtn = document.getElementById('intel-load-more');
    if (intelItems.length >= 40) loadMoreBtn.classList.remove('hidden');

  } catch(err) {
    console.error('[intelligence] Load failed:', err.message);
  }
}

// Poll for new items every 10 minutes
async function checkIntelUpdate() {
  try {
    const res = await fetch('/api/intelligence/latest');
    const { count } = await res.json();
    if (count > lastIntelCheckCount) {
      const badge = document.getElementById('intel-new-badge');
      const diff = count - lastIntelCheckCount;
      badge.textContent = `${diff} new item${diff !== 1 ? 's' : ''} \u2014 click to refresh`;
      badge.classList.remove('hidden');
      badge.onclick = () => { loadIntelligence(); badge.classList.add('hidden'); };
    }
  } catch(e) { /* silent */ }
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

  // Load flaring data
  await loadFlaring();

  // Load intelligence feed
  await loadIntelligence();

  // Update timestamp
  document.getElementById('last-updated').textContent =
    `Updated: ${new Date().toLocaleTimeString()}`;

  // Refresh dollar value every 5 minutes (saves API credits)
  setInterval(updateDollarValue, 5 * 60_000);

  // Check for new intelligence items every 10 minutes
  setInterval(checkIntelUpdate, 10 * 60_000);
}

init();
