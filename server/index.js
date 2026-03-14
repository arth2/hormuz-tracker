require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('./db');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

// Run migrations on startup
async function runMigrations() {
  try {
    const sql = fs.readFileSync(
      path.join(__dirname, 'migrations', '001_create_tables.sql'),
      'utf8'
    );
    await db.query(sql);
    console.log('[server] Migrations applied');
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

cron.schedule('5 0 * * *',   () => calculateDeficit(), { timezone: 'UTC' });
cron.schedule('0 6 * * *',   () => runAIS(),           { timezone: 'UTC' });
cron.schedule('0 14 * * 3',  () => runEIA(),           { timezone: 'America/New_York' });
cron.schedule('0 12 * * 4',  () => runLogistics(),     { timezone: 'UTC' });

console.log('[server] Cron jobs registered');

app.listen(PORT, () => {
  console.log(`[server] Hormuz Crisis Tracker running on port ${PORT}`);
});
