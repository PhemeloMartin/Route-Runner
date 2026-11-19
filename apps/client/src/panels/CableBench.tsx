import { useState } from 'react';
import { CABLES, T568A, T568B } from '@route-runner/content';
import { api } from '../api';
import { useGame } from '../store';
import { Panel } from '../ui/Panel';
import { sfx } from '../sfx';

const WIRE: Record<string, [string, string]> = {
  'white-orange': ['#f8fafc', '#f97316'],
  orange: ['#f97316', '#f97316'],
  'white-green': ['#f8fafc', '#22c55e'],
  green: ['#22c55e', '#22c55e'],
  'white-blue': ['#f8fafc', '#3b82f6'],
  blue: ['#3b82f6', '#3b82f6'],
  'white-brown': ['#f8fafc', '#92400e'],
  brown: ['#92400e', '#92400e'],
};

const SCENARIOS = [
  { q: 'Office PC → access switch', a: 'straight' },
  { q: 'Switch → switch uplink (old gear, no Auto-MDIX)', a: 'crossover' },
  { q: 'Laptop → brand-new router for first-time setup', a: 'console' },
  { q: 'Building A → Building B, 2 km apart', a: 'fiber' },
  { q: 'Switch → router LAN port', a: 'straight' },
  { q: 'Router → router (legacy WAN link)', a: 'serial' },
  { q: 'PC → PC directly (no switch, no Auto-MDIX)', a: 'crossover' },
];

function Wire({ color, size = 34 }: { color: string; size?: number }) {
  const [a, b] = WIRE[color];
  return <div style={{ width: size, height: size * 2.2, borderRadius: 6, background: `repeating-linear-gradient(45deg, ${a}, ${a} 6px, ${b} 6px, ${b} 12px)`, border: '2px solid #0f172a' }} title={color} />;
}

export default function CableBench() {
  const [standard, setStandard] = useState<'B' | 'A'>('B');
  const [pins, setPins] = useState<string[]>([]);
  const [result, setResult] = useState<null | boolean>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [checked, setChecked] = useState(false);
  const { reward } = useGame();
  const target = standard === 'B' ? T568B : T568A;
  const pool = Object.keys(WIRE).filter((w) => !pins.includes(w));

  const crimp = async () => {
    const ok = pins.join() === target.join();
    setResult(ok);
    sfx(ok ? 'level' : 'wrong');
    if (ok) reward(await api.completeLab('cable', `crimp-${standard}`, 5), `Crimped a perfect T568${standard}`);
  };

  return (
    <Panel title="Cable Bench - Crimp It Right" icon="🧵" color="#f97316">
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="card col">
          <div className="row">
            <h3 className="grow" style={{ margin: 0 }}>RJ45 crimping challenge</h3>
            <div className="tabs">
              {(['B', 'A'] as const).map((s) => (
                <button key={s} className={`tab ${standard === s ? 'active' : ''}`} onClick={() => { setStandard(s); setPins([]); setResult(null); }}>T568{s}</button>
              ))}
            </div>
          </div>
          <p className="muted" style={{ margin: 0 }}>Hold the RJ45 plug with the clip facing DOWN and the copper pins facing you. Pin 1 is on the LEFT. Click the wires in order to slide them into pins 1 → 8.</p>
          <div className="row" style={{ gap: 6, background: '#0b1324', padding: 12, borderRadius: 12, minHeight: 110 }}>
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="col" style={{ alignItems: 'center', gap: 4 }}>
                {pins[i] ? (
                  <div onClick={() => { setPins(pins.filter((_, k) => k !== i)); setResult(null); }} style={{ cursor: 'pointer', outline: result === false && pins[i] !== target[i] ? '3px solid #ef4444' : undefined, borderRadius: 6 }}>
                    <Wire color={pins[i]} />
                  </div>
                ) : (
                  <div style={{ width: 34, height: 75, border: '2px dashed #334155', borderRadius: 6 }} />
                )}
                <span className="mono dim">{i + 1}</span>
              </div>
            ))}
          </div>
          <div className="row wrap" style={{ gap: 6 }}>
            {pool.map((w) => (
              <button key={w} className="btn small" onClick={() => { if (pins.length < 8) { setPins([...pins, w]); sfx('click'); } }}>
                <span style={{ width: 12, height: 12, display: 'inline-block', borderRadius: 3, background: `linear-gradient(90deg, ${WIRE[w][0]} 50%, ${WIRE[w][1]} 50%)` }} /> {w}
              </button>
            ))}
          </div>
          <div className="row">
            <button className="btn primary" disabled={pins.length < 8} onClick={() => void crimp()}>🔧 Crimp & test</button>
            <button className="btn" onClick={() => { setPins([]); setResult(null); }}>Cut off & retry</button>
          </div>
          {result !== null && (
            <div className="explain">
              {result ? `✅ Cable tester: all 8 pins pass. That's a perfect T568${standard} termination!` : `❌ Cable tester: FAIL. Pins outlined in red are wrong. T568${standard} is: ${target.join(', ')}.`}
            </div>
          )}
          <div className="dim" style={{ fontSize: 13 }}>Memory trick for T568B: "<b>O</b>range comes first because <b>B</b> is for <b>B</b>usiness" - wO, O, wG, Bl, wBl, G, wBr, Br. T568A just swaps the orange and green pairs.</div>
        </div>
        <div className="col">
          <div className="card col">
            <h3 style={{ margin: 0 }}>Which cable? (Exam favourite)</h3>
            {SCENARIOS.map((s, i) => (
              <div key={i} className="row">
                <span className="grow" style={{ fontSize: 14 }}>{s.q}</span>
                <select value={answers[i] ?? ''} onChange={(e) => setAnswers({ ...answers, [i]: e.target.value })} style={{ borderColor: checked ? (answers[i] === s.a ? '#22c55e' : '#ef4444') : undefined }}>
                  <option value="">choose...</option>
                  {CABLES.map((c) => (
                    <option key={c.id} value={c.id}>{c.name.split(' (')[0]}</option>
                  ))}
                </select>
              </div>
            ))}
            <button
              className="btn primary"
              onClick={async () => {
                setChecked(true);
                const correct = SCENARIOS.filter((s, i) => answers[i] === s.a).length;
                sfx(correct === SCENARIOS.length ? 'level' : 'click');
                reward(await api.drills('cable-types', correct, SCENARIOS.length), 'Cable quiz');
              }}
            >
              Check
            </button>
          </div>
          {CABLES.map((c) => (
            <div key={c.id} className="term">
              <b style={{ color: c.color }}>{c.name}</b> - {c.use} <span className="dim">{c.detail}</span>
            </div>
          ))}
          <button className="btn warn" onClick={() => useGame.getState().open({ kind: 'netlab', labId: 'cable-it' })}>
            🔌 Now cable a real office in the Packet Lab (Mission 2)
          </button>
        </div>
      </div>
    </Panel>
  );
}
