import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { Db } from '../src/db/database.js';

let app: App;

beforeAll(async () => {
  const cfg = loadConfig({ dataDir: '/nonexistent', staticDir: '/nonexistent', seedFile: path.resolve('data/seed/market.json'), logLevel: 'silent', marketRefresh: false });
  const db = await Db.open({ file: null });
  app = await buildApp(cfg, { db, logger: false });
});
afterAll(async () => app.server.close());

const call = async (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown) => {
  const r = await app.server.inject({ method, url, payload: payload as never });
  return { status: r.statusCode, body: String(r.headers['content-type'] ?? '').includes('json') ? r.json() : r.body };
};

describe('Route Runner API', () => {
  it('creates Phemelo on first launch with the welcome achievement', async () => {
    const r = await call('GET', '/api/profile');
    expect(r.status).toBe(200);
    expect(r.body.name).toBe('Phemelo');
    expect(r.body.totalXp).toBe(20);
    expect((await call('GET', '/healthz')).body.status).toBe('ok');
    expect((await call('GET', '/metrics')).body).toMatch(/route_runner_player_xp\{stream="network"\} 0/);
  });

  it('completes a lesson once, awards XP once, seeds flashcards', async () => {
    const r1 = await call('POST', '/api/lessons/n01-1/complete', { correct: 3, total: 3, durationS: 300 });
    expect(r1.body.xp).toBeGreaterThan(50);
    expect(r1.body.achievements.map((a: { id: string }) => a.id)).toEqual(expect.arrayContaining(['first-lesson', 'perfect-quiz']));
    const r2 = await call('POST', '/api/lessons/n01-1/complete', { correct: 3, total: 3 });
    expect(r2.body.xp).toBe(0);
    const cards = await call('GET', '/api/flashcards/due');
    expect(cards.body.due.length).toBeGreaterThan(3);
    const review = await call('POST', `/api/flashcards/${cards.body.due[0].id}/review`, { grade: 5 });
    expect(review.body.xp).toBe(2);
    const prof = await call('GET', '/api/profile');
    expect(prof.body.streak.current).toBe(1);
    expect(prof.body.streams.find((s: { stream: string }) => s.stream === 'network').xp).toBeGreaterThan(100);
  });

  it('rejects invalid input', async () => {
    expect((await call('POST', '/api/lessons/n01-1/complete', { correct: 5, total: 3 })).status).toBe(400);
    expect((await call('POST', '/api/lessons/nope/complete', { correct: 1, total: 1 })).status).toBe(404);
    expect((await call('GET', '/api/labs/badkind/x')).status).toBe(400);
  });

  it('saves and restores lab state and world position', async () => {
    await call('PUT', '/api/labs/network/first-lan', { state: { devices: [1, 2] }, objectives: ['ip1'] });
    expect((await call('GET', '/api/labs/network/first-lan')).body.state).toEqual({ devices: [1, 2] });
    const done = await call('POST', '/api/labs/network/first-lan/complete', { minutes: 10 });
    expect(done.body.xp).toBe(120);
    await call('PUT', '/api/world', { x: 3, y: 0, z: -4, heading: 1.2, lastZone: 'academy', lastPanel: 'lesson:n01-2' });
    expect((await call('GET', '/api/world')).body).toMatchObject({ x: 3, z: -4, last_zone: 'academy', last_panel: 'lesson:n01-2' });
  });

  it('serves real market data from the seed and journals trades', async () => {
    const sym = await call('GET', '/api/market/symbols');
    expect(sym.body.latest.USDZAR.close).toBeGreaterThan(10);
    const w = await call('GET', '/api/market/EURUSD?tf=W&limit=52');
    expect(w.body.candles).toHaveLength(52);
    const c = w.body.candles[10];
    expect(c.high).toBeGreaterThanOrEqual(Math.max(c.open, c.close));
    const accounts = await call('GET', '/api/trading/accounts');
    const usd = accounts.body[0];
    const t = await call('POST', '/api/trading/trades', { accountId: usd.id, symbol: 'EURUSD', side: 'buy', lots: 0.1, entry: 1.1, sl: 1.095, tp: 1.11, riskPercent: 0.5, openedAt: '2026-01-05' });
    expect(t.body.achievements.map((a: { id: string }) => a.id)).toContain('first-trade');
    const closed = await call('POST', `/api/trading/trades/${t.body.trade.id}/close`, { exit: 1.11, pnl: 100, reason: 'tp', closedAt: '2026-01-12' });
    expect(closed.body.trade.status).toBe('closed');
    expect((await call('GET', '/api/trading/accounts')).body[0].balance).toBe(10100);
    expect((await call('POST', `/api/trading/trades/${t.body.trade.id}/close`, { exit: 1.11, pnl: 100, reason: 'tp', closedAt: 'x' })).status).toBe(409);
  });

  it('exports and re-imports a save file', async () => {
    const save = (await call('GET', '/api/save/export')).body;
    expect(save.format).toBe('route-runner-save');
    const before = (await call('GET', '/api/profile')).body.totalXp;
    expect((await call('POST', '/api/save/import', save)).status).toBe(200);
    expect((await call('GET', '/api/profile')).body.totalXp).toBe(before);
  });

  it('builds a weighted mock exam', async () => {
    const r = await call('GET', '/api/exam/new?count=20');
    expect(r.status).toBe(200);
    expect(r.body.length).toBeGreaterThan(0);
    expect(r.body.every((q: { domain?: string }) => q.domain)).toBe(true);
  });
});
