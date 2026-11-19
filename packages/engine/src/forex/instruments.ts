/**
 * Currency pairs. "EUR/USD = 1.0850" means 1 EURO (base) costs 1.0850 US DOLLARS (quote).
 * Analogy: the base currency is the thing on the shop shelf, the quote currency is the
 * money in your wallet you pay with.
 */
export type Category = 'major' | 'minor' | 'exotic' | 'metal';

export interface Instrument {
  symbol: string; // EURUSD
  base: string;
  quote: string;
  pipSize: number; // 0.0001 for most, 0.01 for JPY pairs
  digits: number; // price decimals shown by brokers (one more than the pip = pipette)
  contractSize: number; // units in 1 standard lot
  category: Category;
  typicalSpreadPips: number;
  nickname?: string;
  notes: string;
}

export const INSTRUMENTS: Instrument[] = [
  { symbol: 'EURUSD', base: 'EUR', quote: 'USD', pipSize: 0.0001, digits: 5, contractSize: 100000, category: 'major', typicalSpreadPips: 0.8, nickname: 'Fiber', notes: 'Most traded pair in the world (~22% of all FX volume). Moves on ECB vs Fed decisions.' },
  { symbol: 'GBPUSD', base: 'GBP', quote: 'USD', pipSize: 0.0001, digits: 5, contractSize: 100000, category: 'major', typicalSpreadPips: 1.2, nickname: 'Cable', notes: 'Named after the transatlantic telegraph cable. Volatile around UK data and Bank of England.' },
  { symbol: 'USDJPY', base: 'USD', quote: 'JPY', pipSize: 0.01, digits: 3, contractSize: 100000, category: 'major', typicalSpreadPips: 1.0, nickname: 'Gopher', notes: 'JPY pairs use 0.01 as one pip. Sensitive to US yields and Bank of Japan policy.' },
  { symbol: 'USDCHF', base: 'USD', quote: 'CHF', pipSize: 0.0001, digits: 5, contractSize: 100000, category: 'major', typicalSpreadPips: 1.4, nickname: 'Swissie', notes: 'The franc is a "safe haven" - it often strengthens when the world is scared.' },
  { symbol: 'AUDUSD', base: 'AUD', quote: 'USD', pipSize: 0.0001, digits: 5, contractSize: 100000, category: 'major', typicalSpreadPips: 1.0, nickname: 'Aussie', notes: 'A "commodity currency" - linked to iron ore and China demand.' },
  { symbol: 'USDCAD', base: 'USD', quote: 'CAD', pipSize: 0.0001, digits: 5, contractSize: 100000, category: 'major', typicalSpreadPips: 1.5, nickname: 'Loonie', notes: 'Moves with oil prices (Canada exports a lot of oil).' },
  { symbol: 'NZDUSD', base: 'NZD', quote: 'USD', pipSize: 0.0001, digits: 5, contractSize: 100000, category: 'major', typicalSpreadPips: 1.6, nickname: 'Kiwi', notes: 'Dairy and agriculture commodity currency.' },
  { symbol: 'EURGBP', base: 'EUR', quote: 'GBP', pipSize: 0.0001, digits: 5, contractSize: 100000, category: 'minor', typicalSpreadPips: 1.5, notes: 'A "cross" - no USD in it. Usually moves slowly.' },
  { symbol: 'EURJPY', base: 'EUR', quote: 'JPY', pipSize: 0.01, digits: 3, contractSize: 100000, category: 'minor', typicalSpreadPips: 1.8, notes: 'Popular cross; risk-on/risk-off barometer.' },
  { symbol: 'GBPJPY', base: 'GBP', quote: 'JPY', pipSize: 0.01, digits: 3, contractSize: 100000, category: 'minor', typicalSpreadPips: 2.5, nickname: 'The Beast', notes: 'Very volatile - beginners get hurt here. Respect position size.' },
  { symbol: 'USDZAR', base: 'USD', quote: 'ZAR', pipSize: 0.0001, digits: 5, contractSize: 100000, category: 'exotic', typicalSpreadPips: 80, notes: 'The rand: an emerging-market currency. Wide spreads, big moves on SARB, load-shedding, politics and global risk mood. When the world is scared, the rand usually weakens.' },
  { symbol: 'EURZAR', base: 'EUR', quote: 'ZAR', pipSize: 0.0001, digits: 5, contractSize: 100000, category: 'exotic', typicalSpreadPips: 120, notes: 'Euro vs rand - exotic, wide spread.' },
  { symbol: 'GBPZAR', base: 'GBP', quote: 'ZAR', pipSize: 0.0001, digits: 5, contractSize: 100000, category: 'exotic', typicalSpreadPips: 150, notes: 'Pound vs rand - very volatile exotic.' },
  { symbol: 'XAUUSD', base: 'XAU', quote: 'USD', pipSize: 0.1, digits: 2, contractSize: 100, category: 'metal', typicalSpreadPips: 2.5, nickname: 'Gold', notes: 'Gold priced in USD (1 lot = 100 troy ounces). Not a currency, but every FX broker offers it. South Africa is a major gold producer.' },
];

export function instrument(symbol: string): Instrument {
  const s = symbol.replace('/', '').toUpperCase();
  const i = INSTRUMENTS.find((x) => x.symbol === s);
  if (!i) throw new Error(`Unknown instrument ${symbol}`);
  return i;
}

export const LOTS = [
  { name: 'Standard lot', lots: 1, units: 100000, plain: '1.00 lot = 100,000 units. On EUR/USD each pip is worth about $10.' },
  { name: 'Mini lot', lots: 0.1, units: 10000, plain: '0.10 lot = 10,000 units. About $1 per pip on EUR/USD.' },
  { name: 'Micro lot', lots: 0.01, units: 1000, plain: '0.01 lot = 1,000 units. About $0.10 per pip - the beginner size.' },
  { name: 'Nano lot', lots: 0.001, units: 100, plain: '0.001 lot = 100 units (cent accounts only). About $0.01 per pip.' },
];

/**
 * Trading sessions in South African Standard Time (SAST = UTC+2, no daylight saving).
 * Times shift by 1 hour when Europe/US are on summer time.
 */
export const SESSIONS = [
  { name: 'Sydney', sastOpen: 0, sastClose: 9, utcOpen: 22, utcClose: 7, plain: 'Quietest. AUD/NZD move a little.' },
  { name: 'Tokyo', sastOpen: 2, sastClose: 11, utcOpen: 0, utcClose: 9, plain: 'Asian session. JPY pairs wake up.' },
  { name: 'London', sastOpen: 10, sastClose: 19, utcOpen: 8, utcClose: 17, plain: 'Biggest session (~38% of volume). EUR, GBP, CHF very active.' },
  { name: 'New York', sastOpen: 15, sastClose: 24, utcOpen: 13, utcClose: 22, plain: 'USD news (NFP, CPI, Fed) hits at 14:30 or 15:30 SAST.' },
];

export function activeSessions(date: Date): string[] {
  const h = date.getUTCHours() + date.getUTCMinutes() / 60;
  return SESSIONS.filter((s) => (s.utcOpen < s.utcClose ? h >= s.utcOpen && h < s.utcClose : h >= s.utcOpen || h < s.utcClose)).map((s) => s.name);
}

export function isMarketOpen(date: Date): boolean {
  // FX runs 24/5: Sunday 22:00 UTC (Sydney open) to Friday 22:00 UTC (New York close).
  const d = date.getUTCDay();
  const h = date.getUTCHours();
  if (d === 6) return false;
  if (d === 0) return h >= 22;
  if (d === 5) return h < 22;
  return true;
}
