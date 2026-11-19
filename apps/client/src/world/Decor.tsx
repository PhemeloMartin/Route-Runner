import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WorldLabel } from './WorldLabel';
import { ZONES } from './zones';
import { PATHS, PATH_W, PLAZA_R, fromLocal, heightAt, nearestBuildingDistance, obstacles, yawOf } from './ground';
import { flagTexture } from './textures';
import { useSun } from './sky';
import { api } from '../api';

const metal = new THREE.MeshStandardMaterial({ color: '#2d3239', roughness: 0.38, metalness: 0.85 });
const wood = new THREE.MeshStandardMaterial({ color: '#a8743f', roughness: 0.65 });
const concrete = new THREE.MeshStandardMaterial({ color: '#d9d5cd', roughness: 0.8 });
const shrub = new THREE.MeshStandardMaterial({ color: '#4a8a36', roughness: 0.9 });
const chrome = new THREE.MeshStandardMaterial({ color: '#d7dbe0', roughness: 0.25, metalness: 0.9 });

/** Gaps between the walkways around the plaza - where benches, lamps and the flag can stand. */
function plazaGaps() {
  const angles = PATHS.map((p) => Math.atan2(p.az, p.ax)).sort((a, b) => a - b);
  const gaps: { mid: number; size: number }[] = [];
  angles.forEach((a, i) => {
    const next = i === angles.length - 1 ? angles[0] + Math.PI * 2 : angles[i + 1];
    gaps.push({ mid: (a + next) / 2, size: next - a });
  });
  return gaps.sort((a, b) => b.size - a.size);
}

interface Lamp {
  x: number;
  z: number;
  y: number;
  yaw: number;
}

function lampSpots(): Lamp[] {
  const out: Lamp[] = [];
  PATHS.forEach((p, pi) => {
    const len = Math.hypot(p.bx - p.ax, p.bz - p.az);
    const ux = (p.bx - p.ax) / len;
    const uz = (p.bz - p.az) / len;
    for (let t = 3, k = pi; t < len - 1.5; t += 6.5, k++) {
      const side = k % 2 ? 1 : -1;
      const x = p.ax + ux * t - uz * side * (PATH_W / 2 + 0.45);
      const z = p.az + uz * t + ux * side * (PATH_W / 2 + 0.45);
      if (nearestBuildingDistance(x, z) < 1.3) continue;
      out.push({ x, z, y: heightAt(x, z), yaw: Math.atan2(uz * side, -ux * side) });
    }
  });
  for (const g of plazaGaps()) {
    const r = PLAZA_R + 0.7;
    if (g.size > 0.35) out.push({ x: Math.cos(g.mid) * r, z: Math.sin(g.mid) * r, y: 0, yaw: Math.atan2(-Math.cos(g.mid), -Math.sin(g.mid)) });
  }
  return out;
}

/** Modern street lamps. At night they glow and throw a pool of warm light on the ground. */
function StreetLamps({ shadows }: { shadows: boolean }) {
  const night = useSun((s) => s.sun.night);
  const lamps = useMemo(lampSpots, []);
  const body = useRef<THREE.InstancedMesh>(null);
  const lens = useRef<THREE.InstancedMesh>(null);
  const pool = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => {
    const pole = new THREE.CylinderGeometry(0.05, 0.07, 3.6, 10).translate(0, 1.8, 0);
    const base = new THREE.CylinderGeometry(0.14, 0.16, 0.25, 12).translate(0, 0.125, 0);
    const arm = new THREE.BoxGeometry(0.06, 0.06, 0.75).translate(0, 3.55, 0.36);
    const head = new THREE.BoxGeometry(0.26, 0.09, 0.56).translate(0, 3.55, 0.82);
    [pole, base].forEach((g) => g.deleteAttribute('uv'));
    [arm, head].forEach((g) => g.deleteAttribute('uv'));
    return {
      body: mergeGeometries([pole.toNonIndexed(), base.toNonIndexed(), arm.toNonIndexed(), head.toNonIndexed()])!,
      lens: new THREE.BoxGeometry(0.2, 0.02, 0.48).translate(0, 3.5, 0.82),
      pool: new THREE.CircleGeometry(2.6, 32).rotateX(-Math.PI / 2),
    };
  }, []);
  const lensMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#fff3d6', emissive: '#ffd9a0', emissiveIntensity: 0.4, toneMapped: false }), []);
  const poolMat = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,214,150,0.55)');
    g.addColorStop(0.5, 'rgba(255,200,130,0.2)');
    g.addColorStop(1, 'rgba(255,190,120,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  }, []);
  useLayoutEffect(() => {
    const o = new THREE.Object3D();
    lamps.forEach((l, i) => {
      o.position.set(l.x, l.y, l.z);
      o.rotation.set(0, l.yaw, 0);
      o.updateMatrix();
      body.current!.setMatrixAt(i, o.matrix);
      lens.current!.setMatrixAt(i, o.matrix);
      // the pool of light lands under the lamp head
      o.position.set(l.x + Math.sin(l.yaw) * 0.82, l.y + 0.09, l.z + Math.cos(l.yaw) * 0.82);
      o.rotation.set(0, 0, 0);
      o.updateMatrix();
      pool.current!.setMatrixAt(i, o.matrix);
    });
    [body, lens, pool].forEach((r) => {
      r.current!.instanceMatrix.needsUpdate = true;
      r.current!.computeBoundingSphere();
    });
    for (const l of lamps) obstacles.push({ x: l.x, z: l.z, r: 0.2 });
  }, [lamps]);
  lensMat.emissiveIntensity = night ? 7 : 0.35;
  return (
    <group>
      <instancedMesh ref={body} args={[geo.body, metal, lamps.length]} castShadow={shadows} />
      <instancedMesh ref={lens} args={[geo.lens, lensMat, lamps.length]} />
      <instancedMesh ref={pool} args={[geo.pool, poolMat, lamps.length]} visible={night} renderOrder={2} />
    </group>
  );
}

function Bench({ x, z, yaw }: { x: number; z: number; yaw: number }) {
  return (
    <group position={[x, heightAt(x, z), z]} rotation-y={yaw}>
      {[-0.13, 0, 0.13].map((dz) => (
        <mesh key={dz} position={[0, 0.46, dz]} material={wood} castShadow receiveShadow>
          <boxGeometry args={[1.7, 0.05, 0.11]} />
        </mesh>
      ))}
      {[0.62, 0.78].map((y) => (
        <mesh key={y} position={[0, y, -0.24]} rotation-x={-0.12} material={wood} castShadow>
          <boxGeometry args={[1.7, 0.1, 0.04]} />
        </mesh>
      ))}
      {[-0.7, 0.7].map((dx) => (
        <group key={dx} position-x={dx}>
          <mesh position={[0, 0.22, 0]} material={metal} castShadow>
            <boxGeometry args={[0.06, 0.44, 0.42]} />
          </mesh>
          <mesh position={[0, 0.62, -0.25]} rotation-x={-0.12} material={metal}>
            <boxGeometry args={[0.05, 0.42, 0.05]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Planter({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, heightAt(x, z), z]}>
      <mesh position-y={0.3} material={concrete} castShadow receiveShadow>
        <cylinderGeometry args={[0.55, 0.45, 0.6, 28]} />
      </mesh>
      <mesh position-y={0.8} material={shrub} castShadow scale={[1, 0.8, 1]}>
        <sphereGeometry args={[0.55, 20, 14]} />
      </mesh>
    </group>
  );
}

/** South Africa's flag flying over the plaza. */
function Flag({ x, z }: { x: number; z: number }) {
  const cloth = useRef<THREE.Mesh>(null);
  const geo = useMemo(() => new THREE.PlaneGeometry(2.1, 1.4, 24, 12).translate(1.05, 0, 0), []);
  const base = useMemo(() => Float32Array.from(geo.attributes.position.array), [geo]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const bx = base[i * 3];
      const by = base[i * 3 + 1];
      const k = bx / 2.1;
      p.setZ(i, Math.sin(bx * 2.6 - t * 4.2 + by * 0.6) * 0.16 * k + Math.sin(bx * 5 - t * 6.5) * 0.04 * k);
      p.setY(i, by - k * k * 0.06);
    }
    p.needsUpdate = true;
    geo.computeVertexNormals();
  });
  const y = heightAt(x, z);
  return (
    <group position={[x, y, z]}>
      <mesh position-y={0.2} material={concrete} castShadow>
        <cylinderGeometry args={[0.35, 0.42, 0.4, 24]} />
      </mesh>
      <mesh position-y={4.2} material={chrome} castShadow>
        <cylinderGeometry args={[0.05, 0.08, 8, 12]} />
      </mesh>
      <mesh position-y={8.25} material={metal}>
        <sphereGeometry args={[0.1, 12, 8]} />
      </mesh>
      <mesh ref={cloth} geometry={geo} position={[0.06, 7.35, 0]} castShadow>
        <meshStandardMaterial map={flagTexture()} side={THREE.DoubleSide} roughness={0.8} />
      </mesh>
    </group>
  );
}

function PlazaFurniture() {
  const gaps = useMemo(plazaGaps, []);
  const items = useMemo(() => {
    const out: { kind: 'bench' | 'planter'; x: number; z: number; yaw: number }[] = [];
    gaps.slice(1).forEach((g, i) => {
      if (g.size < 0.42) return;
      const r = PLAZA_R + 1.9;
      const x = Math.cos(g.mid) * r;
      const z = Math.sin(g.mid) * r;
      out.push(i % 2 ? { kind: 'planter', x, z, yaw: 0 } : { kind: 'bench', x, z, yaw: Math.atan2(-x, -z) });
    });
    return out;
  }, [gaps]);
  const flag = useMemo(() => {
    const g = gaps[0];
    return { x: Math.cos(g.mid) * (PLAZA_R + 2.6), z: Math.sin(g.mid) * (PLAZA_R + 2.6) };
  }, [gaps]);
  useLayoutEffect(() => {
    for (const it of items) obstacles.push({ x: it.x, z: it.z, r: it.kind === 'bench' ? 0.75 : 0.6 });
    obstacles.push({ x: flag.x, z: flag.z, r: 0.45 });
  }, [items, flag]);
  return (
    <group>
      {items.map((it, i) => (it.kind === 'bench' ? <Bench key={i} x={it.x} z={it.z} yaw={it.yaw} /> : <Planter key={i} x={it.x} z={it.z} />))}
      <Flag x={flag.x} z={flag.z} />
    </group>
  );
}

/** Real EUR/USD weekly candles (ECB data) as a glowing 3D chart beside the Trading Floor. */
export function ForexCandles() {
  const [candles, setCandles] = useState<{ open: number; high: number; low: number; close: number; time: number }[]>([]);
  useEffect(() => {
    api.candles('EURUSD', 'W', 26).then((r) => setCandles(r.candles)).catch(() => undefined);
  }, []);
  const trading = ZONES.find((z) => z.id === 'trading')!;
  const spot = useMemo(() => {
    const [x, z] = fromLocal(trading, trading.size[0] / 2 + 3.4, trading.size[2] / 2 - 0.2);
    return { x, z, y: heightAt(x, z), yaw: yawOf(trading) + Math.PI / 2 };
  }, [trading]);
  useLayoutEffect(() => {
    // the chart is a long row along its local x axis: block it with a line of small circles
    for (let k = -3; k <= 3; k++) obstacles.push({ x: spot.x + Math.cos(spot.yaw) * k, z: spot.z - Math.sin(spot.yaw) * k, r: 0.8 });
  }, [spot]);
  if (!candles.length) return null;
  const lo = Math.min(...candles.map((c) => c.low));
  const hi = Math.max(...candles.map((c) => c.high));
  const scale = 3.6 / (hi - lo || 1);
  const step = 0.27;
  const width = candles.length * step;
  const last = candles[candles.length - 1];
  return (
    <group position={[spot.x, spot.y, spot.z]} rotation-y={spot.yaw}>
      <RoundedBox args={[width + 0.6, 0.35, 1.1]} radius={0.06} smoothness={2} position-y={0.175} material={metal} castShadow receiveShadow />
      <mesh position={[0, 2.35, -0.42]} castShadow>
        <boxGeometry args={[width + 0.6, 4.0, 0.08]} />
        <meshPhysicalMaterial color="#0b1220" roughness={0.1} metalness={0.5} clearcoat={1} />
      </mesh>
      {candles.map((c, i) => {
        const up = c.close >= c.open;
        const bodyLo = (Math.min(c.open, c.close) - lo) * scale;
        const bodyH = Math.max(0.05, Math.abs(c.close - c.open) * scale);
        const col = up ? '#22c55e' : '#ef4444';
        return (
          <group key={c.time} position={[-width / 2 + (i + 0.5) * step, 0.55, 0]}>
            <mesh position={[0, ((c.high + c.low) / 2 - lo) * scale, 0]}>
              <boxGeometry args={[0.025, Math.max(0.04, (c.high - c.low) * scale), 0.025]} />
              <meshBasicMaterial color="#cbd5e1" />
            </mesh>
            <mesh position={[0, bodyLo + bodyH / 2, 0]} castShadow>
              <boxGeometry args={[0.17, bodyH, 0.17]} />
              <meshStandardMaterial color={col} emissive={col} emissiveIntensity={1.3} toneMapped={false} />
            </mesh>
          </group>
        );
      })}
      <WorldLabel position={[0, 5, 0]} size={24} title="📈  EUR/USD weekly · real ECB data" subtitle={`last close ${last.close.toFixed(4)} (${new Date(last.time * 1000).toISOString().slice(0, 10)})`} accent="#22c55e" />
    </group>
  );
}

export function Decor({ shadows }: { shadows: boolean }) {
  return (
    <group>
      <StreetLamps shadows={shadows} />
      <PlazaFurniture />
      <ForexCandles />
    </group>
  );
}
