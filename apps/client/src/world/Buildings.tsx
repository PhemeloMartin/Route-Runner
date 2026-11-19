import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { WorldLabel } from './WorldLabel';
import * as THREE from 'three';
import { ZONES, doorOf, type Zone } from './zones';
import { useGame } from '../store';

function Box({ p, s, c, e, castShadow = true }: { p: [number, number, number]; s: [number, number, number]; c: string; e?: string; castShadow?: boolean }) {
  return (
    <mesh position={p} castShadow={castShadow} receiveShadow>
      <boxGeometry args={s} />
      <meshLambertMaterial color={c} emissive={e ?? '#000000'} emissiveIntensity={e ? 0.9 : 0} />
    </mesh>
  );
}

function Blinker({ p, color, speed = 2, phase = 0 }: { p: [number, number, number]; color: string; speed?: number; phase?: number }) {
  const ref = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.opacity = Math.sin(clock.elapsedTime * speed + phase) > 0.2 ? 1 : 0.15;
  });
  return (
    <mesh position={p}>
      <boxGeometry args={[0.12, 0.12, 0.05]} />
      <meshBasicMaterial ref={ref} color={color} transparent />
    </mesh>
  );
}

function Building({ z }: { z: Zone }) {
  const near = useGame((s) => s.nearZone === z.id);
  const [w, h, d] = z.size;
  const [x, zz] = z.pos;
  const [dx, dz] = doorOf(z);
  const yaw = Math.atan2(dx - x, dz - zz); // face the plaza
  const wall = z.style === 'datacenter' ? '#cbd5e1' : z.style === 'trading' ? '#f1f5f9' : z.style === 'tower' ? '#e0f2fe' : z.style === 'hpc' ? '#1e1b4b' : z.style === 'linux' ? '#1f2937' : '#f8fafc';
  const windows = useMemo(() => {
    const out: [number, number][] = [];
    for (let fx = -w / 2 + 1; fx <= w / 2 - 1; fx += 1.6) for (let fy = 1.4; fy < h - 0.6; fy += 1.5) if (Math.abs(fx) > 0.9) out.push([fx, fy]);
    return out;
  }, [w, h]);

  return (
    <group position={[x, 0, zz]} rotation-y={yaw}>
      {/* foundation */}
      <Box p={[0, 0.1, 0]} s={[w + 0.6, 0.2, d + 0.6]} c="#64748b" />
      {/* walls */}
      <Box p={[0, h / 2 + 0.2, 0]} s={[w, h, d]} c={wall} />
      {/* coloured trim band + roof */}
      <Box p={[0, h + 0.25, 0]} s={[w + 0.4, 0.3, d + 0.4]} c={z.color} />
      {z.style === 'academy' && (
        <>
          <Box p={[0, h + 0.8, 0]} s={[w - 1, 0.8, d - 1]} c={z.color} />
          <Box p={[0, h + 1.5, 0]} s={[w - 3, 0.6, d - 3]} c="#1e3a8a" />
          {[-w / 2 + 0.6, -w / 4, w / 4, w / 2 - 0.6].map((cx) => (
            <Box key={cx} p={[cx, h / 2, d / 2 + 0.35]} s={[0.5, h, 0.5]} c="#e2e8f0" />
          ))}
        </>
      )}
      {z.style === 'tower' && (
        <>
          {[0, 1, 2].map((k) => (
            <Box key={k} p={[0, h + 0.8 + k * 1.1, 0]} s={[w - 1.2 - k * 1.2, 1, d - 1.2 - k * 1.2]} c={k % 2 ? '#0e7490' : '#22d3ee'} />
          ))}
          <FloatingClouds h={h} />
        </>
      )}
      {z.style === 'datacenter' && (
        <>
          {[-3, -1.5, 0, 1.5, 3].map((cx, i) => (
            <group key={cx}>
              <Box p={[cx, 1.6, d / 2 + 0.05]} s={[1, 2.6, 0.1]} c="#0f172a" />
              {[0, 1, 2, 3, 4].map((k) => (
                <Blinker key={k} p={[cx + (k % 2 ? 0.2 : -0.2), 0.7 + k * 0.45, d / 2 + 0.12]} color={k % 3 ? '#22c55e' : '#f59e0b'} speed={3 + i + k} phase={k} />
              ))}
            </group>
          ))}
          <Box p={[w / 2 - 1, h + 0.9, -1]} s={[1.6, 1.2, 1.6]} c="#94a3b8" />
          <Box p={[w / 2 - 3, h + 0.9, -1]} s={[1.6, 1.2, 1.6]} c="#94a3b8" />
        </>
      )}
      {z.style === 'hpc' && (
        <>
          {[-2, -0.7, 0.6, 1.9].map((cx, i) => (
            <group key={cx}>
              <Box p={[cx, h / 2, d / 2 + 0.05]} s={[1, h - 1, 0.1]} c="#312e81" />
              {[0, 1, 2, 3, 4, 5, 6].map((k) => (
                <Blinker key={k} p={[cx, 1 + k * 0.75, d / 2 + 0.12]} color={k % 2 ? '#a855f7' : '#38bdf8'} speed={5 + i} phase={k * 0.7} />
              ))}
            </group>
          ))}
        </>
      )}
      {z.style === 'trading' && (
        <>
          <Box p={[0, h + 0.8, 0]} s={[w - 0.8, 0.9, d - 0.8]} c="#14532d" />
          <TickerBoard w={w} h={h} d={d} />
        </>
      )}
      {z.style === 'linux' && <Box p={[0, h + 1, 0]} s={[2, 1.4, 2]} c="#eab308" />}
      {z.style === 'home' && (
        <>
          <Box p={[0, h + 0.7, 0]} s={[w, 0.7, d]} c="#be185d" />
          <Box p={[0, h + 1.3, 0]} s={[w - 1.4, 0.6, d]} c="#9d174d" />
        </>
      )}
      {(z.style === 'hut' || z.style === 'lab' || z.style === 'exam') && <Box p={[0, h + 0.75, 0]} s={[w - 1, 0.6, d - 1]} c={z.color} />}
      {/* windows */}
      {z.style !== 'datacenter' &&
        z.style !== 'hpc' &&
        windows.map(([fx, fy]) => <Box key={`${fx}-${fy}`} p={[fx, fy, d / 2 + 0.02]} s={[0.9, 0.8, 0.05]} c="#bae6fd" e="#0ea5e9" castShadow={false} />)}
      {/* glowing door */}
      <Box p={[0, 1.2, d / 2 + 0.03]} s={[1.4, 2.2, 0.08]} c={near ? '#fde68a' : z.color} e={near ? '#f59e0b' : z.color} castShadow={false} />
      <WorldLabel position={[0, h + (z.style === 'tower' ? 5.5 : 2.6), 0]} size={26}>
        <div className="label3d" style={{ borderColor: z.color }}>
          {z.icon} {z.name}
          <small>{z.subtitle}</small>
        </div>
      </WorldLabel>
    </group>
  );
}

function FloatingClouds({ h }: { h: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.y = clock.elapsedTime * 0.15;
  });
  return (
    <group ref={ref} position={[0, h + 3, 0]}>
      {[0, 1, 2, 3].map((k) => (
        <group key={k} rotation-y={(k * Math.PI) / 2} position={[0, (k % 2) * 0.8, 0]}>
          <Box p={[5, 0, 0]} s={[2.2, 0.8, 1.4]} c="#ffffff" castShadow={false} />
          <Box p={[5.8, 0.5, 0]} s={[1.2, 0.7, 1]} c="#ffffff" castShadow={false} />
        </group>
      ))}
    </group>
  );
}

function TickerBoard({ w, h, d }: { w: number; h: number; d: number }) {
  const ref = useRef<THREE.Group>(null);
  const bars = useMemo(() => Array.from({ length: 10 }, (_, i) => 0.3 + Math.abs(Math.sin(i * 1.7)) * 1.2), []);
  useFrame(({ clock }) => {
    ref.current?.children.forEach((c, i) => {
      c.scale.y = 0.5 + Math.abs(Math.sin(clock.elapsedTime * 0.6 + i)) * bars[i];
    });
  });
  return (
    <group position={[-w / 2 + 1, h - 1.4, d / 2 + 0.06]}>
      <mesh position={[(w - 2) / 2 - 0.4, 0.3, -0.02]}>
        <boxGeometry args={[w - 1.2, 1.6, 0.05]} />
        <meshBasicMaterial color="#020617" />
      </mesh>
      <group ref={ref}>
        {bars.map((_, i) => (
          <mesh key={i} position={[i * 0.6, 0, 0.02]}>
            <boxGeometry args={[0.35, 1, 0.04]} />
            <meshBasicMaterial color={i % 3 === 1 ? '#ef4444' : '#22c55e'} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** The iconic router at the centre of the plaza, with antennas and status LEDs. */
export function RouterTower() {
  return (
    <group position={[0, 0, 0]}>
      <Box p={[0, 0.5, 0]} s={[5, 1, 5]} c="#475569" />
      <Box p={[0, 1.9, 0]} s={[3.6, 1.8, 2.2]} c="#0f172a" />
      <Box p={[0, 1.9, 1.12]} s={[3.2, 0.25, 0.05]} c="#1e293b" />
      {[-1.2, -0.6, 0, 0.6, 1.2].map((x, i) => (
        <Blinker key={x} p={[x, 1.9, 1.16]} color={i === 0 ? '#38bdf8' : '#22c55e'} speed={4 + i * 1.3} phase={i} />
      ))}
      {[-1.4, 1.4].map((x) => (
        <group key={x}>
          <Box p={[x, 3.4, -0.6]} s={[0.18, 2.2, 0.18]} c="#111827" />
          <Blinker p={[x, 4.55, -0.6]} color="#f43f5e" speed={1.5} />
        </group>
      ))}
      <WorldLabel position={[0, 5.4, 0]} size={22} near={4}>
        <div className="label3d">📡 Core Router · Ithute Plaza</div>
      </WorldLabel>
    </group>
  );
}

export function Buildings() {
  return (
    <group>
      {ZONES.map((z) => (
        <Building key={z.id} z={z} />
      ))}
      <RouterTower />
    </group>
  );
}
