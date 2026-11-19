import { useEffect, useRef, useState } from 'react';
import { CCNA_DOMAINS, type Question } from '@route-runner/content';
import { checkDrill, makeDrill, type Drill, type DrillKind } from '@route-runner/engine';
import { api } from '../api';
import { useGame } from '../store';
import { Panel } from '../ui/Panel';
import { Quiz, type QuizResult } from '../ui/Quiz';
import { sfx } from '../sfx';

type Tab = 'exam' | 'drills' | 'cards';

export default function ExamHall({ tab: initial = 'exam' }: { tab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initial);
  return (
    <Panel
      title="Exam Hall"
      icon="🎓"
      color="#e11d48"
      actions={
        <div className="tabs">
          <button className={`tab ${tab === 'exam' ? 'active' : ''}`} onClick={() => setTab('exam')}>📝 CCNA mock exam</button>
          <button className={`tab ${tab === 'drills' ? 'active' : ''}`} onClick={() => setTab('drills')}>🎯 Drills</button>
          <button className={`tab ${tab === 'cards' ? 'active' : ''}`} onClick={() => setTab('cards')}>🗂️ Flashcards</button>
        </div>
      }
    >
      {tab === 'exam' && <MockExam />}
      {tab === 'drills' && <Drills />}
      {tab === 'cards' && <Flashcards />}
    </Panel>
  );
}

function MockExam() {
  const { reward } = useGame();
  const [qs, setQs] = useState<Question[] | null>(null);
  const [result, setResult] = useState<(QuizResult & { byDomain: Record<string, [number, number]> }) | null>(null);
  const [count, setCount] = useState(60);
  const start = async () => {
    setResult(null);
    setQs(await api.newExam(count));
  };
  const finish = async (r: QuizResult) => {
    const byDomain: Record<string, [number, number]> = {};
    r.detail.forEach((d, i) => {
      const dom = qs![i].domain?.split(' ')[0] ?? '?';
      byDomain[dom] ??= [0, 0];
      byDomain[dom][1]++;
      if (d.ok) byDomain[dom][0]++;
    });
    setResult({ ...r, byDomain });
    reward(await api.examResult({ correct: r.correct, total: r.total, durationS: r.durationS, detail: byDomain }), 'Mock exam');
    if (r.correct / r.total >= 0.82) sfx('level');
  };
  if (qs && !result) return <Quiz questions={qs} onFinish={(r) => void finish(r)} accent="#e11d48" title="CCNA practice exam" timeLimitS={Math.round((120 * 60 * qs.length) / 100)} />;
  return (
    <div className="col" style={{ maxWidth: 900, margin: '0 auto' }}>
      {result && (
        <div className="card col" style={{ borderColor: result.correct / result.total >= 0.82 ? '#16a34a' : '#b91c1c' }}>
          <h2>{Math.round((result.correct / result.total) * 100)}% - {result.correct / result.total >= 0.82 ? 'PASS-level score 🎉' : 'Not yet - keep drilling'}</h2>
          <div className="muted">Cisco doesn't publish the pass mark; aiming for 82%+ (about 825/1000) in practice gives you a safety margin. Domain breakdown:</div>
          {CCNA_DOMAINS.map((d) => {
            const [c, t] = result.byDomain[d.code] ?? [0, 0];
            return (
              <div key={d.code} className="row">
                <span style={{ width: 380 }}>{d.code} {d.name}</span>
                <div className="bar grow"><div style={{ width: `${t ? (c / t) * 100 : 0}%`, background: t && c / t >= 0.8 ? '#22c55e' : '#f59e0b' }} /></div>
                <span className="mono" style={{ width: 60 }}>{t ? `${c}/${t}` : '-'}</span>
              </div>
            );
          })}
        </div>
      )}
      <div className="card col">
        <h3>CCNA 200-301 practice exam</h3>
        <p className="muted" style={{ margin: 0 }}>Questions are drawn from every Network chapter and weighted by the <b>CCNA v2.0 blueprint</b> (first test date 3 February 2027): Infrastructure & Connectivity 25%, Switching & Access 25%, IP Routing 20%, Services & Security 20%, AI/Operations 10%. The real exam is 120 minutes with ~100 questions, including drag-and-drop and simulations - the Packet Lab missions are your simulation practice.</p>
        <div className="row">
          {[20, 60, 100].map((n) => (
            <button key={n} className={`btn ${count === n ? 'primary' : ''}`} onClick={() => setCount(n)}>{n} questions</button>
          ))}
          <button className="btn danger" onClick={() => void start()}>Start exam ⏱</button>
        </div>
        <div className="dim" style={{ fontSize: 13 }}>Tip: as more chapters are completed the question bank grows. Check Cisco's official v2.0 exam topics PDF on learningnetwork.cisco.com before booking.</div>
      </div>
    </div>
  );
}

const DRILL_SETS: { id: string; name: string; kinds: DrillKind[] }[] = [
  { id: 'subnet', name: 'Subnetting sprint', kinds: ['subnet-network', 'subnet-broadcast', 'subnet-hosts', 'subnet-range', 'prefix-for-hosts', 'mask-from-prefix'] },
  { id: 'binary', name: 'Binary & wildcards', kinds: ['binary-to-decimal', 'decimal-to-binary', 'wildcard', 'mask-from-prefix'] },
  { id: 'ipv6', name: 'IPv6', kinds: ['ipv6-compress', 'ipv6-expand'] },
  { id: 'ports', name: 'Ports & OSI', kinds: ['port-number', 'osi-layer'] },
  { id: 'pip', name: 'Forex maths', kinds: ['pip-value', 'position-size'] },
];

function Drills() {
  const [set, setSet] = useState(DRILL_SETS[0]);
  const [d, setD] = useState<Drill>(() => makeDrill(set.kinds[0]));
  const [ans, setAns] = useState('');
  const [state, setState] = useState<'ask' | 'right' | 'wrong'>('ask');
  const [score, setScore] = useState({ c: 0, t: 0, streak: 0, best: 0 });
  const { reward } = useGame();
  const next = (s = set) => {
    setD(makeDrill(s.kinds[Math.floor(Math.random() * s.kinds.length)]));
    setAns('');
    setState('ask');
  };
  const submit = (value = ans) => {
    if (state !== 'ask') return next();
    const ok = checkDrill(d, value);
    setState(ok ? 'right' : 'wrong');
    sfx(ok ? 'correct' : 'wrong');
    const ns = { c: score.c + (ok ? 1 : 0), t: score.t + 1, streak: ok ? score.streak + 1 : 0, best: Math.max(score.best, ok ? score.streak + 1 : 0) };
    setScore(ns);
    // bank XP every 10 answers
    batch.current = { c: batch.current.c + (ok ? 1 : 0), t: batch.current.t + 1 };
    if (batch.current.t >= 10) {
      const b = batch.current;
      batch.current = { c: 0, t: 0 };
      void api.drills(set.id, b.c, b.t).then((r) => reward(r, `${set.name} x10`));
    }
  };
  const batch = useRef({ c: 0, t: 0 });
  useEffect(
    () => () => {
      // bank a partial batch when leaving the drills
      if (batch.current.t > 0) void api.drills(set.id, batch.current.c, batch.current.t);
    },
    [set.id],
  );
  return (
    <div className="col" style={{ maxWidth: 820, margin: '0 auto' }}>
      <div className="row wrap">
        {DRILL_SETS.map((s) => (
          <button key={s.id} className={`btn ${set.id === s.id ? 'primary' : ''}`} onClick={() => { setSet(s); next(s); setScore({ c: 0, t: 0, streak: 0, best: 0 }); }}>{s.name}</button>
        ))}
      </div>
      <div className="row">
        <span className="pill">✅ {score.c}/{score.t}</span>
        <span className="pill">🔥 streak {score.streak}</span>
        <span className="pill">🏅 best {score.best}</span>
        <span className="dim">XP is banked every 10 answers</span>
      </div>
      <div className="card col" style={{ padding: 24 }}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>{d.prompt}</div>
        {d.choices ? (
          <div>
            {d.choices.map((c) => (
              <button key={c} className={`choice ${state !== 'ask' && c === d.answer ? 'correct' : state === 'wrong' && c === ans ? 'wrong' : ''}`} onClick={() => { setAns(c); submit(c); }}>{c}</button>
            ))}
          </div>
        ) : (
          <input autoFocus value={ans} onChange={(e) => setAns(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder="Answer + Enter" style={{ fontSize: 22, fontFamily: 'var(--mono)' }} disabled={state !== 'ask'} />
        )}
        {state !== 'ask' && (
          <div className="explain">
            <b style={{ color: state === 'right' ? 'var(--ok)' : 'var(--danger)' }}>{state === 'right' ? '✔ Correct' : `✘ Answer: ${d.answer}`}</b> - {d.explanation}
          </div>
        )}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn primary" onClick={() => (state === 'ask' ? submit() : next())} autoFocus={state !== 'ask'}>{state === 'ask' ? 'Check (Enter)' : 'Next (Enter)'}</button>
        </div>
      </div>
      <div className="dim" style={{ fontSize: 13 }}>Goal for the CCNA: answer any /16-/30 subnetting question correctly in under 30 seconds without a calculator. Drill 10 minutes a day and you'll get there in a few weeks.</div>
    </div>
  );
}

function Flashcards() {
  const [due, setDue] = useState<{ id: string; stream: string; front: string; back: string; source: string }[] | null>(null);
  const [total, setTotal] = useState(0);
  const [flip, setFlip] = useState(false);
  const { reward } = useGame();
  const load = () => api.dueCards().then((r) => { setDue(r.due); setTotal(r.total); setFlip(false); });
  useEffect(() => { void load(); }, []);
  if (!due) return <div>Loading...</div>;
  const card = due[0];
  const grade = async (g: number) => {
    const r = await api.reviewCard(card.id, g);
    reward({ ...r, xp: 0 });
    setDue(due.slice(1));
    setFlip(false);
    sfx(g >= 3 ? 'correct' : 'click');
  };
  return (
    <div className="col" style={{ maxWidth: 720, margin: '0 auto', alignItems: 'center' }}>
      <div className="muted">
        {due.length} due today · {total} cards in your deck. Cards are added automatically from the key terms of every lesson you complete. Spaced repetition (SM-2) shows each card just before you'd forget it.
      </div>
      {!card ? (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 48 }}>🎉</div>
          <h3>{total ? 'All caught up for today!' : 'No cards yet'}</h3>
          <div className="muted">{total ? 'Come back tomorrow - reviewing a little every day beats cramming.' : 'Complete a lesson to start your deck.'}</div>
        </div>
      ) : (
        <>
          <div className="card" onClick={() => setFlip(true)} style={{ width: '100%', minHeight: 230, display: 'grid', placeItems: 'center', textAlign: 'center', cursor: 'pointer', borderColor: flip ? '#22d3ee' : undefined }}>
            <div>
              <span className={`pill tag-${card.stream}`}>{card.source}</span>
              <div style={{ fontSize: 28, fontWeight: 800, margin: '14px 0' }}>{card.front}</div>
              {flip ? <div style={{ fontSize: 18 }}>{card.back}</div> : <div className="dim">Say the meaning out loud, then click to flip</div>}
            </div>
          </div>
          {flip && (
            <div className="row">
              <button className="btn danger" onClick={() => void grade(1)}>Again</button>
              <button className="btn warn" onClick={() => void grade(3)}>Hard</button>
              <button className="btn primary" onClick={() => void grade(4)}>Good</button>
              <button className="btn good" onClick={() => void grade(5)}>Easy</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
