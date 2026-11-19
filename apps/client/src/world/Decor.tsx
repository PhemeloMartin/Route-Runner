import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { WorldLabel } from './WorldLabel';
import * as THREE from 'three';
import { ZONES, doorOf } from './zones';
import { api } from '../api';

/** Network cables from the core router to every building, with data packets flowing along them. */
export function NetworkCables() {
  const curves = useMemo(
    () =>
      ZONES.map((z) => {
        const [dx, dz] = doorOf(z);
        const start = new THREE.Vector3(0, 2.2, 0);
        const end = new THREE.Vector3(dx, z.size[1] + 0.3, dz);
        const mid = start.clone().lerp(end, 0.5).add(new THREE.Vector3(0, 4, 0));
        return { curve: new THREE.QuadraticBezierCurve3(start, mid, end), color: z.color };
      }),
    [],
  );
  return (
    <group>
      {curves.map((c, i) => (
        <group key={i}>
          <mesh>
            <tubeGeometry args={[c.curve, 32, 0.07, 6, false]} />
            <meshLambertMaterial color={c.color} />
          </mesh>
          <Packets curve={c.curve} color={c.color} seed={i} />
        </group>
      ))}
    </group>
  );
}

function Packets({ curve, color, seed }: { curve: THREE.Curve<THREE.Vector3>; color: string; seed: number }) {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  useFrame(({ clock }) => {
    refs.current.forEach((m, k) => {
      if (!m) return;
      const t = (clock.elapsedTime * 0.18 + seed * 0.37 + k / 3) % 1;
      const dir = k % 2 === 0 ? t : 1 - t; // packets travel both ways (request + reply)
      m.position.copy(curve.getPoint(dir));
    });
  });
  return (
    <>
      {[0, 1, 2].map((k) => (
        <mesh key={k} ref={(el) => (refs.current[k] = el)}>
          <boxGeometry args={[0.28, 0.28, 0.28]} />
          <meshBasicMaterial color={k % 2 ? '#fde68a' : color} />
        </mesh>
      ))}
    </>
  );
}

/** Real EUR/USD weekly candles (ECB data) as 3D pillars beside the Trading Floor. */
export function ForexCandles() {
  const [candles, setCandles] = useState<{ open: number; high: number; low: number; close: number; time: number }[]>([]);
  useEffect(() => {
    api.candles('EURUSD', 'W', 26).then((r) => setCandles(r.candles)).catch(() => undefined);
  }, []);
  if (!candles.length) return null;
  const lo = Math.min(...candles.map((c) => c.low));
  const hi = Math.max(...candles.map((c) => c.high));
  const scale = 7 / (hi - lo || 1);
  const trading = ZONES.find((z) => z.id === 'trading')!;
  const last = candles[candles.length - 1];
  return (
    <group position={[trading.pos[0] - 13, 0.2, trading.pos[1] + 4]} rotation-y={0.35}>
      {candles.map((c, i) => {
        const up = c.close >= c.open;
        const bodyLo = (Math.min(c.open, c.close) - lo) * scale;
        const bodyH = Math.max(0.08, Math.abs(c.close - c.open) * scale);
        return (
          <group key={c.time} position={[i * 0.5, 0, 0]}>
            <mesh position={[0, ((c.high + c.low) / 2 - lo) * scale + 0.3, 0]}>
              <boxGeometry args={[0.06, Math.max(0.05, (c.high - c.low) * scale), 0.06]} />
              <meshBasicMaterial color="#cbd5e1" />
            </mesh>
            <mesh position={[0, bodyLo + bodyH / 2 + 0.3, 0]} castShadow>
              <boxGeometry args={[0.34, bodyH, 0.34]} />
              <meshLambertMaterial color={up ? '#22c55e' : '#ef4444'} emissive={up ? '#14532d' : '#7f1d1d'} />
            </mesh>
          </group>
        );
      })}
      <WorldLabel position={[candles.length * 0.25, 8.3, 0]} size={24}>
        <div className="label3d">
          EUR/USD weekly · real ECB data
          <small>
            last close {last.close.toFixed(4)} ({new Date(last.time * 1000).toISOString().slice(0, 10)})
          </small>
        </div>
      </WorldLabel>
    </group>
  );
}

export function SkyClouds() {
  const ref = useRef<THREE.Group>(null);
  const clouds = useMemo(() => Array.from({ length: 14 }, (_, i) => ({ x: Math.cos(i * 1.9) * (40 + (i % 4) * 12), z: Math.sin(i * 1.9) * (40 + (i % 3) * 14), y: 22 + (i % 5) * 2, s: 2 + (i % 3) })), []);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.004;
  });
  return (
    <group ref={ref}>
      {clouds.map((c, i) => (
        <mesh key={i} position={[c.x, c.y, c.z]}>
          <boxGeometry args={[c.s * 3, c.s * 0.8, c.s * 2]} />
          <meshLambertMaterial color="#ffffff" transparent opacity={0.92} />
        </mesh>
      ))}
    </group>
  );
}
