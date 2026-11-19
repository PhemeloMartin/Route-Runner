import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

function defaultDataDir(): string {
  if (process.env.ROUTE_RUNNER_DATA) return process.env.ROUTE_RUNNER_DATA;
  if (process.platform === 'win32') return path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local'), 'RouteRunner');
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'RouteRunner');
  return path.join(process.env.XDG_DATA_HOME ?? path.join(os.homedir(), '.local', 'share'), 'route-runner');
}

export interface Config {
  port: number;
  host: string;
  dataDir: string;
  dbFile: string;
  staticDir: string;
  seedFile: string;
  marketRefresh: boolean;
  logLevel: string;
}

export function loadConfig(overrides: Partial<Config> = {}): Config {
  const dataDir = overrides.dataDir ?? defaultDataDir();
  // server is bundled into apps/server/dist; the client build sits in apps/client/dist
  const repoRoot = path.resolve(here, '..', '..', '..');
  return {
    port: Number(process.env.PORT ?? 7420),
    host: process.env.HOST ?? '127.0.0.1',
    dataDir,
    dbFile: path.join(dataDir, 'route-runner.db'),
    staticDir: process.env.STATIC_DIR ?? path.join(repoRoot, 'apps', 'client', 'dist'),
    seedFile: process.env.SEED_FILE ?? path.join(repoRoot, 'data', 'seed', 'market.json'),
    marketRefresh: process.env.MARKET_REFRESH !== 'off',
    logLevel: process.env.LOG_LEVEL ?? 'info',
    ...overrides,
  };
}
