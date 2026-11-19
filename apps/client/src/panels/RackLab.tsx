import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { RACK_ITEMS, RACK_POWER_W, evaluateRack, rackInletTemp, type RackSlot } from '@route-runner/content';
import { api } from '../api';
import { useGame } from '../store';
import { Panel } from '../ui/Panel';
import { sfx } from '../sfx';

const U = 0.18; // metres per rack unit (scaled)
const HEIGHT = 42;

export default function RackLab() {
  const [slots, setSlots] = useState<RackSlot[]>([]);
  const [tool, setTool] = useState<string>('ups');
  const [airflow, setAirflow] = useState(false);
  const [done, setDone] = useState(false);
  const { reward, progress } = useGame();
  const already = (progress?.labs ?? []).some((l) => l.kind === 'rack' && l.completed_at);

  useEffect(() => {
    api.getLab<{ slots: RackSlot[] }>('rack', 'web-cluster').then((r) => r.state?.slots && setSlots(r.state.slots)).catch(() => undefined);
  }, []);
  const results = useMemo(() => evaluateRack(slots, HEIGHT), [slots]);
  const temp = rackInletTemp(slots);
  const watts = slots.reduce((a, s) => a + (RACK_POWER_W[s.item] ?? 0), 0);
  const save = (next: RackSlot[]) => {
    setSlots(next);
    void api.saveLab('rack', 'web-cluster', { slots: next }, evaluateRack(next).filter((r) => r.ok).map((r) => r.rule.id)).catch(() => undefined);
  };

  const occupied = (u: number) => slots.find((s) => u >= s.u && u < s.u + (RACK_ITEMS.find((r) => r.id === s.item)?.units ?? 1));
  const place = (u: number) => {
    const hit = occupied(u);
    if (hit) {
      save(slots.filter((s) => s !== hit));
      sfx('hit');
      return;
    }
    const item = RACK_ITEMS.find((r) => r.id === tool)!;
    for (let k = 0; k < item.units; k++) if (u + k > HEIGHT || occupied(u + k)) return useGame.getState().toast({ text: `${item.name} needs ${item.units}U of free space from U${u} upward.`, tone: 'error' });
    save([...slots, { u, item: tool }]);
    sfx('click');
  };

  const complete = async () => {
    setDone(true);
    reward(await api.completeLab('rack', 'web-cluster', 20), 'Rack built to best practice');
  };

  return (
    <Panel title="Data Centre - Build a Server Rack" icon="🗄️" color="#94a3b8" flush>
      <div className="split" style={{ gridTemplateColumns: 'minmax(0, 1.3fr) minmax(360px, 1fr)' }}>
        <div style={{ position: 'relative', background: '#0b1220' }}>
          <Canvas camera={{ position: [3.2, 4.4, 6.5], fov: 45 }}>
            <color attach="background" args={['#0b1220']} />
            <ambientLight intensity={0.6} />
            <directionalLight position={[4, 8, 6]} intensity={1} />
            <Rack slots={slots} onSlot={place} airflow={airflow} temp={temp} />
            <OrbitControls target={[0, (HEIGHT * U) / 2, 0]} makeDefault />
          </Canvas>
          <div style={{ position: 'absolute', top: 10, left: 10 }} className="row wrap">
            <button className={`btn small ${airflow ? 'primary' : ''}`} onClick={() => setAirflow(!airflow)}>
              🌬 Airflow view
            </button>
            <span className="pill">🌡 Inlet {temp}°C {temp > 27 ? '(too hot!)' : '(ASHRAE 18-27°C ✓)'}</span>
            <span className="pill">⚡ {watts} W / 8000 W</span>
          </div>
          <div className="pill" style={{ position: 'absolute', bottom: 10, left: 10 }}>
            Click an empty U to install the selected item · click an item to remove it · drag to orbit
          </div>
        </div>
        <div style={{ padding: 14, overflow: 'auto', borderLeft: '1px solid var(--line)' }} className="col">
          <div className="card" style={{ borderColor: '#94a3b8' }}>
            <b>Mission: rack for the Kuruman Marketplace web cluster</b>
            <p className="muted" style={{ marginBottom: 0 }}>Build a 42U rack with a patch panel, a top-of-rack switch, at least two web servers, a database host and a UPS for load-shedding. Follow data-centre best practice - the checklist grades you live.</p>
          </div>
          <b>Equipment</b>
          <div className="col" style={{ gap: 6 }}>
            {RACK_ITEMS.map((r) => (
              <button key={r.id} className="btn" style={{ justifyContent: 'flex-start', textAlign: 'left', borderColor: tool === r.id ? '#fbbf24' : undefined }} onClick={() => setTool(r.id)} title={r.what}>
                <span style={{ width: 14, height: 14, background: r.color, borderRadius: 3, border: '1px solid #475569' }} />
                <span className="grow">
                  {r.name} <span className="dim">· {r.units}U · {r.weightKg} kg · {RACK_POWER_W[r.id]} W</span>
                </span>
              </button>
            ))}
          </div>
          <div className="explain" style={{ fontSize: 13 }}>{RACK_ITEMS.find((r) => r.id === tool)?.what}</div>
          <b>Best-practice checklist</b>
          {results.map((r) => (
            <div key={r.rule.id} className={`objective ${r.ok ? 'done' : ''}`}>
              <div className="check">{r.ok ? '✓' : ''}</div>
              <div>
                <div>{r.rule.text}</div>
                <div className="dim" style={{ fontSize: 12 }}>{r.detail} - {r.rule.why}</div>
              </div>
            </div>
          ))}
          <button className="btn good" disabled={!results.every((r) => r.ok) || done || already} onClick={() => void complete()}>
            {already || done ? '✅ Rack certified' : '✔ Submit rack for inspection'}
          </button>
          <button className="btn small" onClick={() => save([])}>
            ↺ Empty the rack
          </button>
        </div>
      </div>
    </Panel>
  );
}

function Rack({ slots, onSlot, airflow, temp }: { slots: RackSlot[]; onSlot: (u: number) => void; airflow: boolean; temp: number }) {
  const W = 1.2;
  const D = 1.6;
  const H = HEIGHT * U;
  return (
    <group>
      <mesh position={[0, -0.02, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[8, 8]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
      {/* cold aisle (front, blue) and hot aisle (back, red) floor tiles */}
      <mesh position={[0, 0, D / 2 + 1]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[3, 1.6]} />
        <meshBasicMaterial color="#1e3a8a" transparent opacity={0.5} />
      </mesh>
      <mesh position={[0, 0, -D / 2 - 1]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[3, 1.6]} />
        <meshBasicMaterial color="#7f1d1d" transparent opacity={0.5} />
      </mesh>
      <Html position={[1.9, 0.1, D / 2 + 1]} center distanceFactor={8}>
        <div className="label3d" style={{ fontSize: 11 }}>❄ Cold aisle (front)</div>
      </Html>
      <Html position={[1.9, 0.1, -D / 2 - 1]} center distanceFactor={8}>
        <div className="label3d" style={{ fontSize: 11 }}>🔥 Hot aisle (back)</div>
      </Html>
      {/* rack frame */}
      {[[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2]].map(([x, z], i) => (
        <mesh key={i} position={[x, H / 2, z]}>
          <boxGeometry args={[0.06, H, 0.06]} />
          <meshStandardMaterial color="#111827" />
        </mesh>
      ))}
      <mesh position={[0, H + 0.03, 0]}>
        <boxGeometry args={[W + 0.06, 0.06, D + 0.06]} />
        <meshStandardMaterial color="#111827" />
      </mesh>
      {/* clickable U slots */}
      {Array.from({ length: HEIGHT }, (_, k) => k + 1).map((u) => (
        <mesh key={u} position={[0, (u - 0.5) * U, D / 2]} onClick={(e) => { e.stopPropagation(); onSlot(u); }} onPointerOver={() => (document.body.style.cursor = 'pointer')} onPointerOut={() => (document.body.style.cursor = '')}>
          <boxGeometry args={[W - 0.08, U * 0.92, 0.02]} />
          <meshBasicMaterial color={u % 2 ? '#1e293b' : '#172033'} transparent opacity={0.5} />
        </mesh>
      ))}
      {[1, 10, 20, 30, 42].map((u) => (
        <Html key={u} position={[-W / 2 - 0.25, (u - 0.5) * U, D / 2]} center distanceFactor={7}>
          <div style={{ color: '#64748b', fontSize: 10, fontFamily: 'var(--mono)' }}>U{u}</div>
        </Html>
      ))}
      {/* equipment */}
      {slots.map((s) => {
        const item = RACK_ITEMS.find((r) => r.id === s.item)!;
        const h = item.units * U;
        return (
          <group key={`${s.u}-${s.item}`} position={[0, (s.u - 1) * U + h / 2, 0]} onClick={(e) => { e.stopPropagation(); onSlot(s.u); }}>
            <mesh>
              <boxGeometry args={[W - 0.1, h * 0.96, D - 0.1]} />
              <meshStandardMaterial color={item.color} metalness={0.4} roughness={0.5} />
            </mesh>
            {item.ports &&
              Array.from({ length: Math.min(12, item.ports) }, (_, k) => (
                <mesh key={k} position={[-0.45 + k * 0.08, 0, D / 2 - 0.04]}>
                  <boxGeometry args={[0.04, 0.03, 0.01]} />
                  <meshBasicMaterial color={k % 4 === 0 ? '#f59e0b' : '#22c55e'} />
                </mesh>
              ))}
          </group>
        );
      })}
      {airflow && <Airflow H={H} D={D} temp={temp} gaps={evaluateRack(slots).find((r) => r.rule.id === 'no-gaps')?.ok === false} />}
    </group>
  );
}

function Airflow({ H, D, temp, gaps }: { H: number; D: number; temp: number; gaps: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const N = 120;
  const seeds = useMemo(() => Array.from({ length: N }, (_, i) => ({ y: (i * 0.618) % 1, x: ((i * 0.33) % 1) - 0.5, off: (i * 0.137) % 1, loop: gaps && i % 5 === 0 })), [gaps]);
  const color = new THREE.Color();
  useFrame(({ clock }) => {
    const m = ref.current;
    if (!m) return;
    const o = new THREE.Object3D();
    seeds.forEach((s, i) => {
      const t = (clock.elapsedTime * 0.35 + s.off) % 1;
      let z = D / 2 + 1 - t * (D + 2);
      let y = s.y * H;
      if (s.loop && t > 0.6) {
        // recirculation through an open gap: hot air sneaks back to the front
        z = -D / 2 - 0.2 + (t - 0.6) * 6;
        y += 0.15;
      }
      o.position.set(s.x * 0.9, y, z);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      const hot = s.loop ? 1 : Math.min(1, Math.max(0, (D / 2 - z) / (D + 1)));
      color.setRGB(0.2 + hot * 0.8, 0.4 - hot * 0.25, 1 - hot * 0.9 + (temp > 27 ? 0 : 0));
      m.setColorAt(i, color);
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, N]}>
      <sphereGeometry args={[0.035, 6, 6]} />
      <meshBasicMaterial />
    </instancedMesh>
  );
}
