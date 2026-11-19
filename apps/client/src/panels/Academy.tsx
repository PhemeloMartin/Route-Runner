import { useEffect, useMemo, useState } from 'react';
import { stream as getStream, type Chapter, type Lesson, type LabRef } from '@route-runner/content';
import { api } from '../api';
import { useGame, type PanelId } from '../store';
import { Bar, Panel, STREAM_COLOR, STREAM_ICON } from '../ui/Panel';
import { Markdown } from '../ui/Markdown';
import { Quiz, type QuizResult } from '../ui/Quiz';
import { sfx, speak, stopSpeaking } from '../sfx';

type View = { mode: 'map' } | { mode: 'lesson'; lessonId: string } | { mode: 'boss'; chapterId: string };

export default function Academy({ panel }: { panel: Extract<PanelId, { kind: 'academy' }> }) {
  const s = getStream(panel.stream);
  const [view, setView] = useState<View>(panel.lessonId ? { mode: 'lesson', lessonId: panel.lessonId } : panel.boss && panel.chapterId ? { mode: 'boss', chapterId: panel.chapterId } : { mode: 'map' });
  const color = STREAM_COLOR[s.id];
  return (
    <Panel
      title={`${s.building} - ${s.title}`}
      icon={STREAM_ICON[s.id]}
      color={color}
      actions={
        view.mode !== 'map' && (
          <button className="btn small" onClick={() => setView({ mode: 'map' })}>
            ← Chapters
          </button>
        )
      }
    >
      {view.mode === 'map' && <ChapterMap streamId={s.id} onLesson={(id) => setView({ mode: 'lesson', lessonId: id })} onBoss={(id) => setView({ mode: 'boss', chapterId: id })} />}
      {view.mode === 'lesson' && <LessonView lessonId={view.lessonId} onNext={(id) => setView(id ? { mode: 'lesson', lessonId: id } : { mode: 'map' })} onBoss={(id) => setView({ mode: 'boss', chapterId: id })} />}
      {view.mode === 'boss' && <Boss chapterId={view.chapterId} onDone={() => setView({ mode: 'map' })} />}
    </Panel>
  );
}

function ChapterMap({ streamId, onLesson, onBoss }: { streamId: 'network' | 'cloud' | 'forex'; onLesson: (id: string) => void; onBoss: (id: string) => void }) {
  const s = getStream(streamId);
  const { progress, profile } = useGame();
  const done = useGame((g) => g.completedLessons());
  const bosses = new Set((progress?.chapters ?? []).filter((c) => c.boss_defeated_at).map((c) => c.chapter_id));
  const free = !!profile?.settings.freeRoam;
  const color = STREAM_COLOR[streamId];
  const stat = profile?.streams.find((x) => x.stream === streamId);
  const totalLessons = s.chapters.reduce((a, c) => a + c.lessons.length, 0);
  const doneLessons = s.chapters.reduce((a, c) => a + c.lessons.filter((l) => done.has(l.id)).length, 0);

  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="card row wrap" style={{ borderColor: color }}>
        <div className="grow">
          <h2 style={{ color }}>{s.title}</h2>
          <div className="muted">{s.goal}</div>
          <div className="row wrap" style={{ marginTop: 8 }}>
            {s.certs.map((c) => (
              <span key={c} className="pill">
                🎖 {c}
              </span>
            ))}
          </div>
        </div>
        <div style={{ width: 260 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <b>{stat?.rank.title}</b>
            <span className="muted">Lv {stat?.level}</span>
          </div>
          <Bar value={stat?.progress ?? 0} color={color} />
          <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
            {doneLessons}/{totalLessons} lessons · {bosses.size}/{s.chapters.length} bosses
          </div>
          {stat?.rank.next && <div className="dim" style={{ fontSize: 12 }}>Next rank: {stat.rank.next.title} at {stat.rank.next.minXp} XP</div>}
        </div>
      </div>
      {s.chapters.length === 0 && <div className="muted">Content for this stream is loading in the next update.</div>}
      {s.chapters.map((c, ci) => {
        const prev = s.chapters[ci - 1];
        const unlocked = free || ci === 0 || prev.lessons.every((l) => done.has(l.id));
        const n = c.lessons.filter((l) => done.has(l.id)).length;
        return (
          <div key={c.id} className="card" style={{ opacity: unlocked ? 1 : 0.55, borderColor: bosses.has(c.id) ? '#166534' : undefined }}>
            <div className="row wrap">
              <div className="level-badge" style={{ background: unlocked ? `linear-gradient(135deg, ${color}, #0b1220)` : '#1f2937', color: 'white', boxShadow: 'none' }}>
                {c.number}
              </div>
              <div className="grow">
                <h3 style={{ margin: 0 }}>
                  {c.title} {bosses.has(c.id) && <span title="Boss defeated">🏆</span>}
                </h3>
                <div className="muted" style={{ fontSize: 13 }}>
                  {c.domain ? `CCNA ${c.domain} · ` : ''}
                  {n}/{c.lessons.length} lessons · {c.lessons.reduce((a, l) => a + l.minutes, 0)} min
                </div>
              </div>
              {!unlocked && <span className="pill">🔒 Finish chapter {prev?.number} first</span>}
              {unlocked && c.boss.length > 0 && (
                <button className={`btn ${n === c.lessons.length ? 'danger' : ''}`} onClick={() => onBoss(c.id)}>
                  🐉 Boss battle
                </button>
              )}
            </div>
            {unlocked && (
              <>
                <details style={{ marginTop: 8 }}>
                  <summary className="muted" style={{ cursor: 'pointer' }}>
                    Story & sources
                  </summary>
                  <p>{c.story}</p>
                  {c.sources.length > 0 && <div className="dim" style={{ fontSize: 13 }}>From your study material: {c.sources.join(' · ')}</div>}
                </details>
                <div className="grid-auto" style={{ marginTop: 10 }}>
                  {c.lessons.map((l, li) => (
                    <div key={l.id} className="card hover" style={{ padding: 10, borderColor: done.has(l.id) ? '#166534' : undefined }} onClick={() => onLesson(l.id)}>
                      <div className="row">
                        <span>{done.has(l.id) ? '✅' : '📘'}</span>
                        <b className="grow" style={{ fontSize: 14 }}>
                          {c.number}.{li + 1} {l.title}
                        </b>
                      </div>
                      <div className="dim" style={{ fontSize: 12, marginTop: 4 }}>
                        {l.minutes} min · {l.quiz.length} questions{l.labs.length ? ` · ${l.labs.length} lab` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function labPanel(l: LabRef): PanelId | null {
  switch (l.kind) {
    case 'network':
      return { kind: 'netlab', labId: l.id };
    case 'linux':
    case 'vm':
    case 'cloud':
    case 'hpc':
    case 'k8s3d':
      return { kind: 'shelllab', labId: l.id, profile: l.kind === 'k8s3d' ? 'cloud' : (l.kind as 'linux') };
    case 'rack':
      return { kind: 'rack' };
    case 'pcbuild':
      return { kind: 'pcbuild' };
    case 'cable':
      return { kind: 'cable' };
    case 'trading':
      return { kind: 'trading' };
    case 'drill':
      return { kind: 'exam', tab: 'drills' };
  }
  return null;
}

function findLesson(id: string): { lesson: Lesson; chapter: Chapter; next?: Lesson } | undefined {
  for (const sid of ['network', 'cloud', 'forex'] as const) {
    const s = getStream(sid);
    const all = s.chapters.flatMap((c) => c.lessons.map((l) => ({ l, c })));
    const i = all.findIndex((x) => x.l.id === id);
    if (i >= 0) return { lesson: all[i].l, chapter: all[i].c, next: all[i + 1]?.c.id === all[i].c.id ? all[i + 1].l : all[i + 1]?.l };
  }
  return undefined;
}

function LessonView({ lessonId, onNext, onBoss }: { lessonId: string; onNext: (id?: string) => void; onBoss: (chapterId: string) => void }) {
  const found = findLesson(lessonId);
  const { reward, open, profile } = useGame();
  const done = useGame((g) => g.completedLessons().has(lessonId));
  const [phase, setPhase] = useState<'read' | 'quiz' | 'result'>('read');
  const [result, setResult] = useState<QuizResult | null>(null);
  const [answer, setAnswer] = useState('');
  const [reveal, setReveal] = useState(false);
  const [start] = useState(Date.now());

  useEffect(() => {
    setPhase('read');
    setResult(null);
    setAnswer('');
    setReveal(false);
    void api.startLesson(lessonId).catch(() => undefined); // records last_lesson_id for "Continue"
    return () => stopSpeaking();
  }, [lessonId]);

  const fullText = useMemo(() => (found ? `${found.lesson.title}. ${found.lesson.analogy} ${found.lesson.body.replace(/\|/g, ' ').replace(/\n/g, ' ')}` : ''), [found]);
  if (!found) return <div>Lesson not found.</div>;
  const { lesson, chapter, next } = found;
  const color = STREAM_COLOR[lesson.stream];
  const lastInChapter = chapter.lessons[chapter.lessons.length - 1].id === lesson.id;

  const finish = async (r: QuizResult) => {
    setResult(r);
    setPhase('result');
    const rw = await api.completeLesson(lesson.id, { correct: r.correct, total: r.total, durationS: Math.floor((Date.now() - start) / 1000), detail: r.detail });
    reward(rw, lesson.title);
  };

  return (
    <div className="lesson">
      <div className="row wrap" style={{ marginBottom: 6 }}>
        <span className={`pill tag-${lesson.stream}`}>
          Chapter {chapter.number}: {chapter.title}
        </span>
        <span className="pill">⏱ {lesson.minutes} min</span>
        {done && <span className="pill" style={{ color: 'var(--ok)' }}>✅ Completed</span>}
        <span className="grow" />
        <button className="btn small" onClick={() => speak(fullText, profile?.settings.voice)} title="Uses your computer's built-in voices - works offline">
          🔊 Read to me
        </button>
        <button className="btn small ghost" onClick={stopSpeaking}>
          ⏹
        </button>
      </div>
      <h1 style={{ color }}>{lesson.title}</h1>

      {phase === 'read' && (
        <>
          <div className="analogy">
            <b>💡 Think of it like this:</b> {lesson.analogy}
          </div>
          {lesson.objectives.length > 0 && (
            <div className="card" style={{ marginTop: 14 }}>
              <b>By the end of this lesson you can:</b>
              <ul style={{ margin: '6px 0 0' }}>
                {lesson.objectives.map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ul>
            </div>
          )}
          <Markdown text={lesson.body} />
          {lesson.terms.length > 0 && (
            <>
              <h3 style={{ marginTop: 22 }}>🔑 Key terms (these become flashcards)</h3>
              <div className="grid-2">
                {lesson.terms.map((t) => (
                  <div key={t.term} className="term">
                    <b>{t.term}</b> - {t.plain}
                  </div>
                ))}
              </div>
            </>
          )}
          {lesson.pro.length > 0 && (
            <>
              <h3 style={{ marginTop: 22 }}>🎙️ Say it like a pro (read these OUT LOUD)</h3>
              {lesson.pro.map((p) => (
                <div key={p} className="row card" style={{ padding: 10, marginBottom: 6 }}>
                  <span className="grow">{p}</span>
                  <button className="btn small" onClick={() => speak(p, profile?.settings.voice)}>
                    🔊
                  </button>
                </div>
              ))}
            </>
          )}
          {lesson.interview && (
            <div className="card" style={{ marginTop: 18, borderColor: '#7c3aed' }}>
              <h3>🧑‍💼 Interview corner</h3>
              <p style={{ marginTop: 0 }}>
                <b>{lesson.interview.q}</b>
              </p>
              <p className="muted" style={{ marginTop: 0 }}>
                Answer out loud first, then type your answer. Comparing it with the model answer is how you learn to SPEAK networking confidently.
              </p>
              <textarea rows={4} style={{ width: '100%' }} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Type your answer in your own words..." />
              <div className="row" style={{ marginTop: 8 }}>
                <button className="btn" onClick={() => setReveal(true)}>
                  👀 Show model answer
                </button>
                {reveal &&
                  [1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      className="btn small"
                      disabled={!answer.trim()}
                      title="Rate your own answer"
                      onClick={async () => {
                        reward(await api.interview(lesson.id, answer, n), 'interview practice');
                        setAnswer('');
                      }}
                    >
                      {'★'.repeat(n)}
                    </button>
                  ))}
              </div>
              {reveal && <div className="explain">{lesson.interview.a}</div>}
            </div>
          )}
          {lesson.labs.length > 0 && (
            <div className="card" style={{ marginTop: 18, borderColor: '#f59e0b' }}>
              <h3>🛠️ Hands-on</h3>
              <div className="row wrap">
                {lesson.labs.map((l) => (
                  <button key={l.id} className="btn warn" onClick={() => open(labPanel(l))}>
                    Open lab: {l.title ?? l.id}
                  </button>
                ))}
              </div>
            </div>
          )}
          {chapter.labs.length > 0 && lesson.id === chapter.lessons[0].id && (
            <div className="row wrap" style={{ marginTop: 10 }}>
              {chapter.labs.map((l) => (
                <button key={l.id} className="btn" onClick={() => open(labPanel(l))}>
                  🧪 Chapter lab: {l.title ?? l.id}
                </button>
              ))}
            </div>
          )}
          <div className="row" style={{ justifyContent: 'center', margin: '26px 0 40px' }}>
            <button className="btn primary" style={{ fontSize: 17, padding: '12px 26px' }} onClick={() => setPhase('quiz')}>
              ✏️ Take the quiz ({lesson.quiz.length} questions)
            </button>
          </div>
        </>
      )}
      {phase === 'quiz' && <Quiz questions={lesson.quiz} onFinish={(r) => void finish(r)} accent={color} title="Lesson quiz" />}
      {phase === 'result' && result && (
        <div className="card col" style={{ alignItems: 'center', textAlign: 'center', padding: 30 }}>
          <div style={{ fontSize: 54 }}>{result.correct / result.total >= 0.6 ? '🎉' : '📚'}</div>
          <h2>
            {result.correct} / {result.total} correct
          </h2>
          <p className="muted">{result.correct / result.total >= 0.6 ? 'Lesson complete! Key terms were added to your flashcards.' : 'You need 60% to complete the lesson. Re-read the tricky parts and try again - that is how memory gets built.'}</p>
          <div className="row">
            <button className="btn" onClick={() => setPhase('read')}>
              Review lesson
            </button>
            <button className="btn" onClick={() => setPhase('quiz')}>
              Retry quiz
            </button>
            {lastInChapter && chapter.boss.length > 0 ? (
              <button className="btn danger" onClick={() => onBoss(chapter.id)}>
                🐉 Face the chapter boss
              </button>
            ) : (
              <button className="btn primary" onClick={() => onNext(next?.id)}>
                Next lesson →
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Boss({ chapterId, onDone }: { chapterId: string; onDone: () => void }) {
  const ch = ['network', 'cloud', 'forex'].flatMap((s) => getStream(s as 'network').chapters).find((c) => c.id === chapterId)!;
  const { reward } = useGame();
  const [bossHp, setBossHp] = useState(1);
  const [hearts, setHearts] = useState(3);
  const [shake, setShake] = useState(false);
  const [result, setResult] = useState<{ correct: number; total: number; defeated: boolean } | null>(null);
  const questions = useMemo(() => [...ch.boss, ...ch.lessons.flatMap((l) => l.quiz).sort(() => Math.random() - 0.5).slice(0, 5)], [ch]);
  const n = questions.length;

  const onAnswer = (ok: boolean) => {
    if (ok) {
      setBossHp((h) => Math.max(0, h - 1 / (n * 0.7)));
      setShake(true);
      setTimeout(() => setShake(false), 300);
    } else {
      setHearts((h) => Math.max(0, h - 1));
      sfx('hit');
    }
  };

  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="card" style={{ borderColor: '#7f1d1d', background: 'linear-gradient(180deg, #1a0b10, #0d1628)' }}>
        <div className="row">
          <div style={{ fontSize: 64, transform: shake ? 'translateX(6px) rotate(4deg)' : 'none', transition: 'transform .1s' }}>🐉</div>
          <div className="grow">
            <h2 style={{ margin: 0 }}>Guardian of "{ch.title}"</h2>
            <div className="muted">Defeat the boss with 70%+ correct. Each right answer hits it; each wrong answer costs a heart (hearts are just for drama - you can't lose your progress).</div>
            <div className="boss-hp" style={{ marginTop: 10 }}>
              <div style={{ width: `${bossHp * 100}%` }} />
            </div>
          </div>
          <div style={{ fontSize: 26 }}>{'❤️'.repeat(hearts) + '🖤'.repeat(3 - hearts)}</div>
        </div>
      </div>
      {!result ? (
        <Quiz
          questions={questions}
          onAnswer={(ok) => onAnswer(ok)}
          accent="#ef4444"
          title="Boss battle"
          onFinish={async (r) => {
            const rw = await api.boss(ch.id, { correct: r.correct, total: r.total, durationS: r.durationS });
            setResult({ correct: r.correct, total: r.total, defeated: !!rw.defeated });
            reward(rw, rw.defeated ? 'Boss defeated!' : undefined);
            if (rw.defeated) sfx('level');
          }}
        />
      ) : (
        <div className="card col" style={{ alignItems: 'center', textAlign: 'center', padding: 30 }}>
          <div style={{ fontSize: 60 }}>{result.defeated ? '🏆' : '💀'}</div>
          <h2>{result.defeated ? 'BOSS DEFEATED!' : 'The guardian survived...'}</h2>
          <p className="muted">
            {result.correct}/{result.total} correct. {result.defeated ? 'The next chapter is open. Keep the streak alive!' : 'Review the lessons and come back stronger. Every attempt strengthens the memory.'}
          </p>
          <button className="btn primary" onClick={onDone}>
            Back to chapters
          </button>
        </div>
      )}
    </div>
  );
}
