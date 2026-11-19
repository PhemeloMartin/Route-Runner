/**
 * The arithmetic every trader must be able to do in their head.
 * If you can't calculate your risk BEFORE you click buy, you're gambling, not trading.
 */
import { type Instrument, instrument } from './instruments.js';

/** Rates map: price of 1 unit of currency X in USD, e.g. { USD: 1, EUR: 1.085, ZAR: 0.055, JPY: 0.0067 }. */
export type UsdRates = Record<string, number>;

export function convert(amount: number, from: string, to: string, usd: UsdRates): number {
  if (from === to) return amount;
  const f = usd[from];
  const t = usd[to];
  if (!f || !t) throw new Error(`Missing rate for ${!f ? from : to}`);
  return (amount * f) / t;
}

export function pips(inst: Instrument | string, from: number, to: number): number {
  const i = typeof inst === 'string' ? instrument(inst) : inst;
  return Math.round(((to - from) / i.pipSize) * 10) / 10;
}

/** Value of ONE pip for `lots` lots, in the account currency. */
export function pipValue(inst: Instrument | string, lots: number, accountCcy: string, usd: UsdRates): number {
  const i = typeof inst === 'string' ? instrument(inst) : inst;
  const inQuote = i.pipSize * i.contractSize * lots;
  return convert(inQuote, i.quote, accountCcy, usd);
}

/** Margin = (units x price of base in account currency) / leverage. */
export function marginRequired(inst: Instrument | string, lots: number, leverage: number, accountCcy: string, usd: UsdRates): number {
  const i = typeof inst === 'string' ? instrument(inst) : inst;
  const notionalInBase = i.contractSize * lots;
  return convert(notionalInBase, i.base, accountCcy, usd) / leverage;
}

export interface SizingInput {
  balance: number;
  riskPercent: number; // e.g. 1 = 1% of the account
  stopPips: number;
  symbol: string;
  accountCcy: string;
  usd: UsdRates;
}

/** The position-size formula: lots = money you're willing to lose / (stop distance x pip value per lot). */
export function positionSize(x: SizingInput): { lots: number; riskAmount: number; pipValuePerLot: number } {
  const riskAmount = (x.balance * x.riskPercent) / 100;
  const pvLot = pipValue(x.symbol, 1, x.accountCcy, x.usd);
  const raw = riskAmount / (x.stopPips * pvLot);
  const lots = Math.floor(raw * 100) / 100; // brokers allow 0.01 steps - always round DOWN
  return { lots, riskAmount, pipValuePerLot: pvLot };
}

export function profit(inst: Instrument | string, side: 'buy' | 'sell', lots: number, entry: number, exit: number, accountCcy: string, usd: UsdRates): number {
  const i = typeof inst === 'string' ? instrument(inst) : inst;
  const diff = (exit - entry) * (side === 'buy' ? 1 : -1);
  return convert(diff * i.contractSize * lots, i.quote, accountCcy, usd);
}

export function riskReward(side: 'buy' | 'sell', entry: number, stop: number, target: number): number {
  const risk = Math.abs(entry - stop);
  const reward = Math.abs(target - entry);
  if ((side === 'buy' && (stop >= entry || target <= entry)) || (side === 'sell' && (stop <= entry || target >= entry))) return NaN;
  return Math.round((reward / risk) * 100) / 100;
}

/** With win rate w and reward:risk R, expectancy per 1R risked = w*R - (1-w). Positive = edge. */
export function expectancy(winRate: number, rr: number): number {
  return Math.round((winRate * rr - (1 - winRate)) * 1000) / 1000;
}

/** Breakeven win rate for a given R:R - why a 1:3 trader can be wrong 70% of the time and still profit. */
export function breakevenWinRate(rr: number): number {
  return Math.round((1 / (1 + rr)) * 1000) / 1000;
}

/** How deep a hole is: after losing X% you need Y% to get back to even. */
export function recoveryNeeded(drawdownPercent: number): number {
  return Math.round((drawdownPercent / (100 - drawdownPercent)) * 10000) / 100;
}

/** Simulate N losing trades in a row at a fixed risk % - shows why 1-2% risk matters. */
export function losingStreak(balance: number, riskPercent: number, losses: number): number[] {
  const out = [balance];
  let b = balance;
  for (let k = 0; k < losses; k++) {
    b -= (b * riskPercent) / 100;
    out.push(Math.round(b * 100) / 100);
  }
  return out;
}

export function spreadCost(inst: Instrument | string, lots: number, spreadPips: number, accountCcy: string, usd: UsdRates): number {
  return pipValue(inst, lots, accountCcy, usd) * spreadPips;
}

/** Classic floor-trader pivot points from yesterday's High, Low, Close. */
export function pivots(high: number, low: number, close: number) {
  const p = (high + low + close) / 3;
  return { P: p, R1: 2 * p - low, S1: 2 * p - high, R2: p + (high - low), S2: p - (high - low), R3: high + 2 * (p - low), S3: low - 2 * (high - p) };
}

/** Fibonacci retracement levels for a swing from `from` to `to`. */
export function fibonacci(from: number, to: number) {
  const diff = to - from;
  return [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1].map((r) => ({ ratio: r, price: to - diff * r }));
}
