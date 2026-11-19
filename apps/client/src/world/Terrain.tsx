import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { ISLAND_RADIUS, ZONES, doorOf } from './zones';

function hash(x: number, z: number) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Voxel island: grass top, sand rim, dirt below - all instanced for speed. */
export function Terrain() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const cells = useMemo(() => {
    const out: { x: number; z: number; y: number; color: THREE.Color }[] = [];
    const grass = [new THREE.Color('#4ade80'), new THREE.Color('#22c55e'), new THREE.Color('#3fbf6a'), new THREE.Color('#34d058')];
    const sand = new THREE.Color('#e8d18f');
    for (let x = -ISLAND_RADIUS; x <= ISLAND_RADIUS; x++)
      for (let z = -ISLAND_RADIUS; z <= ISLAND_RADIUS; z++) {
        const r = Math.hypot(x, z) + hash(x, z) * 2;
        if (r > ISLAND_RADIUS) continue;
        const rim = r > ISLAND_RADIUS - 3;
        const hill = r > 27 && !rim && hash(z, x) > 0.82 ? 1 : 0;
        out.push({ x, z, y: rim ? -0.25 : hill * 0.5, color: rim ? sand : grass[Math.floor(hash(x * 3, z * 7) * grass.length)].clone().multiplyScalar(0.92 + hash(x, z) * 0.12) });
      }
    return out;
  }, []);

  useLayoutEffect(() => {
    const m = ref.current!;
    const o = new THREE.Object3D();
    cells.forEach((c, i) => {
      o.position.set(c.x, c.y - 0.5, c.z);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, c.color);
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [cells]);

  return (
    <group>
      <instancedMesh ref={ref} args={[undefined, undefined, cells.length]} receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshLambertMaterial />
      </instancedMesh>
      {/* dirt underside */}
      <mesh position={[0, -2.2, 0]}>
        <cylinderGeometry args={[ISLAND_RADIUS - 1, ISLAND_RADIUS - 8, 3, 32]} />
        <meshLambertMaterial color="#7c5a3c" />
      </mesh>
      <Water />
      <Paths />
    </group>
  );
}

function Water() {
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, -0.75, 0]}>
      <circleGeometry args={[220, 64]} />
      <meshPhongMaterial color="#1e6fb8" transparent opacity={0.9} shininess={80} />
    </mesh>
  );
}

/** Stone paths from the plaza to every door. */
function Paths() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const tiles = useMemo(() => {
    const set = new Map<string, [number, number]>();
    for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) if (Math.hypot(x, z) <= 4.6) set.set(`${x},${z}`, [x, z]);
    for (const zn of ZONES) {
      const [dx, dz] = doorOf(zn);
      const steps = Math.ceil(Math.hypot(dx, dz));
      for (let s = 0; s <= steps; s++) {
        const x = Math.round((dx * s) / steps);
        const z = Math.round((dz * s) / steps);
        set.set(`${x},${z}`, [x, z]);
        set.set(`${x + 1},${z}`, [x + 1, z]);
      }
    }
    return [...set.values()];
  }, []);
  useLayoutEffect(() => {
    const m = ref.current!;
    const o = new THREE.Object3D();
    const c = new THREE.Color();
    tiles.forEach(([x, z], i) => {
      o.position.set(x, 0.01, z);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      c.set(hash(x, z) > 0.5 ? '#9ca3af' : '#a8b0bc');
      m.setColorAt(i, c);
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [tiles]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, tiles.length]} receiveShadow>
      <boxGeometry args={[1, 0.04, 1]} />
      <meshLambertMaterial />
    </instancedMesh>
  );
}

/** Voxel trees scattered away from buildings and paths. */
export function Trees() {
  const trunks = useRef<THREE.InstancedMesh>(null);
  const leaves = useRef<THREE.InstancedMesh>(null);
  const spots = useMemo(() => {
    const out: [number, number, number][] = [];
    for (let i = 0; i < 400 && out.length < 70; i++) {
      const a = hash(i, 7) * Math.PI * 2;
      const r = 8 + hash(7, i) * 22;
      const x = Math.round(Math.cos(a) * r);
      const z = Math.round(Math.sin(a) * r);
      const nearBuilding = ZONES.some((zn) => Math.hypot(zn.pos[0] - x, zn.pos[1] - z) < Math.max(zn.size[0], zn.size[2]) / 2 + 3.5);
      const nearPath = ZONES.some((zn) => {
        const [dx, dz] = doorOf(zn);
        const t = Math.max(0, Math.min(1, (x * dx + z * dz) / (dx * dx + dz * dz)));
        return Math.hypot(x - dx * t, z - dz * t) < 2.2;
      });
      if (!nearBuilding && !nearPath && Math.hypot(x, z) > 6) out.push([x, z, 2 + Math.floor(hash(x, z) * 2)]);
    }
    return out;
  }, []);
  useLayoutEffect(() => {
    const o = new THREE.Object3D();
    let li = 0;
    const c = new THREE.Color();
    spots.forEach(([x, z, h], i) => {
      o.position.set(x, h / 2, z);
      o.scale.set(0.5, h, 0.5);
      o.updateMatrix();
      trunks.current!.setMatrixAt(i, o.matrix);
      for (const [ox, oy, oz, s] of [
        [0, h + 0.6, 0, 1.9],
        [0, h + 1.6, 0, 1.2],
      ]) {
        o.position.set(x + ox, oy, z + oz);
        o.scale.set(s, 1, s);
        o.updateMatrix();
        leaves.current!.setMatrixAt(li, o.matrix);
        c.set(hash(x, z + li) > 0.5 ? '#15803d' : '#166534');
        leaves.current!.setColorAt(li, c);
        li++;
      }
    });
    trunks.current!.instanceMatrix.needsUpdate = true;
    leaves.current!.instanceMatrix.needsUpdate = true;
    if (leaves.current!.instanceColor) leaves.current!.instanceColor.needsUpdate = true;
  }, [spots]);
  return (
    <group>
      <instancedMesh ref={trunks} args={[undefined, undefined, spots.length]} castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshLambertMaterial color="#7c4a1e" />
      </instancedMesh>
      <instancedMesh ref={leaves} args={[undefined, undefined, spots.length * 2]} castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshLambertMaterial />
      </instancedMesh>
    </group>
  );
}

export const TREE_HASH = hash;
