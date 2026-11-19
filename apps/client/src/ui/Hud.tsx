import { useGame } from '../store';
import { ZONES } from '../world/zones';
import { Bar, STREAM_COLOR, STREAM_ICON } from './Panel';

export function Hud() {
  const { profile, nearZone, open } = useGame();
  if (!profile) return null;
  const zone = ZONES.find((z) => z.id === nearZone);
  return (
    <div className="hud">
      <div className="hud-left">
        <div className="row">
          <div className="level-badge" title="Overall level">{profile.overall.level}</div>
          <div className="grow">
            <div style={{ fontWeight: 800, fontSize: 17 }}>{profile.name}</div>
            <div className="muted" style={{ fontSize: 12 }}>
              {profile.totalXp.toLocaleString()} XP · Day {profile.dayNumber} of your journey
            </div>
          </div>
        </div>
        <div className="col" style={{ marginTop: 10, gap: 7 }}>
          {profile.streams.map((s) => (
            <div key={s.stream} title={s.rank.plain}>
              <div className="row" style={{ fontSize: 12, justifyContent: 'space-between' }}>
                <span>
                  {STREAM_ICON[s.stream]} <b>{s.rank.title}</b>
                </span>
                <span className="muted">Lv {s.level}</span>
              </div>
              <Bar value={s.progress} color={STREAM_COLOR[s.stream]} />
            </div>
          ))}
        </div>
      </div>

      <div className="hud-right">
        <div className="hud-chip" title={`Longest streak: ${profile.streak.longest} days`}>
          <span style={{ fontSize: 20 }}>{profile.activeToday ? '🔥' : '🕯️'}</span>
          <div>
            <div style={{ fontWeight: 800 }}>{profile.streak.current} day streak</div>
            <div className="muted" style={{ fontSize: 11 }}>{profile.activeToday ? 'Done for today ✓' : 'Learn today to keep it!'}</div>
          </div>
        </div>
        <button className="btn warn" onClick={() => open({ kind: 'quest' })}>
          📜 Daily Quest
        </button>
      </div>

      {zone && (
        <div className="prompt">
          <div style={{ fontSize: 13 }} className="muted">
            {zone.subtitle}
          </div>
          <div style={{ fontWeight: 800, fontSize: 18, margin: '2px 0 6px' }}>
            {zone.icon} {zone.name}
          </div>
          <div>
            Press <kbd>E</kbd> to enter
          </div>
        </div>
      )}

      <div className="dock">
        <button className="btn" onClick={() => open({ kind: 'academy', stream: 'network' })}>🌐 Network</button>
        <button className="btn" onClick={() => open({ kind: 'academy', stream: 'cloud' })}>☁️ Cloud</button>
        <button className="btn" onClick={() => open({ kind: 'academy', stream: 'dev' })}>📱 Apps</button>
        <button className="btn" onClick={() => open({ kind: 'academy', stream: 'forex' })}>📈 Forex</button>
        <button className="btn" onClick={() => open({ kind: 'exam', tab: 'cards' })}>🗂️ Flashcards</button>
        <button className="btn" onClick={() => open({ kind: 'exam', tab: 'drills' })}>🎯 Drills</button>
        <button className="btn" onClick={() => open({ kind: 'profile' })}>👤 Profile</button>
        <button className="btn" onClick={() => open({ kind: 'help' })}>❓</button>
      </div>

      <div className="controls-hint">
        <kbd>W</kbd>
        <kbd>A</kbd>
        <kbd>S</kbd>
        <kbd>D</kbd> walk · <kbd>Shift</kbd> run · <kbd>Space</kbd> jump · drag mouse = look · wheel = zoom · <kbd>E</kbd> enter
      </div>
    </div>
  );
}

export function Toasts() {
  const toasts = useGame((s) => s.toasts);
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone ?? ''}`}>
          {t.icon && <span style={{ marginRight: 8 }}>{t.icon}</span>}
          {t.text}
        </div>
      ))}
    </div>
  );
}
