require('dotenv').config();
const db = require('../db');
const fs = require('fs');
const path = require('path');

const BASELINES = [
  // Oil & Energy
  { key: 'wti_crude',               value: 70.45,   unit: '$/bbl'     },
  { key: 'brent_crude',             value: 71.00,   unit: '$/bbl'     },
  { key: 'nat_gas',                 value: 3.87,    unit: '$/MMBtu'   },
  { key: 'rbob_gasoline',           value: 2.12,    unit: '$/gallon'  },
  { key: 'heating_oil',             value: 2.28,    unit: '$/gallon'  },
  // Equity indices
  { key: 'sp500',                   value: 5842.0,  unit: 'index'     },
  { key: 'nasdaq',                  value: 18890.0, unit: 'index'     },
  { key: 'dow',                     value: 43200.0, unit: 'index'     },
  { key: 'ftse',                    value: 8490.0,  unit: 'index'     },
  { key: 'dax',                     value: 22100.0, unit: 'index'     },
  { key: 'nikkei',                  value: 37800.0, unit: 'index'     },
  { key: 'shanghai',                value: 3310.0,  unit: 'index'     },
  // Metals
  { key: 'gold',                    value: 2880.0,  unit: '$/oz'      },
  { key: 'silver',                  value: 31.80,   unit: '$/oz'      },
  { key: 'copper',                  value: 4.52,    unit: '$/lb'      },
  { key: 'palladium',               value: 980.0,   unit: '$/oz'      },
  // Agriculture
  { key: 'wheat',                   value: 5.42,    unit: '$/bushel'  },
  { key: 'corn',                    value: 4.68,    unit: '$/bushel'  },
  { key: 'soybeans',                value: 9.88,    unit: '$/bushel'  },
  // Crypto
  { key: 'bitcoin',                 value: 85200.0, unit: '$/BTC'     },
  { key: 'ethereum',                value: 2340.0,  unit: '$/ETH'     },
  // Deficit tracker constants
  { key: 'strait_throughput',       value: 20.0,    unit: 'mb/d'      },
  { key: 'strait_baseline_tankers', value: 37,      unit: 'vessels/d' },
];

const BASELINE_DATE = '2026-02-27';

async function runMigration() {
  const sql = fs.readFileSync(
    path.join(__dirname, '..', 'migrations', '001_create_tables.sql'),
    'utf8'
  );
  await db.query(sql);
  console.log('[seed] Migration 001 applied');
}

async function seedBaselines() {
  for (const row of BASELINES) {
    await db.query(
      `INSERT INTO baselines (metric_key, baseline_date, baseline_value, unit)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (metric_key) DO UPDATE SET
         baseline_date = EXCLUDED.baseline_date,
         baseline_value = EXCLUDED.baseline_value,
         unit = EXCLUDED.unit`,
      [row.key, BASELINE_DATE, row.value, row.unit]
    );
  }
  console.log(`[seed] Upserted ${BASELINES.length} baselines`);
}

async function main() {
  try {
    await runMigration();
    await seedBaselines();
    const result = await db.query('SELECT COUNT(*) FROM baselines');
    console.log(`[seed] Baselines count: ${result.rows[0].count}`);
  } catch (err) {
    console.error('[seed] Error:', err.message);
  } finally {
    await db.pool.end();
  }
}

main();
