import { useEffect, useMemo, useRef, useState } from 'react';
import { createChart, CrosshairMode, LineStyle, type IChartApi, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts';
import {
  INSTRUMENTS,
  SESSIONS,
  PaperAccount,
  activeSessions,
  detectPatterns,
  expectancy,
  instrument,
  isMarketOpen,
  losingStreak,
  marginRequired,
  pipValue,
  positionSize,
  profit,
  recoveryNeeded,
  rsi,
  sma,
  supportResistance,
  trend,
  usdRatesFrom,
  type Candle,
  type Position,
} from '@route-runner/engine';
import { api, type TradeRow } from '../api';
import { useGame } from '../store';
import { Panel } from '../ui/Panel';
import { sfx } from '../sfx';

type Tab = 'trade' | 'journal' | 'calc' | 'learn';
const SETUPS = ['Trend pullback to MA', 'Support/resistance bounce', 'Breakout & retest', 'Candlestick reversal at level', 'RSI divergence', 'News / fundamental', 'No plan (impulse)'];
const EMOTIONS = ['Calm & patient', 'Confident', 'Anxious', 'FOMO', 'Revenge (after a loss)', 'Bored', 'Greedy'];

function store<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function persist(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage unavailable */
  }
}

export default function TradingFloor() {
  const { reward, open } = useGame();
  const [tab, setTab] = useState<Tab>('trade');
  const [symbols, setSymbols] = useState<Awaited<ReturnType<typeof api.marketSymbols>> | null>(null);
  const [symbol, setSymbol] = useState<string>(() => store('rr.fx.symbol', 'USDZAR'));
  const [tf, setTf] = useState<'D' | 'W'>(() => store('rr.fx.tf', 'D'));
  const [all, setAll] = useState<Candle[]>([]);
  const [mode, setMode] = useState<'replay' | 'live'>(() => store('rr.fx.mode', 'replay'));
  const [cursor, setCursor] = useState<number>(-1);
  const [accounts, setAccounts] = useState<Awaited<ReturnType<typeof api.accounts>>>([]);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [trades, setTrades] = useState<TradeRow[]>([]);
  const [overlay, setOverlay] = useState({ sma: true, rsi: true, sr: true, patterns: false });
  const [refreshMsg, setRefreshMsg] = useState('');

  useEffect(() => {
    api.marketSymbols().then(setSymbols).catch(() => undefined);
    api.accounts().then((a) => {
      setAccounts(a);
      setAccountId((cur) => cur ?? a[0]?.id ?? null);
    });
  }, []);
  useEffect(() => {
    persist('rr.fx.symbol', symbol);
    persist('rr.fx.tf', tf);
    persist('rr.fx.mode', mode);
    api.candles(symbol, tf, tf === 'D' ? 1300 : 300).then((r) => {
      setAll(r.candles);
      const saved = store<number>(`rr.fx.cursor.${symbol}.${tf}`, -1);
      setCursor(saved > 30 && saved < r.candles.length ? saved : Math.floor(r.candles.length * 0.6));
    });
  }, [symbol, tf, mode]);
  useEffect(() => {
    if (accountId) api.trades(accountId).then(setTrades);
  }, [accountId]);

  const visible = mode === 'replay' ? all.slice(0, cursor + 1) : all;
  const current = visible[visible.length - 1];
  const usd = useMemo(() => usdRatesFrom(Object.fromEntries(Object.entries(symbols?.latest ?? {}).map(([k, v]) => [k, v.close]))), [symbols]);
  const account = accounts.find((a) => a.id === accountId);
  const inst = INSTRUMENTS.find((i) => i.symbol === symbol)!;

  // Paper engine mirrors the open server-side trades so SL/TP fill on each new bar
  const paper = useMemo(() => {
    if (!account) return null;
    const p = new PaperAccount({ currency: account.currency, balance: account.balance, startBalance: account.start_balance, leverage: account.leverage, positions: [], nextId: 1 }, usd);
    for (const t of trades.filter((x) => x.status === 'open'))
      p.s.positions.push({ id: t.id, symbol: t.symbol, side: t.side, lots: t.lots, entry: t.entry, sl: t.sl ?? undefined, tp: t.tp ?? undefined, openTime: Date.parse(t.opened_at) / 1000, status: 'open' } as Position);
    return p;
  }, [account, trades, usd]);

  const reloadAccount = async () => {
    const a = await api.accounts();
    setAccounts(a);
    if (accountId) setTrades(await api.trades(accountId));
  };

  const nextBar = async (n = 1) => {
    if (mode !== 'replay' || !paper) return;
    let c = cursor;
    for (let k = 0; k < n && c < all.length - 1; k++) {
      c++;
      const closed = paper.onCandle(symbol, all[c]);
      for (const p of closed) {
        const r = await api.closeTrade(p.id, p.exit!, p.pnl!, p.reason!, new Date(all[c].time * 1000).toISOString());
        useGame.getState().toast({ text: `${p.reason === 'tp' ? '🎯 Take-profit' : p.reason === 'sl' ? '🛑 Stop-loss' : 'Closed'}: ${p.symbol} ${p.pnl! >= 0 ? '+' : ''}${p.pnl!.toFixed(2)} ${account?.currency}`, tone: p.pnl! >= 0 ? 'xp' : 'error' });
        reward({ xp: 0, achievements: r.achievements });
      }
    }
    setCursor(c);
    persist(`rr.fx.cursor.${symbol}.${tf}`, c);
    if (paper.s.positions.some((p) => p.status === 'closed')) void reloadAccount();
  };

  return (
    <Panel
      title="Trading Floor - Forex"
      icon="📈"
      color="#22c55e"
      flush
      actions={
        <div className="row">
          <div className="tabs">
            {(['trade', 'journal', 'calc', 'learn'] as Tab[]).map((t) => (
              <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
                {{ trade: '📊 Chart & trade', journal: '📓 Journal', calc: '🧮 Calculators', learn: '📚 Learn' }[t]}
              </button>
            ))}
          </div>
        </div>
      }
    >
      <div style={{ padding: '6px 14px', background: '#1a1405', borderBottom: '1px solid #3f3312', fontSize: 12.5, color: '#fcd34d' }}>
        ⚠ Education only - not financial advice. Most retail traders who trade leveraged CFDs/forex lose money. In Route Runner you trade DEMO money; prove consistency for months before ever considering real funds, and only with an FSCA-regulated broker.
      </div>
      {tab === 'trade' && (
        <div className="split" style={{ gridTemplateColumns: '190px minmax(0, 1fr) 330px', height: 'calc(100% - 30px)' }}>
          <Watchlist symbols={symbols} symbol={symbol} setSymbol={setSymbol} onRefresh={async () => { setRefreshMsg('Fetching latest ECB data...'); const r = await api.refreshMarket(); setRefreshMsg(r.ok ? `+${r.added} new days` : `Offline - using saved data`); setSymbols(await api.marketSymbols()); }} msg={refreshMsg} />
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div className="row wrap" style={{ padding: 8, borderBottom: '1px solid var(--line)' }}>
              <b style={{ fontSize: 18 }}>{inst.base}/{inst.quote}</b>
              {inst.nickname && <span className="pill">"{inst.nickname}"</span>}
              <span className="pill">{inst.category}</span>
              {current && <b className="mono" style={{ fontSize: 18 }}>{current.close.toFixed(inst.digits - 1)}</b>}
              {current && <span className="dim">{new Date(current.time * 1000).toDateString()}</span>}
              <span className="grow" />
              <div className="tabs">
                {(['D', 'W'] as const).map((x) => <button key={x} className={`tab ${tf === x ? 'active' : ''}`} onClick={() => setTf(x)}>{x === 'D' ? 'Daily' : 'Weekly'}</button>)}
              </div>
              <div className="tabs">
                <button className={`tab ${mode === 'replay' ? 'active' : ''}`} onClick={() => setMode('replay')} title="Practise on real history: the future is hidden until you press Next">⏪ Bar replay</button>
                <button className={`tab ${mode === 'live' ? 'active' : ''}`} onClick={() => setMode('live')} title="Latest real data">🔴 Latest</button>
              </div>
            </div>
            <div className="row wrap" style={{ padding: '4px 8px', fontSize: 13 }}>
              {(['sma', 'rsi', 'sr', 'patterns'] as const).map((k) => (
                <label key={k} className="row" style={{ gap: 4 }}>
                  <input type="checkbox" checked={overlay[k]} onChange={(e) => setOverlay({ ...overlay, [k]: e.target.checked })} />
                  {{ sma: 'SMA 20/50', rsi: 'RSI 14', sr: 'Support/Resistance', patterns: 'Candle patterns' }[k]}
                </label>
              ))}
              {visible.length > 60 && <span className="pill">Trend: {trend(visible.map((c) => c.close))}</span>}
              <span className="grow" />
              {mode === 'replay' && (
                <>
                  <button className="btn small" onClick={() => void nextBar(1)}>▶ Next bar</button>
                  <button className="btn small" onClick={() => void nextBar(5)}>⏩ +5</button>
                  <span className="dim">{all.length - cursor - 1} bars hidden</span>
                </>
              )}
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <Chart candles={visible} digits={inst.digits} overlay={overlay} trades={trades.filter((t) => t.status === 'open' && t.symbol === symbol)} />
            </div>
            <div className="dim" style={{ fontSize: 11, padding: '2px 8px' }}>
              Data: European Central Bank daily reference rates via frankfurter.dev. Daily candle = previous fix → today's fix; weekly candles are built from the daily fixes. Your broker's intraday highs/lows will differ.
            </div>
          </div>
          <OrderTicket
            symbol={symbol}
            price={current?.close}
            time={current?.time}
            account={account}
            accounts={accounts}
            setAccountId={setAccountId}
            paper={paper}
            usd={usd}
            mode={mode}
            trades={trades}
            onPlaced={async (r) => {
              reward({ xp: r.xp, achievements: r.achievements }, 'Trade placed');
              await reloadAccount();
            }}
            onClose={async (t) => {
              if (!current || !paper) return;
              const pnl = Math.round(profit(t.symbol, t.side, t.lots, t.entry, current.close, account!.currency, usd) * 100) / 100;
              const r = await api.closeTrade(t.id, current.close, pnl, 'manual', new Date(current.time * 1000).toISOString());
              reward({ xp: 0, achievements: r.achievements });
              sfx(pnl >= 0 ? 'xp' : 'wrong');
              await reloadAccount();
            }}
            onReset={async () => {
              if (!account || !confirm(`Reset ${account.name} back to ${account.start_balance} ${account.currency}? All its trades are deleted.`)) return;
              await api.resetAccount(account.id);
              await reloadAccount();
            }}
          />
        </div>
      )}
      {tab === 'journal' && <Journal trades={trades} account={account} onSaved={reloadAccount} />}
      {tab === 'calc' && <Calculators usd={usd} />}
      {tab === 'learn' && (
        <div style={{ padding: 20 }} className="col">
          <h2>📚 Forex Academy</h2>
          <p className="muted">You know nothing about forex yet - perfect. The Forex stream starts from "what is a currency?" and goes all the way to risk management, psychology and the South African rules (FSCA, SARS). Complete lessons, then come back here and practise with bar replay.</p>
          <button className="btn primary" onClick={() => open({ kind: 'academy', stream: 'forex' })}>Open the Forex lessons</button>
          <SessionClock />
          <div className="grid-2">
            {INSTRUMENTS.map((i) => (
              <div key={i.symbol} className="term">
                <b>{i.base}/{i.quote}</b> {i.nickname ? `"${i.nickname}"` : ''} <span className="pill">{i.category}</span> - {i.notes} <span className="dim">Pip = {i.pipSize}. Typical spread ≈ {i.typicalSpreadPips} pips.</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}

function Watchlist({ symbols, symbol, setSymbol, onRefresh, msg }: { symbols: Awaited<ReturnType<typeof api.marketSymbols>> | null; symbol: string; setSymbol: (s: string) => void; onRefresh: () => void; msg: string }) {
  return (
    <div style={{ borderRight: '1px solid var(--line)', overflow: 'auto', padding: 8 }} className="col">
      <b style={{ fontSize: 13 }}>Watchlist</b>
      {symbols?.symbols.map((s) => {
        const l = symbols.latest[s];
        const i = instrument(s);
        return (
          <button key={s} className="btn small" style={{ justifyContent: 'space-between', borderColor: s === symbol ? '#22c55e' : undefined }} onClick={() => setSymbol(s)}>
            <span>{i.base}/{i.quote}</span>
            {l && <span className="mono" style={{ color: l.change >= 0 ? '#4ade80' : '#f87171', fontSize: 12 }}>{l.change >= 0 ? '▲' : '▼'}{Math.abs(l.change * 100).toFixed(2)}%</span>}
          </button>
        );
      })}
      <button className="btn small" onClick={onRefresh}>⟳ Update data</button>
      <div className="dim" style={{ fontSize: 11 }}>{msg || 'Works offline with saved data.'}</div>
      <SessionClock compact />
    </div>
  );
}

function SessionClock({ compact }: { compact?: boolean }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);
  const active = activeSessions(now);
  const sast = new Date(now.getTime() + 2 * 3600000).toISOString().slice(11, 16);
  return (
    <div className="card" style={{ padding: 8, fontSize: compact ? 12 : 14 }}>
      <b>🕒 {sast} SAST</b> {isMarketOpen(now) ? '' : <span className="pill">market closed (weekend)</span>}
      {SESSIONS.map((s) => (
        <div key={s.name} className="row" style={{ justifyContent: 'space-between', color: active.includes(s.name) ? '#4ade80' : 'var(--dim)' }}>
          <span>{active.includes(s.name) ? '●' : '○'} {s.name}</span>
          <span className="mono">{String(s.sastOpen).padStart(2, '0')}:00-{String(s.sastClose % 24).padStart(2, '0')}:00</span>
        </div>
      ))}
      {!compact && <div className="dim" style={{ marginTop: 6 }}>The London-New York overlap (15:00-19:00 SAST) is usually the most liquid time of the day. Times shift 1 hour when Europe/US use summer time.</div>}
    </div>
  );
}

function Chart({ candles, digits, overlay, trades }: { candles: Candle[]; digits: number; overlay: { sma: boolean; rsi: boolean; sr: boolean; patterns: boolean }; trades: TradeRow[] }) {
  const box = useRef<HTMLDivElement>(null);
  const rsiBox = useRef<HTMLDivElement>(null);
  const charts = useRef<{ main?: IChartApi; rsi?: IChartApi; series?: ISeriesApi<'Candlestick'>; s20?: ISeriesApi<'Line'>; s50?: ISeriesApi<'Line'>; rsiLine?: ISeriesApi<'Line'> }>({});

  useEffect(() => {
    const opts = { layout: { background: { color: '#070b14' }, textColor: '#93a4c3' }, grid: { vertLines: { color: '#111a2e' }, horzLines: { color: '#111a2e' } }, crosshair: { mode: CrosshairMode.Normal }, rightPriceScale: { borderColor: '#24324f' }, timeScale: { borderColor: '#24324f' }, autoSize: true };
    const main = createChart(box.current!, opts);
    const series = main.addCandlestickSeries({ upColor: '#22c55e', downColor: '#ef4444', wickUpColor: '#22c55e', wickDownColor: '#ef4444', borderVisible: false, priceFormat: { type: 'price', precision: digits - 1, minMove: 1 / 10 ** (digits - 1) } });
    const s20 = main.addLineSeries({ color: '#f59e0b', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    const s50 = main.addLineSeries({ color: '#60a5fa', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    const r = createChart(rsiBox.current!, { ...opts, timeScale: { visible: false } });
    const rsiLine = r.addLineSeries({ color: '#c084fc', lineWidth: 1, priceLineVisible: false });
    rsiLine.createPriceLine({ price: 70, color: '#ef4444', lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: true, title: '70' });
    rsiLine.createPriceLine({ price: 30, color: '#22c55e', lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: true, title: '30' });
    main.timeScale().subscribeVisibleLogicalRangeChange((range) => range && r.timeScale().setVisibleLogicalRange(range));
    charts.current = { main, rsi: r, series, s20, s50, rsiLine };
    return () => {
      main.remove();
      r.remove();
    };
  }, [digits]);

  useEffect(() => {
    const c = charts.current;
    if (!c.series || !candles.length) return;
    const t = (x: Candle) => x.time as UTCTimestamp;
    c.series.setData(candles.map((x) => ({ time: t(x), open: x.open, high: x.high, low: x.low, close: x.close })));
    const closes = candles.map((x) => x.close);
    const line = (vals: (number | null)[]) => vals.map((v, i) => (v === null ? null : { time: t(candles[i]), value: v })).filter(Boolean) as { time: UTCTimestamp; value: number }[];
    c.s20!.setData(overlay.sma ? line(sma(closes, 20)) : []);
    c.s50!.setData(overlay.sma ? line(sma(closes, 50)) : []);
    c.rsiLine!.setData(overlay.rsi ? line(rsi(closes, 14)) : []);
    // markers: candle patterns
    const pats = overlay.patterns ? detectPatterns(candles).filter((p) => p.pattern !== 'Inside Bar' && p.index > candles.length - 80) : [];
    c.series.setMarkers(pats.map((p) => ({ time: t(candles[p.index]), position: p.bias === 'bearish' ? 'aboveBar' : 'belowBar', color: p.bias === 'bullish' ? '#22c55e' : p.bias === 'bearish' ? '#ef4444' : '#94a3b8', shape: p.bias === 'bullish' ? 'arrowUp' : p.bias === 'bearish' ? 'arrowDown' : 'circle', text: p.pattern })));
    // price lines: S/R + open trades
    const lines = (c.series as unknown as { __lines?: ReturnType<ISeriesApi<'Candlestick'>['createPriceLine']>[] }).__lines ?? [];
    lines.forEach((l) => c.series!.removePriceLine(l));
    const next: typeof lines = [];
    if (overlay.sr) for (const z of supportResistance(candles.slice(-200), 2, 0.004)) next.push(c.series.createPriceLine({ price: z.price, color: z.kind === 'support' ? '#16a34a' : '#b91c1c', lineStyle: LineStyle.Dotted, lineWidth: 1, axisLabelVisible: false, title: `${z.kind} (${z.touches} touches)` }));
    for (const tr of trades) {
      next.push(c.series.createPriceLine({ price: tr.entry, color: '#e5e7eb', lineWidth: 1, lineStyle: LineStyle.Solid, title: `${tr.side.toUpperCase()} ${tr.lots}` }));
      if (tr.sl) next.push(c.series.createPriceLine({ price: tr.sl, color: '#ef4444', lineWidth: 1, lineStyle: LineStyle.Dashed, title: 'SL' }));
      if (tr.tp) next.push(c.series.createPriceLine({ price: tr.tp, color: '#22c55e', lineWidth: 1, lineStyle: LineStyle.Dashed, title: 'TP' }));
    }
    (c.series as unknown as { __lines?: typeof next }).__lines = next;
  }, [candles, overlay, trades]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div ref={box} style={{ flex: overlay.rsi ? 3 : 1, minHeight: 0 }} />
      <div ref={rsiBox} style={{ flex: overlay.rsi ? 1 : 0, minHeight: 0, display: overlay.rsi ? 'block' : 'none', borderTop: '1px solid var(--line)' }} />
    </div>
  );
}

function OrderTicket({ symbol, price, time, account, accounts, setAccountId, paper, usd, mode, trades, onPlaced, onClose, onReset }: {
  symbol: string;
  price?: number;
  time?: number;
  account?: { id: number; name: string; currency: string; balance: number; start_balance: number; leverage: number };
  accounts: { id: number; name: string; currency: string; balance: number }[];
  setAccountId: (id: number) => void;
  paper: PaperAccount | null;
  usd: Record<string, number>;
  mode: 'replay' | 'live';
  trades: TradeRow[];
  onPlaced: (r: { xp: number; achievements: { id: string; title: string; icon: string; xp: number }[] }) => void;
  onClose: (t: TradeRow) => void;
  onReset: () => void;
}) {
  const inst = instrument(symbol);
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [lots, setLots] = useState(0.01);
  const [slPips, setSlPips] = useState(inst.category === 'exotic' ? 400 : 40);
  const [tpPips, setTpPips] = useState(inst.category === 'exotic' ? 800 : 80);
  const [risk, setRisk] = useState(1);
  const [setup, setSetup] = useState('');
  const [emotion, setEmotion] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => {
    setSlPips(inst.category === 'exotic' ? 400 : 40);
    setTpPips(inst.category === 'exotic' ? 800 : 80);
  }, [symbol, inst.category]);
  if (!account || !price || !usd[inst.base] || !usd[inst.quote]) return <div style={{ padding: 12 }} className="muted">Loading account and prices...</div>;
  const dir = side === 'buy' ? 1 : -1;
  const sl = price - dir * slPips * inst.pipSize;
  const tp = price + dir * tpPips * inst.pipSize;
  const pv = pipValue(inst, lots, account.currency, usd);
  const riskMoney = pv * slPips;
  const riskPct = (riskMoney / account.balance) * 100;
  const margin = marginRequired(inst, lots, account.leverage, account.currency, usd);
  const open = trades.filter((t) => t.status === 'open');
  const autoSize = () => setLots(Math.max(0.01, positionSize({ balance: account.balance, riskPercent: risk, stopPips: slPips, symbol, accountCcy: account.currency, usd }).lots));
  const place = async () => {
    setErr('');
    const r = paper!.open({ symbol, side, lots, sl, tp }, price, time ?? 0);
    if (!r.ok) return setErr(r.error);
    const res = await api.openTrade({ accountId: account.id, symbol, side, lots, entry: r.position.entry, sl, tp, riskPercent: Math.round(riskPct * 100) / 100, mode, setup: setup || undefined, emotion: emotion || undefined, notes: undefined, openedAt: new Date((time ?? Date.now() / 1000) * 1000).toISOString() });
    sfx('click');
    onPlaced(res);
  };
  const fmt = (n: number) => n.toFixed(inst.digits - 1);
  const cur = account.currency === 'ZAR' ? 'R' : '$';
  return (
    <div style={{ borderLeft: '1px solid var(--line)', overflow: 'auto', padding: 10 }} className="col">
      <div className="row">
        <select value={account.id} onChange={(e) => setAccountId(Number(e.target.value))} className="grow">
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <button className="btn small" onClick={onReset} title="Reset demo account">↺</button>
      </div>
      <div className="card" style={{ padding: 8 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}><span className="muted">Balance</span><b className="mono">{cur}{account.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</b></div>
        <div className="row" style={{ justifyContent: 'space-between', fontSize: 12 }}><span className="dim">Leverage 1:{account.leverage} (EU/UK retail cap - SA brokers often allow far more, which is a risk, not a perk)</span><span className={account.balance >= account.start_balance ? '' : ''} style={{ color: account.balance >= account.start_balance ? '#4ade80' : '#f87171' }}>{(((account.balance - account.start_balance) / account.start_balance) * 100).toFixed(2)}%</span></div>
      </div>
      <div className="row">
        <button className={`btn grow ${side === 'buy' ? 'good' : ''}`} onClick={() => setSide('buy')}>BUY (long)</button>
        <button className={`btn grow ${side === 'sell' ? 'danger' : ''}`} onClick={() => setSide('sell')}>SELL (short)</button>
      </div>
      <label className="row">Lots <input type="number" step={0.01} min={0.01} value={lots} onChange={(e) => setLots(Math.max(0.01, Math.round(Number(e.target.value) * 100) / 100))} style={{ width: 90 }} /> <span className="dim">{(lots * inst.contractSize).toLocaleString()} {inst.base}</span></label>
      <label className="row">Stop-loss <input type="number" value={slPips} min={1} onChange={(e) => setSlPips(Math.max(1, Number(e.target.value)))} style={{ width: 80 }} /> pips <span className="mono dim">{fmt(sl)}</span></label>
      <label className="row">Take-profit <input type="number" value={tpPips} min={1} onChange={(e) => setTpPips(Math.max(1, Number(e.target.value)))} style={{ width: 80 }} /> pips <span className="mono dim">{fmt(tp)}</span></label>
      <div className="row"><span className="muted">Risk</span><input type="number" step={0.25} min={0.25} max={5} value={risk} onChange={(e) => setRisk(Number(e.target.value))} style={{ width: 70 }} />% <button className="btn small" onClick={autoSize}>Size it for me</button></div>
      <div className="card mono" style={{ padding: 8, fontSize: 12.5, lineHeight: 1.7 }}>
        <div>Entry ≈ {fmt(price)} (+spread {inst.typicalSpreadPips} pips)</div>
        <div>Pip value: {cur}{pv.toFixed(2)} per pip</div>
        <div style={{ color: riskPct > 2 ? '#f87171' : '#4ade80' }}>Risk if stopped: {cur}{riskMoney.toFixed(2)} = {riskPct.toFixed(2)}% {riskPct > 2 ? '⚠ above 2%!' : '✓'}</div>
        <div>Reward if target: {cur}{(pv * tpPips).toFixed(2)} · R:R 1:{(tpPips / slPips).toFixed(2)}</div>
        <div>Margin used: {cur}{margin.toFixed(2)}</div>
      </div>
      <select value={setup} onChange={(e) => setSetup(e.target.value)}><option value="">Why am I taking this trade? (setup)</option>{SETUPS.map((s) => <option key={s}>{s}</option>)}</select>
      <select value={emotion} onChange={(e) => setEmotion(e.target.value)}><option value="">How do I feel right now?</option>{EMOTIONS.map((s) => <option key={s}>{s}</option>)}</select>
      {err && <div className="explain" style={{ borderColor: '#ef4444' }}>{err}</div>}
      <button className={`btn ${side === 'buy' ? 'good' : 'danger'}`} onClick={() => void place()} disabled={!paper}>
        {side === 'buy' ? 'BUY' : 'SELL'} {lots} {inst.base}/{inst.quote} @ {fmt(price)}
      </button>
      {mode === 'replay' && <div className="dim" style={{ fontSize: 12 }}>Replay: after entering, press "Next bar" - stops and targets fill automatically, like a real platform.</div>}
      <b style={{ marginTop: 6 }}>Open positions ({open.length})</b>
      {open.map((t) => {
        const pl = profit(t.symbol, t.side, t.lots, t.entry, t.symbol === symbol ? price : t.entry, account.currency, usd);
        return (
          <div key={t.id} className="card row" style={{ padding: 8, fontSize: 13 }}>
            <div className="grow">
              <b style={{ color: t.side === 'buy' ? '#4ade80' : '#f87171' }}>{t.side.toUpperCase()}</b> {t.lots} {t.symbol}
              <div className="dim mono">@{t.entry.toFixed(5)} SL {t.sl?.toFixed(5) ?? '-'} TP {t.tp?.toFixed(5) ?? '-'}</div>
            </div>
            <span className="mono" style={{ color: pl >= 0 ? '#4ade80' : '#f87171' }}>{pl >= 0 ? '+' : ''}{pl.toFixed(2)}</span>
            <button className="btn small" disabled={t.symbol !== symbol} title={t.symbol !== symbol ? 'Switch to this symbol to close it' : 'Close at current price'} onClick={() => onClose(t)}>✕</button>
          </div>
        );
      })}
    </div>
  );
}

function Journal({ trades, account, onSaved }: { trades: TradeRow[]; account?: { currency: string; start_balance: number }; onSaved: () => void }) {
  const closed = trades.filter((t) => t.status === 'closed');
  const wins = closed.filter((t) => (t.pnl ?? 0) > 0);
  const gw = wins.reduce((a, t) => a + (t.pnl ?? 0), 0);
  const gl = Math.abs(closed.filter((t) => (t.pnl ?? 0) <= 0).reduce((a, t) => a + (t.pnl ?? 0), 0));
  const disciplined = closed.filter((t) => t.sl !== null && (t.risk_percent ?? 100) <= 2.05).length;
  const { reward } = useGame();
  return (
    <div style={{ padding: 16 }} className="col">
      <div className="grid-auto">
        {[
          ['Closed trades', closed.length],
          ['Win rate', closed.length ? `${((wins.length / closed.length) * 100).toFixed(0)}%` : '-'],
          ['Profit factor', gl ? (gw / gl).toFixed(2) : gw ? '∞' : '-'],
          ['Net P/L', `${(gw - gl).toFixed(2)} ${account?.currency ?? ''}`],
          ['Disciplined (SL & ≤2%)', `${disciplined}/${closed.length}`],
          ['Expectancy (R)', closed.length ? expectancy(wins.length / closed.length, gl && wins.length ? gw / wins.length / (gl / Math.max(1, closed.length - wins.length)) : 1).toFixed(2) : '-'],
        ].map(([k, v]) => (
          <div key={k} className="card"><div className="dim" style={{ fontSize: 12 }}>{k}</div><b style={{ fontSize: 20 }}>{v}</b></div>
        ))}
      </div>
      <p className="muted" style={{ margin: 0 }}>Professional traders review every trade. Fill in the setup and your emotion for each one (+15 XP each) - patterns in YOUR behaviour show up fast.</p>
      <table className="lesson" style={{ fontSize: 13 }}>
        <thead><tr><th>Date</th><th>Trade</th><th>Result</th><th>Setup</th><th>Emotion</th><th>Notes / lesson</th><th></th></tr></thead>
        <tbody>
          {trades.map((t) => <JournalRow key={t.id} t={t} onSaved={async (r) => { reward(r, 'Journal entry'); onSaved(); }} />)}
        </tbody>
      </table>
    </div>
  );
}

function JournalRow({ t, onSaved }: { t: TradeRow; onSaved: (r: { xp: number; achievements: { id: string; title: string; icon: string; xp: number }[] }) => void }) {
  const [setup, setSetup] = useState(t.setup ?? '');
  const [emotion, setEmotion] = useState(t.emotion ?? '');
  const [notes, setNotes] = useState(t.notes ?? '');
  return (
    <tr>
      <td className="mono">{t.opened_at.slice(0, 10)}</td>
      <td>{t.side.toUpperCase()} {t.lots} {t.symbol}</td>
      <td style={{ color: (t.pnl ?? 0) >= 0 ? '#4ade80' : '#f87171' }}>{t.status === 'open' ? 'open' : `${(t.pnl ?? 0).toFixed(2)} (${t.close_reason})`}</td>
      <td><select value={setup} onChange={(e) => setSetup(e.target.value)}><option value="" />{SETUPS.map((s) => <option key={s}>{s}</option>)}</select></td>
      <td><select value={emotion} onChange={(e) => setEmotion(e.target.value)}><option value="" />{EMOTIONS.map((s) => <option key={s}>{s}</option>)}</select></td>
      <td><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What did I learn?" style={{ width: '100%' }} /></td>
      <td><button className="btn small" onClick={async () => onSaved(await api.journal(t.id, { setup, emotion, notes }))}>💾</button></td>
    </tr>
  );
}

function Calculators({ usd }: { usd: Record<string, number> }) {
  const [sym, setSym] = useState('EURUSD');
  const [ccy, setCcy] = useState('USD');
  const [lots, setLots] = useState(0.1);
  const [bal, setBal] = useState(10000);
  const [risk, setRisk] = useState(1);
  const [stop, setStop] = useState(30);
  const [lev, setLev] = useState(30);
  const [win, setWin] = useState(45);
  const [rr, setRr] = useState(2);
  const ok = usd[ccy] && usd[instrument(sym).quote];
  const size = ok ? positionSize({ balance: bal, riskPercent: risk, stopPips: stop, symbol: sym, accountCcy: ccy, usd }) : null;
  return (
    <div style={{ padding: 16 }} className="grid-2">
      <div className="card col">
        <h3>Position size calculator (use it EVERY trade)</h3>
        <div className="row wrap">
          <select value={sym} onChange={(e) => setSym(e.target.value)}>{INSTRUMENTS.filter((i) => usd[i.base] && usd[i.quote]).map((i) => <option key={i.symbol}>{i.symbol}</option>)}</select>
          <select value={ccy} onChange={(e) => setCcy(e.target.value)}><option>USD</option><option>ZAR</option><option>EUR</option><option>GBP</option></select>
        </div>
        <label className="row">Balance <input type="number" value={bal} onChange={(e) => setBal(Number(e.target.value))} /></label>
        <label className="row">Risk % <input type="number" step={0.25} value={risk} onChange={(e) => setRisk(Number(e.target.value))} /></label>
        <label className="row">Stop (pips) <input type="number" value={stop} onChange={(e) => setStop(Number(e.target.value))} /></label>
        {size && <div className="explain mono">Risk money = {size.riskAmount.toFixed(2)} {ccy}<br />Pip value per 1.00 lot = {size.pipValuePerLot.toFixed(2)} {ccy}<br />Position size = <b>{size.lots.toFixed(2)} lots</b></div>}
      </div>
      <div className="card col">
        <h3>Pip value & margin</h3>
        <label className="row">Lots <input type="number" step={0.01} value={lots} onChange={(e) => setLots(Number(e.target.value))} /></label>
        <label className="row">Leverage 1: <input type="number" value={lev} onChange={(e) => setLev(Number(e.target.value))} /></label>
        {ok && <div className="explain mono">1 pip = {pipValue(sym, lots, ccy, usd).toFixed(2)} {ccy}<br />Margin = {marginRequired(sym, lots, lev, ccy, usd).toFixed(2)} {ccy}<br />Notional = {(lots * instrument(sym).contractSize).toLocaleString()} {instrument(sym).base}</div>}
        <div className="dim" style={{ fontSize: 13 }}>Leverage doesn't change your pip value - it only changes how much margin is locked. High leverage tempts you to trade too big.</div>
      </div>
      <div className="card col">
        <h3>Why 1-2% risk? The losing-streak test</h3>
        <table className="lesson" style={{ fontSize: 13 }}>
          <thead><tr><th>Losses in a row</th><th>1% risk</th><th>5% risk</th><th>10% risk</th></tr></thead>
          <tbody>
            {[0, 3, 5, 8, 10].map((n) => (
              <tr key={n}><td>{n}</td>{[1, 5, 10].map((r) => <td key={r}>{losingStreak(10000, r, n)[n].toFixed(0)}</td>)}</tr>
            ))}
          </tbody>
        </table>
        <div className="dim" style={{ fontSize: 13 }}>10 losses in a row happens to every trader eventually. At 1% you still have 90% of your account. At 10% you've lost two-thirds.</div>
      </div>
      <div className="card col">
        <h3>Drawdown & expectancy</h3>
        <table className="lesson" style={{ fontSize: 13 }}>
          <thead><tr><th>Lose</th><th>Need to gain back</th></tr></thead>
          <tbody>{[10, 20, 30, 50, 75].map((d) => <tr key={d}><td>{d}%</td><td>{recoveryNeeded(d)}%</td></tr>)}</tbody>
        </table>
        <label className="row">Win rate % <input type="number" value={win} onChange={(e) => setWin(Number(e.target.value))} /></label>
        <label className="row">Reward:Risk <input type="number" step={0.5} value={rr} onChange={(e) => setRr(Number(e.target.value))} /></label>
        <div className="explain">Expectancy = {expectancy(win / 100, rr)} R per trade → {expectancy(win / 100, rr) > 0 ? 'a positive edge (if your stats are real!)' : 'a losing system - change something'}</div>
      </div>
    </div>
  );
}
