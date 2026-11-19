import { buildApp } from './app.js';
import { loadConfig } from './config.js';

const cfg = loadConfig();

const app = await buildApp(cfg);

const shutdown = async (signal: string) => {
  app.server.log.info(`${signal} received - saving and shutting down`);
  await app.server.close();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await app.server.listen({ port: cfg.port, host: cfg.host });
app.server.log.info(`Route Runner is running at http://${cfg.host === '0.0.0.0' ? 'localhost' : cfg.host}:${cfg.port}  (save file: ${cfg.dbFile})`);

if (cfg.marketRefresh) {
  // Top up real market data in the background - silently skipped when offline.
  app.market
    .refresh()
    .then((r) => app.server.log.info(r.ok ? `market data refreshed (+${r.added} days)` : `market refresh skipped: ${r.error}`))
    .catch(() => undefined);
}
