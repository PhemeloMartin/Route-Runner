/**
 * Paper (demo) trading account + bar-replay.
 * Rule #1 of Route Runner Trading Floor: you trade DEMO money for at least 3 months
 * and keep a journal before you ever risk a single real rand.
 */
import type { Candle } from './indicators.js';
import { instrument } from './instruments.js';
import { convert, marginRequired, profit, type UsdRates } from './math.js';

export interface Position {
  id: number;
  symbol: string;
  side: 'buy' | 'sell';
  lots: number;
  entry: number;
  sl?: number;
  tp?: number;
  openTime: number;
  closeTime?: number;
  exit?: number;
  pnl?: number;
  status: 'open' | 'closed';
  reason?: 'tp' | 'sl' | 'manual' | 'stopout';
  riskPercent?: number;
  note?: string;
}

export interface AccountState {
  currency: string;
  balance: number;
  startBalance: number;
  leverage: number;
  positions: Position[];
  nextId: number;
}

export function newAccount(balance = 10000, currency = 'USD', leverage = 30): AccountState {
  return { currency, balance, startBalance: balance, leverage, positions: [], nextId: 1 };
}

export interface OpenOrder {
  symbol: string;
  side: 'buy' | 'sell';
  lots: number;
  sl?: number;
  tp?: number;
  note?: string;
}

export class PaperAccount {
  constructor(
    public s: AccountState,
    public usd: UsdRates,
  ) {}

  open(order: OpenOrder, price: number, time: number): { ok: true; position: Position } | { ok: false; error: string } {
    const inst = instrument(order.symbol);
    if (order.lots < 0.01 || Math.abs(Math.round(order.lots * 100) - order.lots * 100) > 1e-6) return { ok: false, error: 'Lot size must be at least 0.01 and in steps of 0.01.' };
    if (order.side === 'buy' && order.sl !== undefined && order.sl >= price) return { ok: false, error: 'For a BUY, the stop-loss must be BELOW the entry price.' };
    if (order.side === 'sell' && order.sl !== undefined && order.sl <= price) return { ok: false, error: 'For a SELL, the stop-loss must be ABOVE the entry price.' };
    if (order.side === 'buy' && order.tp !== undefined && order.tp <= price) return { ok: false, error: 'For a BUY, the take-profit must be ABOVE the entry price.' };
    if (order.side === 'sell' && order.tp !== undefined && order.tp >= price) return { ok: false, error: 'For a SELL, the take-profit must be BELOW the entry price.' };
    const need = marginRequired(inst, order.lots, this.s.leverage, this.s.currency, this.usd);
    if (need > this.freeMargin({})) return { ok: false, error: `Not enough free margin: this trade needs ${need.toFixed(2)} ${this.s.currency}. Use a smaller lot size.` };
    const spread = inst.typicalSpreadPips * inst.pipSize;
    const fill = order.side === 'buy' ? price + spread / 2 : price - spread / 2;
    let riskPercent: number | undefined;
    if (order.sl !== undefined) riskPercent = (Math.abs(profit(inst, order.side, order.lots, fill, order.sl, this.s.currency, this.usd)) / this.s.balance) * 100;
    const p: Position = { id: this.s.nextId++, symbol: inst.symbol, side: order.side, lots: order.lots, entry: fill, sl: order.sl, tp: order.tp, openTime: time, status: 'open', riskPercent, note: order.note };
    this.s.positions.push(p);
    return { ok: true, position: p };
  }

  close(id: number, price: number, time: number, reason: Position['reason'] = 'manual'): Position | undefined {
    const p = this.s.positions.find((x) => x.id === id && x.status === 'open');
    if (!p) return undefined;
    p.exit = price;
    p.closeTime = time;
    p.status = 'closed';
    p.reason = reason;
    p.pnl = Math.round(profit(p.symbol, p.side, p.lots, p.entry, price, this.s.currency, this.usd) * 100) / 100;
    this.s.balance = Math.round((this.s.balance + p.pnl) * 100) / 100;
    return p;
  }

  /** Feed a new candle: stops and targets that were touched get filled. If both, assume the STOP hit first (conservative). */
  onCandle(symbol: string, c: Candle): Position[] {
    const closed: Position[] = [];
    for (const p of this.s.positions.filter((x) => x.status === 'open' && x.symbol === symbol)) {
      const slHit = p.sl !== undefined && (p.side === 'buy' ? c.low <= p.sl : c.high >= p.sl);
      const tpHit = p.tp !== undefined && (p.side === 'buy' ? c.high >= p.tp : c.low <= p.tp);
      if (slHit) closed.push(this.close(p.id, p.sl!, c.time, 'sl')!);
      else if (tpHit) closed.push(this.close(p.id, p.tp!, c.time, 'tp')!);
    }
    // stop-out at 50% margin level
    const prices = { [symbol]: c.close };
    if (this.marginUsed(prices) > 0 && this.marginLevel(prices) < 50) {
      for (const p of this.s.positions.filter((x) => x.status === 'open')) closed.push(this.close(p.id, prices[p.symbol] ?? p.entry, c.time, 'stopout')!);
    }
    return closed;
  }

  floating(prices: Record<string, number>): number {
    return this.s.positions.filter((p) => p.status === 'open').reduce((sum, p) => sum + profit(p.symbol, p.side, p.lots, p.entry, prices[p.symbol] ?? p.entry, this.s.currency, this.usd), 0);
  }

  equity(prices: Record<string, number>): number {
    return this.s.balance + this.floating(prices);
  }

  marginUsed(prices: Record<string, number>): number {
    void prices;
    return this.s.positions.filter((p) => p.status === 'open').reduce((sum, p) => sum + marginRequired(p.symbol, p.lots, this.s.leverage, this.s.currency, this.usd), 0);
  }

  freeMargin(prices: Record<string, number>): number {
    return this.equity(prices) - this.marginUsed(prices);
  }

  marginLevel(prices: Record<string, number>): number {
    const used = this.marginUsed(prices);
    return used ? (this.equity(prices) / used) * 100 : Infinity;
  }

  stats() {
    const closed = this.s.positions.filter((p) => p.status === 'closed');
    const wins = closed.filter((p) => (p.pnl ?? 0) > 0);
    const losses = closed.filter((p) => (p.pnl ?? 0) <= 0);
    const grossWin = wins.reduce((a, p) => a + p.pnl!, 0);
    const grossLoss = Math.abs(losses.reduce((a, p) => a + p.pnl!, 0));
    let peak = this.s.startBalance;
    let bal = this.s.startBalance;
    let maxDd = 0;
    for (const p of closed.sort((a, b) => (a.closeTime ?? 0) - (b.closeTime ?? 0))) {
      bal += p.pnl!;
      peak = Math.max(peak, bal);
      maxDd = Math.max(maxDd, ((peak - bal) / peak) * 100);
    }
    return {
      trades: closed.length,
      winRate: closed.length ? wins.length / closed.length : 0,
      profitFactor: grossLoss ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
      avgWin: wins.length ? grossWin / wins.length : 0,
      avgLoss: losses.length ? grossLoss / losses.length : 0,
      maxDrawdownPct: Math.round(maxDd * 100) / 100,
      netPnl: Math.round((this.s.balance - this.s.startBalance) * 100) / 100,
      withStops: closed.filter((p) => p.sl !== undefined).length,
      disciplined: closed.filter((p) => p.sl !== undefined && (p.riskPercent ?? 100) <= 2.05).length,
    };
  }
}

/** Build a USD rate table from latest closes (EURUSD=1.08 -> EUR=1.08; USDZAR=18 -> ZAR=1/18). */
export function usdRatesFrom(latest: Record<string, number>): UsdRates {
  const r: UsdRates = { USD: 1 };
  for (const [sym, price] of Object.entries(latest)) {
    const b = sym.slice(0, 3);
    const q = sym.slice(3, 6);
    if (q === 'USD') r[b] = price;
    else if (b === 'USD') r[q] = 1 / price;
  }
  for (const [sym, price] of Object.entries(latest)) {
    const b = sym.slice(0, 3);
    const q = sym.slice(3, 6);
    if (r[b] && !r[q]) r[q] = r[b] / price;
    if (r[q] && !r[b]) r[b] = r[q] * price;
  }
  return r;
}

export { convert };
