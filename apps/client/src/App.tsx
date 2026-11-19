import { Suspense, lazy, useEffect, useState } from 'react';
import { useGame } from './store';
import { World } from './world/World';
import { Hud, Toasts } from './ui/Hud';
import { TitleScreen } from './ui/TitleScreen';
import { setSound } from './sfx';

const Academy = lazy(() => import('./panels/Academy'));
const NetworkLab = lazy(() => import('./panels/NetworkLab'));
const ShellLab = lazy(() => import('./panels/ShellLab'));
const RackLab = lazy(() => import('./panels/RackLab'));
const PcWorkshop = lazy(() => import('./panels/PcWorkshop'));
const CableBench = lazy(() => import('./panels/CableBench'));
const TradingFloor = lazy(() => import('./panels/TradingFloor'));
const ExamHall = lazy(() => import('./panels/ExamHall'));
const ProfilePanel = lazy(() => import('./panels/ProfilePanel'));
const QuestPanel = lazy(() => import('./panels/QuestPanel'));
const HelpPanel = lazy(() => import('./panels/HelpPanel'));

export function App() {
  const { load, profile, panel, started, open } = useGame();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load()
      .then(() => {
        // Deep links, e.g. /?start=1&panel=trading  or  /?start=1&panel=academy&stream=network&lesson=n01-1
        const q = new URLSearchParams(location.search);
        if (q.get('start')) useGame.getState().setStarted(true);
        const p = q.get('panel');
        if (p === 'academy') open({ kind: 'academy', stream: (q.get('stream') as 'network') ?? 'network', lessonId: q.get('lesson') ?? undefined });
        else if (p === 'netlab') open({ kind: 'netlab', labId: q.get('lab') ?? undefined });
        else if (p === 'shelllab') open({ kind: 'shelllab', labId: q.get('lab') ?? undefined, profile: (q.get('profile') as 'linux') ?? 'linux' });
        else if (p && ['rack', 'pcbuild', 'cable', 'trading', 'profile', 'quest', 'help'].includes(p)) open({ kind: p } as never);
        else if (p === 'exam') open({ kind: 'exam', tab: (q.get('tab') as 'exam') ?? 'exam' });
      })
      .catch((e) => setError(String(e)));
  }, [load, open]);

  useEffect(() => {
    setSound(profile?.settings.sound !== false);
  }, [profile?.settings.sound]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && useGame.getState().panel) {
        const t = e.target as HTMLElement;
        if (t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA') return;
        open(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (error)
    return (
      <div style={{ padding: 40 }}>
        <h2>Route Runner could not reach its local server</h2>
        <p className="muted">Start the game with <code>play.cmd</code> (or <code>npm start</code>) so the save-game server is running, then refresh.</p>
        <pre className="exhibit">{error}</pre>
      </div>
    );
  if (!profile) return <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>Loading Route Runner...</div>;

  return (
    <>
      <World />
      {started ? <Hud /> : <TitleScreen />}
      <Toasts />
      <Suspense fallback={<div className="overlay">Loading...</div>}>
        {panel?.kind === 'academy' && <Academy key={`${panel.stream}`} panel={panel} />}
        {panel?.kind === 'netlab' && <NetworkLab initial={panel.labId} />}
        {panel?.kind === 'shelllab' && <ShellLab initial={panel.labId} profile={panel.profile} />}
        {panel?.kind === 'rack' && <RackLab />}
        {panel?.kind === 'pcbuild' && <PcWorkshop />}
        {panel?.kind === 'cable' && <CableBench />}
        {panel?.kind === 'trading' && <TradingFloor />}
        {panel?.kind === 'exam' && <ExamHall tab={panel.tab} />}
        {panel?.kind === 'profile' && <ProfilePanel />}
        {panel?.kind === 'quest' && <QuestPanel />}
        {panel?.kind === 'help' && <HelpPanel />}
      </Suspense>
    </>
  );
}
