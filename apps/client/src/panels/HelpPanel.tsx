import { ZONES } from '../world/zones';
import { useGame } from '../store';
import { Panel } from '../ui/Panel';

export default function HelpPanel() {
  const open = useGame((s) => s.open);
  return (
    <Panel title="How to play Route Runner" icon="❓">
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="col">
          <div className="card">
            <h3>🎮 Controls</h3>
            <div style={{ lineHeight: 2 }}>
              <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> / arrows - walk · <kbd>Shift</kbd> - run · <kbd>Space</kbd> - jump
              <br />Drag the mouse - look around · Mouse wheel - zoom
              <br /><kbd>E</kbd> - enter the building in front of you · <kbd>Esc</kbd> - close a window
            </div>
          </div>
          <div className="card">
            <h3>🧭 How the game teaches you</h3>
            <ol style={{ lineHeight: 1.7, margin: 0 }}>
              <li><b>Lessons</b> in plain English with an analogy, key terms, "say it like a pro" lines (read aloud!), and an interview question to practise speaking.</li>
              <li><b>Quizzes</b> after every lesson (60% to pass) and a <b>boss battle</b> at the end of each chapter (70%).</li>
              <li><b>Labs</b>: real Cisco IOS, Linux, Docker, Kubernetes, AWS, Terraform and Slurm commands in safe simulators, plus 3D hardware labs.</li>
              <li><b>Flashcards</b> appear automatically and come back just before you forget them.</li>
              <li><b>Drills</b> for subnetting and forex maths until they're automatic.</li>
              <li><b>Mock exams</b> weighted like the real CCNA v2.0.</li>
            </ol>
          </div>
          <div className="card">
            <h3>📅 The plan</h3>
            About an hour a day for ~13 weeks. Keep your 🔥 streak alive: one lesson, lab, drill or flashcard review per day counts. Open the <b>Daily Quest</b> (top right) to see exactly what to do today.
          </div>
        </div>
        <div className="col">
          <h3>🗺️ The world</h3>
          {ZONES.map((z) => (
            <div key={z.id} className="card hover row" style={{ padding: 10 }} onClick={() => open(z.panel)}>
              <span style={{ fontSize: 24 }}>{z.icon}</span>
              <div className="grow">
                <b style={{ color: z.color }}>{z.name}</b>
                <div className="dim" style={{ fontSize: 13 }}>{z.subtitle}</div>
              </div>
              <span className="pill">open ↗</span>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}
