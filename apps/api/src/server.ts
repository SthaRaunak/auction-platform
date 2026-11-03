import { config } from './config';
import { pool } from './db';
import { createApp } from './app';
import { flushOutbox, startDrainer, stopDrainer } from './modules/outbox/outbox.drainer';
import { startCloser, stopCloser } from './workers/closer';

const { app } = createApp();
const server = app.listen(config.PORT, () => {
  console.log(`Bidwell API on http://localhost:${config.PORT} (workers ${config.RUN_WORKERS ? 'on' : 'off'})`);
});

if (config.RUN_WORKERS) {
  startDrainer();
  startCloser();
}

async function shutdown() {
  stopCloser();
  stopDrainer();
  await flushOutbox().catch(() => {});
  server.close();
  server.closeAllConnections();
  await pool.end();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
