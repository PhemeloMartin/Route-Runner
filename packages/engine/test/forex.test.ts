import { describe, expect, it } from 'vitest';
import { breakevenWinRate, expectancy, marginRequired, pipValue, pips, positionSize, profit, recoveryNeeded, riskReward } from '../src/forex/math.js';
import { PaperAccount, newAccount, usdRatesFrom } from '../src/forex/paper.js';
import { rsi, sma, weeklyCandles } from '../src/forex/indicators.js';
import { activeSessions } from '../src/forex/instruments.js';
import { checkDrill, makeDrill, setDrillSeed } from '../src/learning/drills.js';
import { levelFromXp, review, newCard, streak } from '../src/learning/progress.js';

const usd = usdRatesFrom({ EURUSD: 1.1, USDJPY: 150, USDZAR: 18 });

describe('forex maths', () => {
  it('counts pips (JPY pairs use 0.01)', () => {
    expect(pips('EURUSD', 1.1, 1.105)).toBe(50);
    expect(pips('USDJPY', 150, 150.25)).toBe(25);
  });
  it('values pips in the account currency', () => {
    expect(pipValue('EURUSD', 1, 'USD', usd)).toBeCloseTo(10);
    expect(pipValue('USDJPY', 1, 'USD', usd)).toBeCloseTo(1000 / 150);
    expect(pipValue('EURUSD', 1, 'ZAR', usd)).toBeCloseTo(180);
  });
  it('sizes positions from risk', () => {
    const r = positionSize({ balance: 10000, riskPercent: 1, stopPips: 25, symbol: 'EURUSD', accountCcy: 'USD', usd });
    expect(r.lots).toBe(0.4);
  });
  it('computes margin, profit, R:R and expectancy', () => {
    expect(marginRequired('EURUSD', 1, 30, 'USD', usd)).toBeCloseTo(110000 / 30);
    expect(profit('EURUSD', 'sell', 0.5, 1.1, 1.09, 'USD', usd)).toBeCloseTo(500);
    expect(riskReward('buy', 1.1, 1.095, 1.115)).toBe(3);
    expect(expectancy(0.4, 2)).toBe(0.2);
    expect(breakevenWinRate(3)).toBe(0.25);
    expect(recoveryNeeded(50)).toBe(100);
  });
});

describe('paper trading', () => {
  it('fills SL before TP when a candle hits both', () => {
    const acc = new PaperAccount(newAccount(10000, 'USD', 30), usd);
    const r = acc.open({ symbol: 'EURUSD', side: 'buy', lots: 0.1, sl: 1.095, tp: 1.11 }, 1.1, 0);
    expect(r.ok).toBe(true);
    const closed = acc.onCandle('EURUSD', { time: 1, open: 1.1, high: 1.112, low: 1.094, close: 1.1 });
    expect(closed[0].reason).toBe('sl');
    expect(acc.s.balance).toBeLessThan(10000);
    expect(acc.stats().disciplined).toBe(1);
  });
  it('rejects a stop on the wrong side', () => {
    const acc = new PaperAccount(newAccount(), usd);
    const r = acc.open({ symbol: 'EURUSD', side: 'buy', lots: 0.07, sl: 1.2 }, 1.1, 0);
    expect(r.ok).toBe(false);
  });
});

describe('indicators and sessions', () => {
  it('computes SMA and RSI', () => {
    expect(sma([1, 2, 3, 4], 2)).toEqual([null, 1.5, 2.5, 3.5]);
    const up = Array.from({ length: 30 }, (_, i) => 100 + i);
    expect(rsi(up)[29]).toBe(100);
  });
  it('builds weekly candles from daily closes', () => {
    const day = (s: string, v: number) => ({ time: Date.parse(s) / 1000, value: v });
    const w = weeklyCandles([day('2026-11-02', 1.1), day('2026-11-03', 1.12), day('2026-11-06', 1.09), day('2026-11-09', 1.095), day('2026-11-10', 1.1)]);
    expect(w).toHaveLength(2);
    expect(w[0]).toMatchObject({ open: 1.1, high: 1.12, low: 1.09, close: 1.09 });
    expect(w[1].open).toBe(1.09);
  });
  it('knows the London/New York overlap', () => {
    expect(activeSessions(new Date('2026-11-18T14:00:00Z'))).toEqual(['London', 'New York']);
  });
});

describe('learning engine', () => {
  it('generates checkable drills', () => {
    setDrillSeed(42);
    for (let i = 0; i < 200; i++) {
      const d = makeDrill();
      expect(checkDrill(d, d.answer)).toBe(true);
    }
    const p = makeDrill('pip-value');
    expect(checkDrill(p, p.answer)).toBe(true);
  });
  it('levels, streaks and spaced repetition', () => {
    expect(levelFromXp(0).level).toBe(1);
    expect(levelFromXp(5000).level).toBeGreaterThan(10);
    expect(streak(['2026-11-17', '2026-11-18', '2026-11-19'], '2026-11-19').current).toBe(3);
    expect(streak(['2026-11-17', '2026-11-18'], '2026-11-19').current).toBe(2);
    let c = newCard('2026-11-19');
    c = review(c, 5, '2026-11-19');
    c = review(c, 5, '2026-11-20');
    expect(c.interval).toBe(3);
    expect(review(c, 1, '2026-11-23').interval).toBe(1);
  });
});
