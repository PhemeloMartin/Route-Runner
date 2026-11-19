import fs from 'node:fs';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import fastifyStatic from '@fastify/static';
import { z, ZodError } from 'zod';
import { mockExam, dailyQuest, totals, FLASHCARDS } from '@route-runner/content';
import type { Config } from './config.js';
import { Db } from './db/database.js';
import { Game, HttpError } from './services/game.js';
import { Market, MARKET_SYMBOLS } from './services/market.js';
import { Trading } from './services/trading.js';

export interface App {
  server: FastifyInstance;
  db: Db;
  game: Game;
  market: Market;
}

const Score = z.object({ correct: z.number().int().min(0), total: z.number().int().min(1), durationS: z.number().int().min(0).max(86400).default(0), detail: z.unknown().optional() });
const LabKind = z.enum(['network', 'linux', 'vm', 'cloud', 'hpc', 'rack', 'pcbuild', 'cable', 'k8s3d']);

export async function buildApp(cfg: Config, opts: { db?: Db; logger?: boolean } = {}): Promise<App> {
  const db = opts.db ?? (await Db.open({ file: cfg.dbFile }));
  const game = new Game(db);
  const market = new Market(db, cfg.seedFile);
  const trading = new Trading(db);
  const pid = game.ensurePlayer();
  market.seedIfEmpty();

  const server = Fastify({ logger: opts.logger === false ? false : { level: cfg.logLevel }, bodyLimit: 8 * 1024 * 1024 });
  const metrics = { requests: 0, errors: 0, started: Date.now() };

  server.addHook('onResponse', async (_req, reply) => {
    metrics.requests++;
    if (reply.statusCode >= 500) metrics.errors++;
  });

  server.setErrorHandler((err: Error & { statusCode?: number }, _req: FastifyRequest, reply: FastifyReply) => {
    if (err instanceof ZodError) return reply.status(400).send({ error: 'Invalid request', issues: err.issues });
    if (err instanceof HttpError) return reply.status(err.status).send({ error: err.message });
    if (err.statusCode && err.statusCode < 500) return reply.status(err.statusCode).send({ error: err.message });
    server.log.error(err);
    return reply.status(500).send({ error: 'Internal error' });
  });

  // ------------------------------------------------------------ ops endpoints (Kubernetes probes, Prometheus)
  server.get('/healthz', async () => ({ status: 'ok' }));
  server.get('/readyz', async () => {
    db.get('SELECT 1');
    return { status: 'ready' };
  });
  server.get('/metrics', async (_req, reply) => {
    const p = game.profile(pid);
    reply.type('text/plain; version=0.0.4');
    return [
      '# HELP route_runner_http_requests_total HTTP requests served',
      '# TYPE route_runner_http_requests_total counter',
      `route_runner_http_requests_total ${metrics.requests}`,
      '# HELP route_runner_http_errors_total HTTP 5xx responses',
      '# TYPE route_runner_http_errors_total counter',
      `route_runner_http_errors_total ${metrics.errors}`,
      '# HELP route_runner_uptime_seconds Process uptime',
      '# TYPE route_runner_uptime_seconds gauge',
      `route_runner_uptime_seconds ${Math.round((Date.now() - metrics.started) / 1000)}`,
      '# HELP route_runner_player_xp XP per learning stream',
      '# TYPE route_runner_player_xp gauge',
      ...p.streams.map((s) => `route_runner_player_xp{stream="${s.stream}"} ${s.xp}`),
      '# HELP route_runner_streak_days Current daily learning streak',
      '# TYPE route_runner_streak_days gauge',
      `route_runner_streak_days ${p.streak.current}`,
      '# HELP route_runner_db_bytes Size of the SQLite database',
      '# TYPE route_runner_db_bytes gauge',
      `route_runner_db_bytes ${db.sizeBytes()}`,
      '',
    ].join('\n');
  });

  // ------------------------------------------------------------ player
  server.get('/api/profile', async () => game.profile(pid));
  server.put('/api/profile', async (req) => {
    const body = z.object({ name: z.string().min(1).max(40).optional(), avatar: z.record(z.string(), z.string()).optional(), settings: z.record(z.string(), z.unknown()).optional() }).parse(req.body);
    game.updateProfile(pid, body);
    return game.profile(pid);
  });
  server.get('/api/progress', async () => game.progress(pid));
  server.get('/api/dashboard', async () => ({ heatmap: game.heatmap(pid), recent: game.recentXp(pid), totals: totals(), exams: game.examHistory(pid) }));
  server.get('/api/daily', async () => {
    const done = new Set(game.progress(pid).lessons.filter((l) => l.status === 'completed').map((l) => l.lesson_id));
    const p = game.profile(pid);
    const q = dailyQuest(done, p.dayNumber);
    return { day: q.day, lessons: q.lessons.map((l) => ({ id: l.id, title: l.title, stream: l.stream, minutes: l.minutes })), flashcards: q.flashcards, drills: q.drills };
  });

  // ------------------------------------------------------------ world save ("continue where I left off")
  server.get('/api/world', async () => game.world(pid));
  server.put('/api/world', async (req) => {
    const w = z.object({ x: z.number(), y: z.number(), z: z.number(), heading: z.number(), lastZone: z.string().max(40).nullish(), lastPanel: z.string().max(80).nullish() }).parse(req.body);
    game.saveWorld(pid, w);
    return { ok: true };
  });

  // ------------------------------------------------------------ lessons, bosses, exams, drills
  server.post('/api/lessons/:id/start', async (req) => {
    game.startLesson(pid, (req.params as { id: string }).id);
    return { ok: true };
  });
  server.post('/api/lessons/:id/complete', async (req) => {
    const s = Score.parse(req.body);
    return game.completeLesson(pid, (req.params as { id: string }).id, s.correct, s.total, s.durationS, s.detail);
  });
  server.post('/api/chapters/:id/boss', async (req) => {
    const s = Score.parse(req.body);
    return game.bossAttempt(pid, (req.params as { id: string }).id, s.correct, s.total, s.durationS);
  });
  server.get('/api/exam/new', async (req) => {
    const n = z.coerce.number().int().min(10).max(120).default(60).parse((req.query as { count?: string }).count);
    return mockExam(n);
  });
  server.post('/api/exam/result', async (req) => {
    const s = Score.parse(req.body);
    return game.examAttempt(pid, s.correct, s.total, s.durationS, s.detail);
  });
  server.post('/api/drills', async (req) => {
    const b = z.object({ kind: z.string().max(40), correct: z.number().int().min(0), total: z.number().int().min(0) }).parse(req.body);
    return game.drillResult(pid, b.kind, b.correct, b.total);
  });

  // ------------------------------------------------------------ flashcards
  server.get('/api/flashcards/due', async () => game.dueCards(pid));
  server.get('/api/flashcards/all', async () => FLASHCARDS);
  server.post('/api/flashcards/:id/review', async (req) => {
    const b = z.object({ grade: z.number().int().min(0).max(5) }).parse(req.body);
    return game.reviewCard(pid, (req.params as { id: string }).id, b.grade as 0);
  });

  // ------------------------------------------------------------ interview practice
  server.post('/api/interview', async (req) => {
    const b = z.object({ lessonId: z.string(), answer: z.string().min(1).max(4000), selfScore: z.number().int().min(1).max(5).optional() }).parse(req.body);
    return game.saveInterview(pid, b.lessonId, b.answer, b.selfScore);
  });
  server.get('/api/interview', async () => game.interviews(pid));

  // ------------------------------------------------------------ labs
  server.get('/api/labs/:kind/:id', async (req) => {
    const p = req.params as { kind: string; id: string };
    return game.getLab(pid, LabKind.parse(p.kind), p.id) ?? { state: null };
  });
  server.put('/api/labs/:kind/:id', async (req) => {
    const p = req.params as { kind: string; id: string };
    const b = z.object({ state: z.unknown(), objectives: z.array(z.string()).default([]) }).parse(req.body);
    game.saveLab(pid, LabKind.parse(p.kind), p.id, b.state, b.objectives);
    return { ok: true };
  });
  server.delete('/api/labs/:kind/:id', async (req) => {
    const p = req.params as { kind: string; id: string };
    game.resetLab(pid, LabKind.parse(p.kind), p.id);
    return { ok: true };
  });
  server.post('/api/labs/:kind/:id/complete', async (req) => {
    const p = req.params as { kind: string; id: string };
    const b = z.object({ minutes: z.number().int().min(0).max(600).default(20) }).parse(req.body ?? {});
    return game.completeLab(pid, LabKind.parse(p.kind), p.id, b.minutes);
  });

  // ------------------------------------------------------------ market data + trading
  server.get('/api/market/symbols', async () => ({ symbols: MARKET_SYMBOLS, latest: market.latest(), status: market.status() }));
  server.get('/api/market/:symbol', async (req) => {
    const symbol = z.enum(MARKET_SYMBOLS).parse((req.params as { symbol: string }).symbol.toUpperCase());
    const q = z.object({ tf: z.enum(['D', 'W']).default('D'), limit: z.coerce.number().int().min(10).max(2000).default(500) }).parse(req.query);
    return { symbol, tf: q.tf, candles: market.candles(symbol, q.tf, q.limit), source: 'European Central Bank reference rates via frankfurter.dev' };
  });
  server.post('/api/market/refresh', async () => market.refresh());

  server.get('/api/trading/accounts', async () => trading.accounts(pid));
  server.post('/api/trading/accounts/:id/reset', async (req) => {
    trading.resetAccount(pid, Number((req.params as { id: string }).id));
    return { ok: true };
  });
  server.get('/api/trading/accounts/:id/trades', async (req) => trading.trades(pid, Number((req.params as { id: string }).id)));
  server.get('/api/trading/accounts/:id/stats', async (req) => trading.stats(pid, Number((req.params as { id: string }).id)));
  server.post('/api/trading/trades', async (req) => {
    const t = z
      .object({
        accountId: z.number().int(),
        symbol: z.enum(MARKET_SYMBOLS),
        side: z.enum(['buy', 'sell']),
        lots: z.number().positive().max(100),
        entry: z.number().positive(),
        sl: z.number().positive().nullish(),
        tp: z.number().positive().nullish(),
        riskPercent: z.number().min(0).max(100).nullish(),
        mode: z.enum(['replay', 'live']).default('replay'),
        setup: z.string().max(200).optional(),
        emotion: z.string().max(60).optional(),
        notes: z.string().max(2000).optional(),
        openedAt: z.string(),
      })
      .parse(req.body);
    const out = trading.open(pid, t);
    const reward = game.award(pid, 'forex', 5, 'trade', null) ? 5 : 0;
    return { trade: out, xp: reward, achievements: game.evaluateAchievements(pid) };
  });
  server.post('/api/trading/trades/:id/close', async (req) => {
    const b = z.object({ exit: z.number().positive(), pnl: z.number(), reason: z.enum(['tp', 'sl', 'manual', 'stopout']), closedAt: z.string() }).parse(req.body);
    const out = trading.close(pid, Number((req.params as { id: string }).id), b.exit, b.pnl, b.reason, b.closedAt);
    return { trade: out, achievements: game.evaluateAchievements(pid) };
  });
  server.put('/api/trading/trades/:id/journal', async (req) => {
    const b = z.object({ setup: z.string().max(200).optional(), emotion: z.string().max(60).optional(), notes: z.string().max(2000).optional() }).parse(req.body);
    trading.journal(pid, Number((req.params as { id: string }).id), b);
    const journaled = game.award(pid, 'forex', 15, 'journal', `trade:${(req.params as { id: string }).id}`);
    return { ok: true, xp: journaled ? 15 : 0, achievements: game.evaluateAchievements(pid) };
  });

  // ------------------------------------------------------------ save backup / restore
  server.get('/api/save/export', async (_req, reply) => {
    reply.header('Content-Disposition', `attachment; filename="route-runner-save-${new Date().toISOString().slice(0, 10)}.json"`);
    return game.exportSave(pid);
  });
  server.post('/api/save/import', async (req) => {
    game.importSave(req.body as never);
    return { ok: true };
  });

  // ------------------------------------------------------------ the game itself (static client build)
  if (fs.existsSync(cfg.staticDir)) {
    // wildcard routing so freshly rebuilt (re-hashed) bundles are served without a restart
    await server.register(fastifyStatic, { root: cfg.staticDir, prefix: '/' });
    server.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.status(404).send({ error: 'Not found' });
      return reply.sendFile('index.html');
    });
  }

  server.addHook('onClose', async () => db.close());
  return { server, db, game, market };
}
