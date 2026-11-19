import { useEffect, useState } from 'react';
import { api } from '../api';
import { useGame } from '../store';
import { Panel, STREAM_COLOR, STREAM_ICON } from '../ui/Panel';

export default function QuestPanel() {
  const { open, profile } = useGame();
  const done = useGame((s) => s.completedLessons());
  const [q, setQ] = useState<Awaited<ReturnType<typeof api.daily>> | null>(null);
  const [cards, setCards] = useState<number | null>(null);
  useEffect(() => {
    api.daily().then(setQ);
    api.dueCards().then((r) => setCards(r.due.length));
  }, []);
  if (!q || !profile) return null;
  const weekPlan = [
    ['Mon-Fri', '1 Network lesson + 1 Cloud or Forex lesson, 15 flashcards, 10 drills (~60 min)'],
    ['Saturday', 'One Packet Lab mission + one Cloud/Linux lab + bar-replay 5 trades (~90 min)'],
    ['Sunday', 'Boss battles for finished chapters, journal review, rest. Every 4th Sunday: a 60-question mock exam.'],
  ];
  return (
    <Panel title={`Daily Quest - Day ${q.day}`} icon="📜" color="#f59e0b">
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="col">
          <h3>Today's missions</h3>
          {q.lessons.map((l) => (
            <div key={l.id} className={`objective ${done.has(l.id) ? 'done' : ''}`} style={{ cursor: 'pointer' }} onClick={() => open({ kind: 'academy', stream: l.stream as 'network', lessonId: l.id })}>
              <div className="check">{done.has(l.id) ? '✓' : ''}</div>
              <div className="grow">
                <b style={{ color: STREAM_COLOR[l.stream] }}>{STREAM_ICON[l.stream]} {l.title}</b>
                <div className="dim" style={{ fontSize: 12 }}>{l.minutes} min · click to start</div>
              </div>
            </div>
          ))}
          {q.lessons.length === 0 && <div className="card">You've completed every lesson available. Legend. Revise with Free Roam, drills and mock exams.</div>}
          <div className={`objective ${cards === 0 ? 'done' : ''}`} style={{ cursor: 'pointer' }} onClick={() => open({ kind: 'exam', tab: 'cards' })}>
            <div className="check">{cards === 0 ? '✓' : ''}</div>
            <div><b>🗂️ Review flashcards</b><div className="dim" style={{ fontSize: 12 }}>{cards ?? '...'} due today</div></div>
          </div>
          <div className="objective" style={{ cursor: 'pointer' }} onClick={() => open({ kind: 'exam', tab: 'drills' })}>
            <div className="check" />
            <div><b>🎯 10 drills: {q.drills}</b><div className="dim" style={{ fontSize: 12 }}>speed builds confidence</div></div>
          </div>
          <div className="card" style={{ borderColor: profile.activeToday ? '#16a34a' : '#f59e0b' }}>
            {profile.activeToday ? `🔥 Streak safe for today (${profile.streak.current} days). Anything more is bonus XP.` : '🕯️ Complete any lesson, lab, drill or flashcard today to keep your streak alive.'}
          </div>
        </div>
        <div className="col">
          <h3>Your 3-month rhythm</h3>
          {weekPlan.map(([d, t]) => (
            <div key={d} className="term"><b>{d}</b> - {t}</div>
          ))}
          <div className="card">
            <b>Milestones</b>
            <ul style={{ margin: '6px 0 0', lineHeight: 1.8 }}>
              <li><b>Weeks 1-4:</b> computer & network foundations, cabling, IOS basics, IPv4 + subnetting · Linux basics · forex basics (pairs, pips, lots).</li>
              <li><b>Weeks 5-8:</b> VLANs, STP, routing, OSPF, IPv6 · Linux admin, VMs, cloud concepts, AWS · charts & technical analysis.</li>
              <li><b>Weeks 9-12:</b> services, security, wireless, automation & AI · Docker, Kubernetes, DevOps, HPC · risk, psychology, trading plan.</li>
              <li><b>Week 13:</b> capstone network, mock exams at 82%+, 50+ journaled demo trades. Book the CCNA.</li>
            </ul>
          </div>
        </div>
      </div>
    </Panel>
  );
}
