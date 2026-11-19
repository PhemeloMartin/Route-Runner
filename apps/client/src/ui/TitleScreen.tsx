import { useEffect, useState } from 'react';
import { lessonById } from '@route-runner/content';
import { api } from '../api';
import { useGame } from '../store';
import { STREAM_COLOR, STREAM_ICON } from './Panel';
import { sfx } from '../sfx';

export function TitleScreen() {
  const { profile, setStarted, open, refresh } = useGame();
  const [world, setWorld] = useState<Awaited<ReturnType<typeof api.world>>>();
  const [name, setName] = useState(profile?.name ?? 'Phemelo');

  useEffect(() => {
    api.world().then(setWorld).catch(() => undefined);
  }, []);
  if (!profile) return null;
  const last = world?.last_lesson_id ? lessonById(world.last_lesson_id) : undefined;
  const fresh = profile.totalXp <= 20;

  const start = async (resume: boolean) => {
    sfx('level');
    if (name.trim() && name.trim() !== profile.name) {
      await api.updateProfile({ name: name.trim() });
      await refresh();
    }
    setStarted(true);
    if (resume && last) open({ kind: 'academy', stream: last.stream, lessonId: last.id });
    else if (fresh) open({ kind: 'help' });
  };

  return (
    <div className="title-screen">
      <div className="title-card">
        <div className="logo">ROUTE RUNNER</div>
        <div style={{ fontSize: 18, marginTop: -2, display: 'inline-block', background: 'rgba(5, 9, 20, 0.78)', padding: '6px 16px', borderRadius: 12, color: '#cbd5e1' }}>
          {profile.name}'s journey to <span style={{ color: STREAM_COLOR.network }}>Network Engineer</span> · <span style={{ color: STREAM_COLOR.cloud }}>Cloud Engineer</span> · <span style={{ color: STREAM_COLOR.forex }}>Forex Trader</span>
        </div>
        <div className="card" style={{ marginTop: 26, textAlign: 'left' }}>
          {fresh ? (
            <div className="col">
              <h3>Welcome, future engineer 👋</h3>
              <p className="muted" style={{ margin: 0 }}>
                This is your world. Walk between buildings to learn networking, cloud and forex. Every lesson, lab and drill earns XP. Come back every day for ~1 hour and in about 3 months you'll be ready for the CCNA, comfortable in the cloud and trading a plan on demo.
              </p>
              <label className="row">
                <span className="muted">Your character's name</span>
                <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
              </label>
            </div>
          ) : (
            <div className="col">
              <div className="row">
                <div className="level-badge">{profile.overall.level}</div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 18 }}>Welcome back, {profile.name}</div>
                  <div className="muted">
                    Day {profile.dayNumber} · {profile.totalXp.toLocaleString()} XP · 🔥 {profile.streak.current}-day streak
                  </div>
                </div>
              </div>
              <div className="grid-3">
                {profile.streams.map((s) => (
                  <div key={s.stream} className="card" style={{ padding: 10 }}>
                    <div style={{ fontSize: 12 }} className="muted">
                      {STREAM_ICON[s.stream]} Level {s.level}
                    </div>
                    <div style={{ fontWeight: 700, color: STREAM_COLOR[s.stream] }}>{s.rank.title}</div>
                  </div>
                ))}
              </div>
              {last && (
                <div className="muted">
                  Last lesson: <b style={{ color: 'var(--text)' }}>{last.title}</b>
                </div>
              )}
            </div>
          )}
          <div className="row" style={{ marginTop: 16, justifyContent: 'center' }}>
            {last && !fresh && (
              <button className="btn primary" onClick={() => void start(true)} style={{ fontSize: 17, padding: '12px 22px' }}>
                ▶ Continue lesson
              </button>
            )}
            <button className={`btn ${last && !fresh ? '' : 'primary'}`} onClick={() => void start(false)} style={{ fontSize: 17, padding: '12px 22px' }}>
              {fresh ? '▶ Start my journey' : '🌍 Enter the world'}
            </button>
          </div>
        </div>
        <div className="dim" style={{ marginTop: 14, fontSize: 12 }}>
          Works offline · progress auto-saves to your PC · real ECB market data · CCNA v2.0 aligned
        </div>
      </div>
    </div>
  );
}
