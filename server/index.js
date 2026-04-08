require('dotenv').config({ override: true });
const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('./db');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy — Railway runs behind a reverse proxy
app.set('trust proxy', 1);

// Run migrations on startup
async function runMigrations() {
  try {
    const sql001 = fs.readFileSync(
      path.join(__dirname, 'migrations', '001_create_tables.sql'),
      'utf8'
    );
    await db.query(sql001);
    console.log('[server] Migration 001 applied');

    const sql002 = fs.readFileSync(
      path.join(__dirname, 'migrations', '002_flaring_intel_tables.sql'),
      'utf8'
    );
    await db.query(sql002);
    console.log('[server] Migration 002 applied');

    const sql003 = fs.readFileSync(
      path.join(__dirname, 'migrations', '003_daily_headlines.sql'),
      'utf8'
    );
    await db.query(sql003);
    console.log('[server] Migration 003 applied');
  } catch (err) {
    console.error('[server] Migration error:', err.message);
  }
}
runMigrations();

// Serve static files from client/
app.use(express.static(path.join(__dirname, '..', 'client')));

// JSON parsing
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Mount API routes
app.use('/api', apiRoutes);

// Cron job scheduling
const cron = require('node-cron');
const { runEIA } = require('./cron/eia');
const { runAIS } = require('./cron/ais');
const { runLogistics } = require('./cron/logistics');
const { calculateDeficit } = require('./cron/deficit');
const { runFlaring, backfillFlaring } = require('./cron/flaring');
const { runIntelligence } = require('./cron/intelligence');

cron.schedule('5 0 * * *',   () => calculateDeficit(), { timezone: 'UTC' });
cron.schedule('0 6 * * *',   () => runAIS(),           { timezone: 'UTC' });
cron.schedule('0 14 * * 3',  () => runEIA(),           { timezone: 'America/New_York' });
cron.schedule('0 12 * * 4',  () => runLogistics(),     { timezone: 'UTC' });
cron.schedule('0 10 * * *',  () => runFlaring(),       { timezone: 'UTC' });  // daily at 10:00 UTC
cron.schedule('0 */3 * * *', () => runIntelligence(),  { timezone: 'UTC' });  // every 3 hours

console.log('[server] Cron jobs registered');

// Backfill missing flaring data on startup (non-blocking)
backfillFlaring().catch(err => console.error('[server] Backfill error:', err.message));

app.listen(PORT, () => {
  console.log(`[server] Hormuz Crisis Tracker running on port ${PORT}`);
});
