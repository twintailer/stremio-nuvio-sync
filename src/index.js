const express = require('express');
const { getRouter } = require('stremio-addon-sdk');
const db = require('./db');
const { poll } = require('./stremio-api');
const { runEnrichment } = require('./tmdb');
const { builder } = require('./addon');

const PORT = parseInt(process.env.PORT, 10) || 7860;
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL_MS, 10) || 300000;

let pollTimer = null;

async function startPolling() {
  await poll();
  // Run TMDB enrichment in background after each poll
  runEnrichment().catch((err) =>
    console.error('[TMDB] Enrichment error:', err.message)
  );
}

function schedulePolling() {
  pollTimer = setInterval(async () => {
    await startPolling();
  }, POLL_INTERVAL);
  console.log(`[Scheduler] Polling every ${POLL_INTERVAL / 1000}s`);
}

async function main() {
  // Initialize database
  await db.init();

  // Run first poll immediately
  await startPolling();

  // Schedule recurring polls
  schedulePolling();

  // Set up Express with addon router
  const app = express();

  const addonInterface = builder.getInterface();
  const router = getRouter(addonInterface);

  // Mount addon routes
  app.use(router);

  app.listen(PORT, () => {
    const baseUrl = process.env.ADDON_BASE_URL || `http://localhost:${PORT}`;
    console.log(`[Server] Listening on port ${PORT}`);
    console.log(`[Server] Manifest: ${baseUrl}/manifest.json`);
  });
}

// Graceful shutdown
function shutdown() {
  console.log('[Server] Shutting down...');
  if (pollTimer) clearInterval(pollTimer);
  db.close();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

main().catch((err) => {
  console.error('[Fatal]', err);
  process.exit(1);
});
