import { useEffect, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { BOOT_SEQUENCE, PC_BUILD_STEPS, PC_PARTS } from '@route-runner/content';
import { api } from '../api';
import { useGame } from '../store';
import { Panel } from '../ui/Panel';
import { sfx } from '../sfx';

/** Where each part ends up inside the case, and where it waits on the workbench. */
const TARGET: Record<string, { pos: [number, number, number]; size: [number, number, number] }> = {
  motherboard: { pos: [0, 1.2, -0.42], size: [1.6, 1.8, 0.06] },
  cpu: { pos: [0.1, 1.6, -0.36], size: [0.3, 0.3, 0.05] },
  paste: { pos: [0.1, 1.6, -0.33], size: [0.12, 0.12, 0.02] },
  cooler: { pos: [0.1, 1.6, -0.15], size: [0.55, 0.55, 0.35] },
  ram: { pos: [0.55, 1.55, -0.33], size: [0.08, 0.7, 0.12] },
  ssd: { pos: [-0.05, 1.05, -0.37], size: [0.5, 0.12, 0.03] },
  gpu: { pos: [-0.05, 0.8, -0.1], size: [1.3, 0.25, 0.6] },
  psu: { pos: [0, 0.2, -0.05], size: [0.9, 0.35, 0.8] },
  fans: { pos: [0, 1.2, 0.47], size: [0.05, 1.4, 0.05] },
  nic: { pos: [-0.7, 1.9, -0.39], size: [0.2, 0.15, 0.05] },
};

export default function PcWorkshop() {
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState<'build' | 'boot' | 'done'>('build');
  const [boot, setBoot] = useState(0);
  const [wrong, setWrong] = useState<string | null>(null);
  const { reward } = useGame();
  const installed = new Set(PC_BUILD_STEPS.slice(0, step).map((s) => s.part));
  installed.add('motherboard'); // board shown in the case from the start for context
  const cur = PC_BUILD_STEPS[step];

  useEffect(() => {
    if (phase !== 'boot') return;
    if (boot >= BOOT_SEQUENCE.length) {
      setPhase('done');
      api.completeLab('pcbuild', 'workshop', 15).then((r) => reward(r, 'PC built and booted'));
      return;
    }
    const t = setTimeout(() => setBoot(boot + 1), 1600);
    return () => clearTimeout(t);
  }, [phase, boot, reward]);

  const pick = (part: string) => {
    if (phase !== 'build') return;
    if (part === cur?.part) {
      sfx('correct');
      setWrong(null);
      setStep(step + 1);
    } else {
      sfx('wrong');
      const target = PC_BUILD_STEPS.find((s) => s.part === part);
      setWrong(target && PC_BUILD_STEPS.indexOf(target) < step ? `${PC_PARTS.find((p) => p.id === part)?.name} is already installed.` : `Not yet! Think about the order: you need "${PC_PARTS.find((p) => p.id === cur?.part)?.name}" next. ${cur?.why}`);
    }
  };

  return (
    <Panel title="PC Workshop - Build, Cool & Boot a Computer" icon="🖥️" color="#f59e0b" flush>
      <div className="split" style={{ gridTemplateColumns: 'minmax(0, 1.3fr) minmax(360px, 1fr)' }}>
        <div style={{ position: 'relative', background: '#140f08' }}>
          <Canvas camera={{ position: [1.6, 2.7, 4.6], fov: 45 }}>
            <color attach="background" args={['#120d06']} />
            <ambientLight intensity={0.7} />
            <directionalLight position={[3, 6, 4]} intensity={1.1} />
            <Bench installed={installed} next={cur?.part} onPick={pick} airflow={phase !== 'build'} powered={phase !== 'build'} />
            <OrbitControls target={[0, 0.9, 0.5]} makeDefault />
          </Canvas>
          <div className="pill" style={{ position: 'absolute', bottom: 10, left: 10 }}>
            Click the glowing part on the bench to install it · drag to rotate
          </div>
        </div>
        <div style={{ padding: 14, overflow: 'auto', borderLeft: '1px solid var(--line)' }} className="col">
          {phase === 'build' && cur && (
            <>
              <div className="card" style={{ borderColor: '#f59e0b' }}>
                <div className="muted" style={{ fontSize: 12 }}>Step {step + 1} of {PC_BUILD_STEPS.length}</div>
                <h3>{PC_PARTS.find((p) => p.id === cur.part)?.name}</h3>
                <div>{cur.action}</div>
                <div className="explain"><b>Why:</b> {cur.why}</div>
                <div className="explain" style={{ borderColor: '#ef4444', background: 'rgba(239,68,68,.07)' }}><b>Common mistake:</b> {cur.mistake}</div>
              </div>
              {wrong && <div className="card" style={{ borderColor: '#ef4444' }}>{wrong}</div>}
              <div className="card">
                <b>{PC_PARTS.find((p) => p.id === cur.part)?.name} in plain English</b>
                <p style={{ margin: '6px 0' }}>{PC_PARTS.find((p) => p.id === cur.part)?.what}</p>
                <div className="analogy">💡 {PC_PARTS.find((p) => p.id === cur.part)?.analogy}</div>
              </div>
            </>
          )}
          {phase === 'build' && !cur && (
            <div className="card col" style={{ borderColor: '#22c55e' }}>
              <h3>All parts installed! 🎉</h3>
              <p className="muted">Close the side panel, plug in the power... and press the power button. Watch what happens before Ubuntu or Windows even starts.</p>
              <button className="btn good" onClick={() => { setPhase('boot'); setBoot(0); sfx('level'); }}>⏻ Power on</button>
            </div>
          )}
          {phase !== 'build' && (
            <div className="col">
              <h3>Boot sequence</h3>
              {BOOT_SEQUENCE.map((b, i) => (
                <div key={b.step} className={`objective ${i < boot ? 'done' : ''}`} style={{ opacity: i <= boot ? 1 : 0.35 }}>
                  <div className="check">{i < boot ? '✓' : i === boot ? '…' : ''}</div>
                  <div>
                    <b>{b.step}</b>
                    <div className="muted" style={{ fontSize: 13 }}>{b.plain}</div>
                  </div>
                </div>
              ))}
              {phase === 'done' && (
                <div className="card" style={{ borderColor: '#22c55e' }}>
                  ✅ The PC booted! Look at the airflow particles: cool air in at the front, hot air out the back and top. Now you know what's inside every server, router and laptop you'll ever troubleshoot.
                  <div className="row" style={{ marginTop: 8 }}>
                    <button className="btn small" onClick={() => { setStep(0); setPhase('build'); setBoot(0); }}>Build again</button>
                  </div>
                </div>
              )}
            </div>
          )}
          <details>
            <summary className="muted" style={{ cursor: 'pointer' }}>All parts explained</summary>
            {PC_PARTS.map((p) => (
              <div key={p.id} className="term" style={{ margin: '6px 0' }}>
                <b>{p.name}</b> - {p.what} <span className="dim">({p.analogy})</span>
              </div>
            ))}
          </details>
        </div>
      </div>
    </Panel>
  );
}

function Bench({ installed, next, onPick, airflow, powered }: { installed: Set<string>; next?: string; onPick: (p: string) => void; airflow: boolean; powered: boolean }) {
  const benchParts = PC_PARTS.filter((p) => p.id !== 'case' && p.id !== 'motherboard' && !installed.has(p.id));
  return (
    <group>
      <mesh position={[0, -0.02, 0]}>
        <boxGeometry args={[7, 0.04, 4]} />
        <meshStandardMaterial color="#5b3a1e" />
      </mesh>
      {/* case: open side panel */}
      <group>
        <mesh position={[0, 1.2, -0.5]}>
          <boxGeometry args={[1.8, 2.4, 0.04]} />
          <meshStandardMaterial color="#1f2937" />
        </mesh>
        {[[0, 0.02, 0, 1.8, 0.04, 1], [0, 2.38, 0, 1.8, 0.04, 1], [-0.9, 1.2, 0, 0.04, 2.4, 1], [0.9, 1.2, 0, 0.04, 2.4, 1]].map(([x, y, z, w, h, d], i) => (
          <mesh key={i} position={[x, y, z]}>
            <boxGeometry args={[w, h, d]} />
            <meshStandardMaterial color="#2b2f3a" transparent opacity={0.9} />
          </mesh>
        ))}
        {powered && (
          <mesh position={[0.75, 2.2, 0.5]}>
            <sphereGeometry args={[0.04, 8, 8]} />
            <meshBasicMaterial color="#22c55e" />
          </mesh>
        )}
      </group>
      {[...installed].map((id) => {
        const t = TARGET[id];
        const part = PC_PARTS.find((p) => p.id === id);
        if (!t || !part) return null;
        return (
          <mesh key={id} position={t.pos}>
            <boxGeometry args={t.size} />
            <meshStandardMaterial color={part.color} emissive={powered && (id === 'fans' || id === 'cooler') ? '#38bdf8' : '#000'} emissiveIntensity={0.3} />
          </mesh>
        );
      })}
      {benchParts.map((p, i) => (
        <BenchPart key={p.id} id={p.id} name={p.name} color={p.color} pos={[-1.0 + (i % 4) * 0.62, 0.15, 1.25 + Math.floor(i / 4) * 0.6]} glow={p.id === next} onPick={onPick} />
      ))}
      {airflow && <CaseAirflow />}
    </group>
  );
}

function BenchPart({ id, name, color, pos, glow, onPick }: { id: string; name: string; color: string; pos: [number, number, number]; glow: boolean; onPick: (p: string) => void }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.position.y = pos[1] + (glow ? Math.abs(Math.sin(clock.elapsedTime * 3)) * 0.15 : 0);
  });
  return (
    <group>
      <mesh ref={ref} position={pos} onClick={(e) => { e.stopPropagation(); onPick(id); }} onPointerOver={() => (document.body.style.cursor = 'pointer')} onPointerOut={() => (document.body.style.cursor = '')}>
        <boxGeometry args={[0.42, 0.2, 0.42]} />
        <meshStandardMaterial color={color} emissive={glow ? '#f59e0b' : '#000'} emissiveIntensity={glow ? 0.6 : 0} />
      </mesh>
      <Html position={[pos[0], pos[1] + 0.35, pos[2]]} center distanceFactor={6}>
        <div className="label3d" style={{ fontSize: 10, borderColor: glow ? '#f59e0b' : undefined }}>{name}</div>
      </Html>
    </group>
  );
}

function CaseAirflow() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const N = 70;
  const col = new THREE.Color();
  useFrame(({ clock }) => {
    const o = new THREE.Object3D();
    for (let i = 0; i < N; i++) {
      const t = (clock.elapsedTime * 0.4 + i / N) % 1;
      const y = 0.4 + ((i * 0.618) % 1) * 1.6 + t * 0.5;
      o.position.set(0.95 - t * 1.9, Math.min(2.3, y), -0.2 + ((i * 0.31) % 1) * 0.6);
      o.updateMatrix();
      ref.current!.setMatrixAt(i, o.matrix);
      col.setRGB(0.25 + t * 0.75, 0.5 - t * 0.3, 1 - t);
      ref.current!.setColorAt(i, col);
    }
    ref.current!.instanceMatrix.needsUpdate = true;
    if (ref.current!.instanceColor) ref.current!.instanceColor.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, N]}>
      <sphereGeometry args={[0.025, 6, 6]} />
      <meshBasicMaterial />
    </instancedMesh>
  );
}
