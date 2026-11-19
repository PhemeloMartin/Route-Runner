/** Technical indicators - each one is just a formula applied to past prices. None of them predict the future. */

export interface Candle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
}

export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    out.push(i >= period - 1 ? sum / period : null);
  }
  return out;
}

export function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  const k = 2 / (period + 1);
  let prev: number | null = null;
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      out.push(null);
      continue;
    }
    if (prev === null) prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
    else prev = values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

/** RSI (Wilder): above 70 = "overbought", below 30 = "oversold". In strong trends it can stay there for a long time! */
export function rsi(values: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = [null];
  let gain = 0;
  let loss = 0;
  for (let i = 1; i < values.length; i++) {
    const ch = values[i] - values[i - 1];
    const g = Math.max(ch, 0);
    const l = Math.max(-ch, 0);
    if (i <= period) {
      gain += g;
      loss += l;
      if (i === period) {
        gain /= period;
        loss /= period;
        out.push(loss === 0 ? 100 : 100 - 100 / (1 + gain / loss));
      } else out.push(null);
    } else {
      gain = (gain * (period - 1) + g) / period;
      loss = (loss * (period - 1) + l) / period;
      out.push(loss === 0 ? 100 : 100 - 100 / (1 + gain / loss));
    }
  }
  return out;
}

export function macd(values: number[], fast = 12, slow = 26, signal = 9) {
  const f = ema(values, fast);
  const s = ema(values, slow);
  const line = values.map((_, i) => (f[i] !== null && s[i] !== null ? f[i]! - s[i]! : null));
  const valid = line.filter((v): v is number => v !== null);
  const sig = ema(valid, signal);
  const offset = line.length - valid.length;
  const signalLine = line.map((_, i) => (i >= offset ? sig[i - offset] : null));
  const hist = line.map((v, i) => (v !== null && signalLine[i] !== null ? v - signalLine[i]! : null));
  return { line, signal: signalLine, histogram: hist };
}

export function bollinger(values: number[], period = 20, mult = 2) {
  const mid = sma(values, period);
  const upper: (number | null)[] = [];
  const lower: (number | null)[] = [];
  for (let i = 0; i < values.length; i++) {
    if (mid[i] === null) {
      upper.push(null);
      lower.push(null);
      continue;
    }
    const slice = values.slice(i - period + 1, i + 1);
    const sd = Math.sqrt(slice.reduce((a, v) => a + (v - mid[i]!) ** 2, 0) / period);
    upper.push(mid[i]! + mult * sd);
    lower.push(mid[i]! - mult * sd);
  }
  return { mid, upper, lower };
}

/** Average True Range - "how far does price normally move per candle?" Great for placing stops. */
export function atr(c: Candle[], period = 14): (number | null)[] {
  const tr = c.map((x, i) => (i === 0 ? x.high - x.low : Math.max(x.high - x.low, Math.abs(x.high - c[i - 1].close), Math.abs(x.low - c[i - 1].close))));
  const out: (number | null)[] = [];
  let prev: number | null = null;
  for (let i = 0; i < tr.length; i++) {
    if (i < period - 1) out.push(null);
    else if (prev === null) {
      prev = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
      out.push(prev);
    } else {
      prev = (prev * (period - 1) + tr[i]) / period;
      out.push(prev);
    }
  }
  return out;
}

export type PatternName = 'Doji' | 'Hammer' | 'Shooting Star' | 'Bullish Engulfing' | 'Bearish Engulfing' | 'Inside Bar' | 'Marubozu';

export function detectPatterns(c: Candle[]): { index: number; pattern: PatternName; bias: 'bullish' | 'bearish' | 'neutral' }[] {
  const out: { index: number; pattern: PatternName; bias: 'bullish' | 'bearish' | 'neutral' }[] = [];
  for (let i = 0; i < c.length; i++) {
    const x = c[i];
    const range = x.high - x.low || 1e-9;
    const body = Math.abs(x.close - x.open);
    const upper = x.high - Math.max(x.open, x.close);
    const lower = Math.min(x.open, x.close) - x.low;
    if (body / range < 0.1) out.push({ index: i, pattern: 'Doji', bias: 'neutral' });
    else if (lower > body * 2 && upper < body * 0.5) out.push({ index: i, pattern: 'Hammer', bias: 'bullish' });
    else if (upper > body * 2 && lower < body * 0.5) out.push({ index: i, pattern: 'Shooting Star', bias: 'bearish' });
    else if (body / range > 0.9) out.push({ index: i, pattern: 'Marubozu', bias: x.close > x.open ? 'bullish' : 'bearish' });
    if (i > 0) {
      const p = c[i - 1];
      const pBull = p.close > p.open;
      const bull = x.close > x.open;
      if (!pBull && bull && x.open <= p.close && x.close >= p.open) out.push({ index: i, pattern: 'Bullish Engulfing', bias: 'bullish' });
      if (pBull && !bull && x.open >= p.close && x.close <= p.open) out.push({ index: i, pattern: 'Bearish Engulfing', bias: 'bearish' });
      if (x.high < p.high && x.low > p.low) out.push({ index: i, pattern: 'Inside Bar', bias: 'neutral' });
    }
  }
  return out;
}

/** Swing highs/lows grouped into horizontal zones = support & resistance. */
export function supportResistance(c: Candle[], lookback = 2, tolerance = 0.002): { price: number; touches: number; kind: 'support' | 'resistance' }[] {
  const pts: { price: number; kind: 'support' | 'resistance' }[] = [];
  for (let i = lookback; i < c.length - lookback; i++) {
    const win = c.slice(i - lookback, i + lookback + 1);
    if (win.every((w) => w.high <= c[i].high)) pts.push({ price: c[i].high, kind: 'resistance' });
    if (win.every((w) => w.low >= c[i].low)) pts.push({ price: c[i].low, kind: 'support' });
  }
  const zones: { price: number; touches: number; kind: 'support' | 'resistance' }[] = [];
  for (const p of pts) {
    const z = zones.find((x) => Math.abs(x.price - p.price) / p.price < tolerance);
    if (z) {
      z.price = (z.price * z.touches + p.price) / (z.touches + 1);
      z.touches++;
    } else zones.push({ price: p.price, touches: 1, kind: p.kind });
  }
  const last = c[c.length - 1]?.close ?? 0;
  return zones
    .filter((z) => z.touches >= 2)
    .map((z) => ({ ...z, kind: (z.price < last ? 'support' : 'resistance') as 'support' | 'resistance' }))
    .sort((a, b) => b.touches - a.touches)
    .slice(0, 6);
}

export function trend(values: number[], fast = 20, slow = 50): 'uptrend' | 'downtrend' | 'range' {
  const f = sma(values, fast);
  const s = sma(values, slow);
  const i = values.length - 1;
  if (f[i] === null || s[i] === null) return 'range';
  const gap = (f[i]! - s[i]!) / s[i]!;
  if (gap > 0.002 && values[i] > f[i]!) return 'uptrend';
  if (gap < -0.002 && values[i] < f[i]!) return 'downtrend';
  return 'range';
}

/** Build OHLC candles from a series of daily closes by grouping N points (e.g. 5 trading days = 1 weekly candle). */
export function candlesFromCloses(points: { time: number; value: number }[], group: number): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < points.length; i += group) {
    const g = points.slice(i, i + group);
    if (!g.length) continue;
    out.push({ time: g[0].time, open: i === 0 ? g[0].value : points[i - 1].value, high: Math.max(...g.map((x) => x.value)), low: Math.min(...g.map((x) => x.value)), close: g[g.length - 1].value });
  }
  for (const c of out) {
    c.high = Math.max(c.high, c.open);
    c.low = Math.min(c.low, c.open);
  }
  return out;
}

/** Group daily closes by ISO calendar week -> honest weekly OHLC candles built from real fixes. */
export function weeklyCandles(points: { time: number; value: number }[]): Candle[] {
  const weeks = new Map<string, { time: number; value: number }[]>();
  for (const p of points) {
    const d = new Date(p.time * 1000);
    const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7)));
    const key = monday.toISOString().slice(0, 10);
    if (!weeks.has(key)) weeks.set(key, []);
    weeks.get(key)!.push(p);
  }
  const keys = [...weeks.keys()].sort();
  const out: Candle[] = [];
  let prevClose: number | undefined;
  for (const k of keys) {
    const g = weeks.get(k)!.sort((a, b) => a.time - b.time);
    const open = prevClose ?? g[0].value;
    const close = g[g.length - 1].value;
    out.push({ time: Date.parse(k) / 1000, open, high: Math.max(open, ...g.map((x) => x.value)), low: Math.min(open, ...g.map((x) => x.value)), close });
    prevClose = close;
  }
  return out;
}
