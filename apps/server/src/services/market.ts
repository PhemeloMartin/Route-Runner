/**
 * Real forex data.
 * Source: European Central Bank daily reference rates, served free and key-less by
 * frankfurter.dev. One "fix" per business day (~16:00 SAST). We store each day as a candle whose
 * open is the previous fix and close is today's fix, and build honest WEEKLY candles from the
 * daily fixes. A bundled seed file means the Trading Floor works fully offline on first launch;
 * when online, the server tops up the cache with the latest days.
 */
import fs from 'node:fs';
import { weeklyCandles, type Candle } from '@route-runner/engine';
import type { Db } from '../db/database.js';

export const MARKET_SYMBOLS = ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD', 'EURGBP', 'EURJPY', 'GBPJPY', 'USDZAR', 'EURZAR', 'GBPZAR'] as const;

/** Which base currency to ask Frankfurter for, and which quote symbols that yields. */
const QUERIES: { base: string; quotes: string[] }[] = [
  { base: 'EUR', quotes: ['USD', 'GBP', 'JPY', 'ZAR'] },
  { base: 'USD', quotes: ['JPY', 'CHF', 'CAD', 'ZAR'] },
  { base: 'GBP', quotes: ['USD', 'JPY', 'ZAR'] },
  { base: 'AUD', quotes: ['USD'] },
  { base: 'NZD', quotes: ['USD'] },
];

export interface DailyPoint {
  time: number;
  value: number;
}

export type SeedFile = { source: string; generatedAt: string; series: Record<string, [string, number][]> };

export async function fetchFrankfurter(from: string, to: string, fetchImpl: typeof fetch = fetch): Promise<Record<string, DailyPoint[]>> {
  const out: Record<string, DailyPoint[]> = {};
  for (const q of QUERIES) {
    const url = `https://api.frankfurter.dev/v1/${from}..${to}?base=${q.base}&symbols=${q.quotes.join(',')}`;
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'route-runner-learning-game' } });
    if (!res.ok) throw new Error(`Frankfurter HTTP ${res.status}`);
    const body = (await res.json()) as { rates: Record<string, Record<string, number>> };
    for (const [day, rates] of Object.entries(body.rates)) {
      for (const [quote, value] of Object.entries(rates)) {
        const sym = `${q.base}${quote}`;
        if (!(MARKET_SYMBOLS as readonly string[]).includes(sym)) continue;
        (out[sym] ??= []).push({ time: Date.parse(`${day}T00:00:00Z`) / 1000, value });
      }
    }
  }
  for (const s of Object.keys(out)) out[s].sort((a, b) => a.time - b.time);
  return out;
}

export class Market {
  constructor(
    private db: Db,
    private seedFile: string,
  ) {}

  /** Load the bundled seed the first time (works offline). */
  seedIfEmpty(): number {
    const has = this.db.get<{ c: number }>('SELECT COUNT(*) AS c FROM market_candles')?.c ?? 0;
    if (has > 0 || !fs.existsSync(this.seedFile)) return 0;
    const seed = JSON.parse(fs.readFileSync(this.seedFile, 'utf8')) as SeedFile;
    let n = 0;
    this.db.tx(() => {
      for (const [sym, pts] of Object.entries(seed.series)) {
        n += this.store(sym, pts.map(([d, v]) => ({ time: Date.parse(`${d}T00:00:00Z`) / 1000, value: v })), 'ecb-seed');
      }
    });
    return n;
  }

  /** Store daily fixes as D candles and rebuild W candles. Returns number of daily rows written. */
  store(symbol: string, points: DailyPoint[], source: string): number {
    if (!points.length) return 0;
    const prev = this.db.get<{ close: number; ts: number }>("SELECT close, ts FROM market_candles WHERE symbol = ? AND timeframe = 'D' AND ts < ? ORDER BY ts DESC LIMIT 1", [symbol, points[0].time]);
    let last = prev?.close ?? points[0].value;
    let n = 0;
    this.db.tx(() => {
      for (const p of points) {
        const r = this.db.run(
          "INSERT OR REPLACE INTO market_candles (symbol, timeframe, ts, open, high, low, close, source) VALUES (?, 'D', ?, ?, ?, ?, ?, ?)",
          [symbol, p.time, last, Math.max(last, p.value), Math.min(last, p.value), p.value, source],
        );
        n += r.changes;
        last = p.value;
      }
      const all = this.db.all<{ ts: number; close: number }>("SELECT ts, close FROM market_candles WHERE symbol = ? AND timeframe = 'D' ORDER BY ts", [symbol]);
      this.db.run("DELETE FROM market_candles WHERE symbol = ? AND timeframe = 'W'", [symbol]);
      for (const w of weeklyCandles(all.map((r) => ({ time: r.ts, value: r.close }))))
        this.db.run("INSERT INTO market_candles (symbol, timeframe, ts, open, high, low, close, source) VALUES (?, 'W', ?, ?, ?, ?, ?, ?)", [symbol, w.time, w.open, w.high, w.low, w.close, source]);
      this.db.run(
        `INSERT INTO market_meta (symbol, last_fetch_at, last_ts, source, last_error) VALUES (?, strftime('%Y-%m-%dT%H:%M:%fZ','now'), ?, ?, NULL)
         ON CONFLICT (symbol) DO UPDATE SET last_fetch_at = excluded.last_fetch_at, last_ts = MAX(COALESCE(last_ts,0), excluded.last_ts), source = excluded.source, last_error = NULL`,
        [symbol, points[points.length - 1].time, source],
      );
    });
    return n;
  }

  candles(symbol: string, tf: 'D' | 'W', limit = 400): Candle[] {
    return this.db
      .all<Candle & { ts: number }>("SELECT ts AS time, open, high, low, close FROM market_candles WHERE symbol = ? AND timeframe = ? ORDER BY ts DESC LIMIT ?", [symbol, tf, limit])
      .reverse()
      .map((c) => ({ time: Number(c.time), open: c.open, high: c.high, low: c.low, close: c.close }));
  }

  latest(): Record<string, { close: number; time: number; change: number }> {
    const out: Record<string, { close: number; time: number; change: number }> = {};
    for (const s of MARKET_SYMBOLS) {
      const rows = this.db.all<{ ts: number; close: number }>("SELECT ts, close FROM market_candles WHERE symbol = ? AND timeframe = 'D' ORDER BY ts DESC LIMIT 2", [s]);
      if (rows[0]) out[s] = { close: rows[0].close, time: rows[0].ts, change: rows[1] ? (rows[0].close - rows[1].close) / rows[1].close : 0 };
    }
    return out;
  }

  status() {
    return this.db.all('SELECT symbol, last_fetch_at, last_ts, source, last_error FROM market_meta ORDER BY symbol');
  }

  /** Top up the cache from the newest stored day to today. Safe to call when offline. */
  async refresh(fetchImpl: typeof fetch = fetch): Promise<{ ok: boolean; added: number; error?: string }> {
    const lastTs = this.db.get<{ t: number }>("SELECT MAX(ts) AS t FROM market_candles WHERE timeframe = 'D'")?.t;
    const from = lastTs ? new Date((Number(lastTs) + 86400) * 1000).toISOString().slice(0, 10) : '2023-01-01';
    const to = new Date().toISOString().slice(0, 10);
    if (from > to) return { ok: true, added: 0 };
    try {
      const data = await fetchFrankfurter(from, to, fetchImpl);
      let added = 0;
      for (const [sym, pts] of Object.entries(data)) added += this.store(sym, pts, 'ecb-frankfurter');
      return { ok: true, added };
    } catch (e) {
      const msg = (e as Error).message;
      this.db.run("UPDATE market_meta SET last_error = ?", [msg]);
      return { ok: false, added: 0, error: msg };
    }
  }
}
