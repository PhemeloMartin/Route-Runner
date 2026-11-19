// Downloads real daily FX reference rates (European Central Bank, via frankfurter.dev - free, no API key)
// and writes data/seed/market.json so the Trading Floor works offline from the very first launch.
// Usage: npm run market:seed
import fs from 'node:fs';
import path from 'node:path';

const FROM = process.argv[2] ?? '2022-01-01';
const TO = new Date().toISOString().slice(0, 10);
const QUERIES = [
  { base: 'EUR', quotes: ['USD', 'GBP', 'JPY', 'ZAR'] },
  { base: 'USD', quotes: ['JPY', 'CHF', 'CAD', 'ZAR'] },
  { base: 'GBP', quotes: ['USD', 'JPY', 'ZAR'] },
  { base: 'AUD', quotes: ['USD'] },
  { base: 'NZD', quotes: ['USD'] },
];

const series = {};
for (const q of QUERIES) {
  const url = `https://api.frankfurter.dev/v1/${FROM}..${TO}?base=${q.base}&symbols=${q.quotes.join(',')}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'route-runner-learning-game' } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  const body = await res.json();
  for (const [day, rates] of Object.entries(body.rates)) {
    for (const [quote, value] of Object.entries(rates)) (series[`${q.base}${quote}`] ??= []).push([day, value]);
  }
  console.log(`fetched ${q.base} -> ${q.quotes.join(',')}`);
}
for (const s of Object.values(series)) s.sort((a, b) => a[0].localeCompare(b[0]));
const out = path.resolve('data', 'seed', 'market.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ source: 'European Central Bank reference rates via https://frankfurter.dev', generatedAt: new Date().toISOString(), series }));
console.log(`wrote ${out}: ${Object.keys(series).length} pairs, ${Object.values(series)[0].length} days each`);
