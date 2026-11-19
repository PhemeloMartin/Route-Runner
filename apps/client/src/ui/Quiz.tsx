import { useMemo, useState } from 'react';
import type { Question } from '@route-runner/content';
import { inline } from './Markdown';
import { sfx } from '../sfx';

export interface QuizResult {
  correct: number;
  total: number;
  durationS: number;
  detail: { id: string; ok: boolean }[];
}

export function grade(q: Question, picked: number[], typed: string): boolean {
  if (q.type === 'input') {
    const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.]$/, '');
    return q.accept.some((a) => norm(a) === norm(typed) || norm(a).replace(/\s/g, '') === norm(typed).replace(/\s/g, ''));
  }
  const want = [...q.correct].sort().join(',');
  return [...picked].sort().join(',') === want;
}

/** Shuffle choices so learners can't memorise "it's always B". */
function shuffled(q: Question, seed: number): Question {
  if (q.type === 'input') return q;
  const idx = q.choices.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(Math.abs(Math.sin(seed * 9301 + i * 49297)) * (i + 1)) % (i + 1);
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return { ...q, choices: idx.map((i) => q.choices[i]), correct: q.correct.map((c) => idx.indexOf(c)) };
}

export function Quiz({
  questions,
  onFinish,
  onAnswer,
  title,
  accent = '#3b82f6',
  timeLimitS,
}: {
  questions: Question[];
  onFinish: (r: QuizResult) => void;
  onAnswer?: (ok: boolean, index: number) => void;
  title?: string;
  accent?: string;
  timeLimitS?: number;
}) {
  const seed = useMemo(() => Math.floor(Math.random() * 1000), []);
  const qs = useMemo(() => questions.map((q, i) => shuffled(q, seed + i)), [questions, seed]);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number[]>([]);
  const [typed, setTyped] = useState('');
  const [checked, setChecked] = useState(false);
  const [detail, setDetail] = useState<{ id: string; ok: boolean }[]>([]);
  const [start] = useState(Date.now());
  const q = qs[i];
  if (!q) return null;
  const ok = checked && grade(q, picked, typed);
  const elapsed = Math.floor((Date.now() - start) / 1000);

  const check = () => {
    const good = grade(q, picked, typed);
    setChecked(true);
    setDetail((d) => [...d, { id: q.id, ok: good }]);
    sfx(good ? 'correct' : 'wrong');
    onAnswer?.(good, i);
  };
  const next = () => {
    if (i + 1 >= qs.length) {
      const all = detail;
      onFinish({ correct: all.filter((d) => d.ok).length, total: qs.length, durationS: Math.floor((Date.now() - start) / 1000), detail: all });
      return;
    }
    setI(i + 1);
    setPicked([]);
    setTyped('');
    setChecked(false);
  };
  const toggle = (k: number) => {
    if (checked) return;
    if (q.type === 'single') setPicked([k]);
    else setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  };

  return (
    <div className="col" style={{ maxWidth: 860, margin: '0 auto', width: '100%' }}>
      <div className="row">
        {title && <b style={{ color: accent }}>{title}</b>}
        <span className="pill">
          Question {i + 1} / {qs.length}
        </span>
        {q.domain && <span className="pill">CCNA {q.domain.split(' ')[0]}</span>}
        <span className="grow" />
        {timeLimitS && <span className="pill">⏱ {Math.max(0, Math.floor((timeLimitS - elapsed) / 60))} min left</span>}
        <span className="pill">✅ {detail.filter((d) => d.ok).length}</span>
      </div>
      <div className="bar">
        <div style={{ width: `${(i / qs.length) * 100}%`, background: accent }} />
      </div>
      <div style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: inline(q.prompt) }} />
      {q.type === 'multi' && <div className="muted">Choose ALL that apply.</div>}
      {q.exhibit && <div className="exhibit">{q.exhibit}</div>}
      {q.type === 'input' ? (
        <input
          autoFocus
          value={typed}
          disabled={checked}
          placeholder="Type your answer and press Enter"
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (checked ? next() : typed.trim() && check())}
          style={{ fontSize: 17, fontFamily: 'var(--mono)' }}
        />
      ) : (
        <div>
          {q.choices.map((c, k) => {
            const cls = checked ? (q.correct.includes(k) ? 'correct' : picked.includes(k) ? 'wrong' : '') : picked.includes(k) ? 'selected' : '';
            return (
              <button key={k} className={`choice ${cls}`} onClick={() => toggle(k)}>
                <b style={{ marginRight: 10, color: 'var(--muted)' }}>{String.fromCharCode(65 + k)}</b>
                <span dangerouslySetInnerHTML={{ __html: inline(c) }} />
              </button>
            );
          })}
        </div>
      )}
      {checked && (
        <div className="explain">
          <b style={{ color: ok ? 'var(--ok)' : 'var(--danger)' }}>{ok ? '✔ Correct!' : '✘ Not quite.'}</b>
          {!ok && q.type === 'input' && (
            <span>
              {' '}
              Answer: <code>{q.accept[0]}</code>
            </span>
          )}{' '}
          <span dangerouslySetInnerHTML={{ __html: inline(q.explanation) }} />
        </div>
      )}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        {!checked ? (
          <button className="btn primary" disabled={q.type === 'input' ? !typed.trim() : !picked.length} onClick={check}>
            Check answer
          </button>
        ) : (
          <button className="btn primary" onClick={next} autoFocus>
            {i + 1 >= qs.length ? 'Finish' : 'Next question →'}
          </button>
        )}
      </div>
    </div>
  );
}
