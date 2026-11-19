import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PATH_W, PLAZA_R, beachMask, distToPath, heightAt, nearestBuildingDistance, noise, obstacles, rand, shoreR } from './ground';
import { timeUniform } from './shared';

/** A soft, organic blob: smooth sphere with a little noise so it doesn't look computer-perfect. */
function blob(radius: number, seed: number, detail = 2, wobble = 0.16) {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(radius, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = noise(v.x * 1.7 + seed * 3.1, v.z * 1.7 + v.y * 1.3 - seed);
    v.multiplyScalar(1 + (n - 0.5) * wobble * 2);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

function cluster(parts: [number, number, number, number][], seed: number, flatten = 1) {
  const geos = parts.map(([x, y, z, r], i) => {
    const b = blob(r, seed + i);
    b.scale(1, flatten, 1);
    b.translate(x, y, z);
    return b;
  });
  return mergeGeometries(geos)!;
}

function trunk(h: number, r0: number, r1: number, lean = 0) {
  const g = new THREE.CylinderGeometry(r1, r0, h, 10, 4);
  g.translate(0, h / 2, 0);
  if (lean) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) + (p.getY(i) / h) ** 2 * lean);
    g.computeVertexNormals();
  }
  return g;
}

function palmFronds() {
  const leaves: THREE.BufferGeometry[] = [];
  for (let f = 0; f < 9; f++) {
    const pos: number[] = [];
    const idx: number[] = [];
    const steps = 10;
    const len = 2.7;
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const w = 0.36 * Math.sin(Math.PI * Math.min(1, t * 1.15)) + 0.02;
      const z = t * len;
      const y = -t * t * 1.25 + t * 0.35;
      pos.push(-w, y - w * 0.25, z, 0, y, z, w, y - w * 0.25, z);
      if (k < steps) {
        const a = k * 3;
        idx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    g.rotateX(-0.25 - (f % 3) * 0.12);
    g.rotateY((f / 9) * Math.PI * 2 + (f % 2) * 0.2);
    leaves.push(g);
  }
  const crown = new THREE.SphereGeometry(0.22, 10, 8);
  crown.deleteAttribute('uv');
  const m = mergeGeometries([...leaves.map((l) => l.toNonIndexed()), crown.toNonIndexed()])!;
  return m;
}

/** Wind sway for foliage: the higher the vertex, the more it moves. */
function windy(mat: THREE.MeshStandardMaterial, strength: number) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = timeUniform;
    shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      vec4 root = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      float sway = sin(uTime * 1.1 + root.x * 0.4 + root.z * 0.3) * 0.7 + sin(uTime * 2.3 + root.z) * 0.3;
      transformed.x += sway * max(position.y, 0.0) * ${strength.toFixed(3)};
      transformed.z += sway * max(position.y, 0.0) * ${(strength * 0.5).toFixed(3)};`,
    );
  };
  return mat;
}

interface Placement {
  x: number;
  z: number;
  y: number;
  s: number;
  rot: number;
  tint: THREE.Color;
}

function scatter(count: number, salt: number, accept: (x: number, z: number, r: number) => boolean, minGap: number, taken: { x: number; z: number }[]): Placement[] {
  const out: Placement[] = [];
  for (let i = 0; out.length < count && i < count * 60; i++) {
    const a = rand(i, salt) * Math.PI * 2;
    const r = 8 + Math.sqrt(rand(i, salt + 1)) * 34;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (!accept(x, z, r)) continue;
    if (taken.some((t) => Math.hypot(t.x - x, t.z - z) < minGap)) continue;
    taken.push({ x, z });
    out.push({ x, z, y: heightAt(x, z), s: 0.8 + rand(i, salt + 2) * 0.5, rot: rand(i, salt + 3) * Math.PI * 2, tint: new THREE.Color().setHSL(0.24 + rand(i, salt + 4) * 0.08, 0.45 + rand(i, salt + 5) * 0.2, 0.3 + rand(i, salt + 6) * 0.1) });
  }
  return out;
}

function Instances({ geo, mat, items, shadows, yOffset = 0, tint = true }: { geo: THREE.BufferGeometry; mat: THREE.Material; items: Placement[]; shadows: boolean; yOffset?: number; tint?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current!;
    const o = new THREE.Object3D();
    items.forEach((p, i) => {
      o.position.set(p.x, p.y + yOffset, p.z);
      o.rotation.set(0, p.rot, 0);
      o.scale.setScalar(p.s);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      if (tint) m.setColorAt(i, p.tint);
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [items, yOffset, tint]);
  return <instancedMesh ref={ref} args={[geo, mat, items.length]} castShadow={shadows} receiveShadow={shadows} />;
}

export function Nature({ shadows }: { shadows: boolean }) {
  const data = useMemo(() => {
    const taken: { x: number; z: number }[] = [];
    const clear = (x: number, z: number, r: number, path = 1.6, bld = 2.2) => r > PLAZA_R + 3 && distToPath(x, z) > PATH_W / 2 + path && nearestBuildingDistance(x, z) > bld;
    const lawn = (x: number, z: number, r: number) => clear(x, z, r) && beachMask(x, z) < 0.15;
    const round = scatter(46, 10, lawn, 3.2, taken);
    const acacia = scatter(16, 20, (x, z, r) => lawn(x, z, r) && r > 20, 5, taken);
    const palms = scatter(
      22,
      30,
      (x, z, r) => {
        const m = beachMask(x, z);
        return clear(x, z, r, 1, 1.5) && m > 0.25 && m < 0.75 && r < shoreR(Math.atan2(z, x)) - 3;
      },
      2.6,
      taken,
    );
    const bushes = scatter(70, 40, (x, z, r) => clear(x, z, r, 0.9, 1.1) && beachMask(x, z) < 0.3, 1.4, taken);
    const rocks = scatter(26, 50, (x, z, r) => clear(x, z, r, 1, 1.5) && r > 24, 1.6, taken);
    obstacles.length = 0;
    for (const t of round) obstacles.push({ x: t.x, z: t.z, r: 0.45 * t.s });
    for (const t of acacia) obstacles.push({ x: t.x, z: t.z, r: 0.45 * t.s });
    for (const t of palms) obstacles.push({ x: t.x, z: t.z, r: 0.35 * t.s });
    for (const t of rocks) obstacles.push({ x: t.x, z: t.z, r: 0.7 * t.s });
    palms.forEach((p, i) => p.tint.setHSL(0.26, 0.5, 0.32 + rand(i, 77) * 0.06));
    acacia.forEach((p, i) => p.tint.setHSL(0.2 + rand(i, 78) * 0.03, 0.45, 0.33));
    rocks.forEach((p, i) => p.tint.setHSL(0.08, 0.06, 0.48 + rand(i, 79) * 0.12));
    bushes.forEach((p) => (p.s *= 0.8));
    return { round, acacia, palms, bushes, rocks };
  }, []);

  const geo = useMemo(
    () => ({
      roundTrunk: trunk(2.4, 0.2, 0.12),
      roundCanopy: cluster([[0, 3.1, 0, 1.25], [0.75, 2.75, 0.2, 0.9], [-0.7, 2.8, -0.25, 0.95], [0.1, 3.75, -0.1, 0.85], [-0.2, 2.6, 0.7, 0.8]], 1),
      acaciaTrunk: mergeGeometries([trunk(2.6, 0.18, 0.1, 0.4), trunk(1.4, 0.1, 0.06, 0).rotateZ(0.7).translate(0.3, 2.0, 0), trunk(1.4, 0.1, 0.06, 0).rotateZ(-0.75).translate(0.35, 2.0, 0)])!,
      acaciaCanopy: cluster([[0.35, 3.2, 0, 1.5], [1.6, 3.05, 0.3, 1.1], [-0.9, 3.0, -0.2, 1.2], [0.4, 3.1, 1.2, 1.0], [0.3, 3.05, -1.2, 1.05]], 2, 0.32),
      palmTrunk: (() => {
        const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.25, 1.6, 0), new THREE.Vector3(0.75, 3.1, 0), new THREE.Vector3(1.3, 4.3, 0)]);
        const t = new THREE.TubeGeometry(curve, 16, 0.16, 8, false);
        return t;
      })(),
      palmTop: palmFronds().translate(1.3, 4.3, 0),
      bush: cluster([[0, 0.45, 0, 0.6], [0.5, 0.35, 0.2, 0.45], [-0.45, 0.35, -0.1, 0.5]], 3),
      rock: (() => {
        const g = new THREE.IcosahedronGeometry(0.75, 1);
        const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const n = noise(p.getX(i) * 2.3 + 5, p.getZ(i) * 2.3 + p.getY(i));
          p.setXYZ(i, p.getX(i) * (0.8 + n * 0.5), p.getY(i) * (0.55 + n * 0.3), p.getZ(i) * (0.8 + n * 0.4));
        }
        g.computeVertexNormals();
        return g;
      })(),
    }),
    [],
  );

  const mats = useMemo(
    () => ({
      bark: new THREE.MeshStandardMaterial({ color: '#6b4c33', roughness: 0.95 }),
      palmBark: new THREE.MeshStandardMaterial({ color: '#9a7b58', roughness: 0.9 }),
      leaves: windy(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85 }), 0.018),
      fronds: windy(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.75, side: THREE.DoubleSide }), 0.03),
      bush: windy(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 }), 0.03),
      rock: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, flatShading: true }),
    }),
    [],
  );

  return (
    <group>
      <Instances geo={geo.roundTrunk} mat={mats.bark} items={data.round} shadows={shadows} tint={false} />
      <Instances geo={geo.roundCanopy} mat={mats.leaves} items={data.round} shadows={shadows} />
      <Instances geo={geo.acaciaTrunk} mat={mats.bark} items={data.acacia} shadows={shadows} tint={false} />
      <Instances geo={geo.acaciaCanopy} mat={mats.leaves} items={data.acacia} shadows={shadows} />
      <Instances geo={geo.palmTrunk} mat={mats.palmBark} items={data.palms} shadows={shadows} tint={false} />
      <Instances geo={geo.palmTop} mat={mats.fronds} items={data.palms} shadows={shadows} />
      <Instances geo={geo.bush} mat={mats.bush} items={data.bushes} shadows={shadows} yOffset={-0.08} />
      <Instances geo={geo.rock} mat={mats.rock} items={data.rocks} shadows={shadows} yOffset={-0.15} />
    </group>
  );
}

/** Big soft cumulus clouds drifting far above the island. */
export function Clouds({ night }: { night: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const { geo, items } = useMemo(() => {
    const g = cluster([[0, 0, 0, 5], [5.5, -0.8, 1, 3.8], [-5, -1, -0.5, 4], [2, 2.6, -0.5, 3.6], [-2.5, 2, 1, 3.2], [8.5, -1.6, 0, 2.6], [-8.2, -1.8, 0.4, 2.4]], 9, 0.62);
    const items = Array.from({ length: 11 }, (_, i) => {
      const a = (i / 11) * Math.PI * 2 + rand(i, 90) * 0.4;
      const r = 120 + rand(i, 91) * 110;
      return { x: Math.cos(a) * r, z: Math.sin(a) * r, y: 55 + rand(i, 92) * 30, s: 1 + rand(i, 93) * 1.2, rot: rand(i, 94) * Math.PI };
    });
    return { geo: g, items };
  }, []);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.003;
  });
  return (
    <group ref={ref}>
      {items.map((c, i) => (
        <mesh key={i} geometry={geo} position={[c.x, c.y, c.z]} scale={[c.s * 1.5, c.s, c.s]} rotation-y={c.rot}>
          <meshStandardMaterial color={night ? '#3a4566' : '#ffffff'} emissive={night ? '#0b1020' : '#dfe8f5'} emissiveIntensity={night ? 0.4 : 0.35} roughness={1} fog={false} />
        </mesh>
      ))}
    </group>
  );
}
