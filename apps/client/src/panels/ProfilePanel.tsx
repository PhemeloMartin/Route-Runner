import { useEffect, useRef, useState } from 'react';
import { ACHIEVEMENTS } from '@route-runner/content';
import { api } from '../api';
import { useGame } from '../store';
import { detectQuality } from '../world/shared';
import { Bar, Panel, STREAM_COLOR, STREAM_ICON, STREAM_NAME } from '../ui/Panel';

const PALETTE: Record<string, string[]> = {
  skin: ['#8d5524', '#6b3e1d', '#c68642', '#e0ac69', '#3d2210'],
  shirt: ['#2563eb', '#16a34a', '#dc2626', '#7c3aed', '#0891b2', '#f59e0b', '#111827'],
  pants: ['#1f2937', '#1e3a8a', '#374151', '#78350f', '#0f766e'],
  hair: ['#1a1a1a', '#3b2416', '#6b4423', '#9ca3af'],
  shoes: ['#f5f5f5', '#111827', '#dc2626', '#2563eb'],
};

export default function ProfilePanel() {
  const { profile, progress, refresh } = useGame();
  const [dash, setDash] = useState<Awaited<ReturnType<typeof api.dashboard>> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    api.dashboard().then(setDash);
  }, []);
  if (!profile) return null;
  const unlocked = new Set((progress?.achievements ?? []).map((a) => a.achievement_id));
  const days = new Map((dash?.heatmap ?? []).map((d) => [d.day, d.xp]));
  const cells = Array.from({ length: 91 }, (_, i) => {
    const d = new Date(Date.now() + 2 * 3600000 - (90 - i) * 86400000).toISOString().slice(0, 10);
    return { d, xp: days.get(d) ?? 0 };
  });
  const setAvatar = async (k: string, v: string) => {
    await api.updateProfile({ avatar: { ...profile.avatar, [k]: v } });
    await refresh();
  };
  const setSetting = async (k: string, v: unknown) => {
    await api.updateProfile({ settings: { ...profile.settings, [k]: v } });
    await refresh();
  };
  const voices = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis.getVoices() : [];

  return (
    <Panel title={`${profile.name}'s Room`} icon="🏠" color="#ec4899">
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="col">
          <div className="card row">
            <div className="level-badge" style={{ width: 64, height: 64, fontSize: 26 }}>{profile.overall.level}</div>
            <div className="grow">
              <h2 style={{ margin: 0 }}>{profile.name}</h2>
              <div className="muted">{profile.totalXp.toLocaleString()} XP · Day {profile.dayNumber} · 🔥 {profile.streak.current} (best {profile.streak.longest})</div>
              <Bar value={profile.overall.progress} color="#f59e0b" />
            </div>
          </div>
          {profile.streams.map((s) => (
            <div key={s.stream} className="card">
              <div className="row">
                <span style={{ fontSize: 22 }}>{STREAM_ICON[s.stream]}</span>
                <div className="grow">
                  <b>{STREAM_NAME[s.stream]}</b> - <span style={{ color: STREAM_COLOR[s.stream] }}>{s.rank.title}</span>
                  <div className="dim" style={{ fontSize: 12 }}>{s.rank.plain}</div>
                </div>
                <span className="pill">Lv {s.level} · {s.xp} XP</span>
              </div>
              <Bar value={s.progress} color={STREAM_COLOR[s.stream]} />
            </div>
          ))}
          <div className="card">
            <b>Last 13 weeks</b>
            <div className="heat" style={{ marginTop: 8 }}>
              {cells.map((c) => (
                <div key={c.d} title={`${c.d}: ${c.xp} XP`} style={{ background: c.xp === 0 ? '#0f1a2e' : c.xp < 100 ? '#14532d' : c.xp < 300 ? '#16a34a' : '#4ade80' }} />
              ))}
            </div>
          </div>
          {dash && (
            <div className="card">
              <b>Course size</b>
              {dash.totals.map((t) => (
                <div key={t.stream} className="row" style={{ fontSize: 13 }}>
                  <span style={{ width: 150 }}>{STREAM_ICON[t.stream]} {STREAM_NAME[t.stream]}</span>
                  <span className="muted">{t.chapters} chapters · {t.lessons} lessons · {t.questions} questions · {(t.minutes / 60).toFixed(1)} h of reading</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="col">
          <div className="card col">
            <b>🎨 Customise your character</b>
            {Object.entries(PALETTE).map(([k, colors]) => (
              <div key={k} className="row">
                <span style={{ width: 60 }} className="muted">{k}</span>
                {colors.map((c) => (
                  <button key={c} onClick={() => void setAvatar(k, c)} style={{ width: 26, height: 26, borderRadius: 7, background: c, border: profile.avatar[k] === c ? '3px solid #fbbf24' : '1px solid #475569' }} />
                ))}
              </div>
            ))}
          </div>
          <div className="card col">
            <b>⚙ Settings</b>
            <label className="row"><input type="checkbox" checked={profile.settings.hints !== false} onChange={(e) => void setSetting('hints', e.target.checked)} /> Show "Route Runner hint" explanations in labs</label>
            <label className="row"><input type="checkbox" checked={!!profile.settings.freeRoam} onChange={(e) => void setSetting('freeRoam', e.target.checked)} /> Free roam: unlock all chapters (for revision)</label>
            <label className="row"><input type="checkbox" checked={profile.settings.sound !== false} onChange={(e) => void setSetting('sound', e.target.checked)} /> Sound effects</label>
            <label className="row">Graphics <select value={profile.settings.quality ?? 'auto'} onChange={(e) => void setSetting('quality', e.target.value)}><option value="auto">Auto - pick for my graphics chip ({detectQuality()})</option><option value="ultra">Ultra - everything on (gaming GPUs)</option><option value="high">High - soft shadows and glowing lights</option><option value="medium">Medium - shadows, smooth edges (most laptops)</option><option value="low">Low - fastest</option></select></label>
            <label className="row">Read-aloud voice <select value={profile.settings.voice ?? ''} onChange={(e) => void setSetting('voice', e.target.value)}><option value="">Default</option>{voices.map((v) => <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>)}</select></label>
          </div>
          <div className="card col">
            <b>💾 Save file</b>
            <div className="muted" style={{ fontSize: 13 }}>Progress saves automatically to a database on this PC (in %LOCALAPPDATA%\RouteRunner, with daily backups). Export a copy to move to another computer.</div>
            <div className="row">
              <button className="btn" onClick={async () => { const s = await api.exportSave(); const url = URL.createObjectURL(new Blob([JSON.stringify(s, null, 1)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = `route-runner-save-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(url); }}>⬇ Export save</button>
              <button className="btn" onClick={() => fileRef.current?.click()}>⬆ Import save</button>
              <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={async (e) => { const f = e.target.files?.[0]; if (!f || !confirm('Replace ALL current progress with this save file?')) return; await api.importSave(JSON.parse(await f.text())); location.reload(); }} />
            </div>
          </div>
          <div className="card">
            <b>🏆 Achievements ({unlocked.size}/{ACHIEVEMENTS.length})</b>
            <div className="grid-2" style={{ marginTop: 8 }}>
              {ACHIEVEMENTS.map((a) => (
                <div key={a.id} className="term" style={{ opacity: unlocked.has(a.id) ? 1 : 0.4 }}>
                  <span style={{ fontSize: 20 }}>{unlocked.has(a.id) ? a.icon : '🔒'}</span> <b>{a.title}</b>
                  <div className="dim" style={{ fontSize: 12 }}>{a.description} (+{a.xp})</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}
