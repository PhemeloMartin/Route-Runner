import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PATHS, PATH_W, PLAZA_R, WATER_Y, beachMask, distToPath, fbm, heightAt, nearestBuildingDistance, rand, shoreR, smoothstep } from './ground';
import { detailTexture, pavingTexture, plazaTexture, waterNormals } from './textures';
import { timeUniform } from './shared';
import { useSun } from './sky';

/** Smooth island: rolling lawns, hills at the edge, a sandy beach and a clear shallow sea. */
export function Terrain({ grass, shadows }: { grass: number; shadows: boolean }) {
  return (
    <group>
      <Ground shadows={shadows} />
      <Water />
      <Foam />
      <Plaza />
      <Walkways />
      {grass > 0 && <Grass count={grass} />}
    </group>
  );
}

function Ground({ shadows }: { shadows: boolean }) {
  const geo = useMemo(() => {
    const size = 112;
    const seg = 224;
    const g = new THREE.PlaneGeometry(size, size, seg, seg);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const lush = new THREE.Color('#5f9c3b');
    const fresh = new THREE.Color('#86b24c');
    const deep = new THREE.Color('#4a8131');
    const sand = new THREE.Color('#ead8a8');
    const wet = new THREE.Color('#c8ad7c');
    const seabed = new THREE.Color('#d9c79a');
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = heightAt(x, z);
      pos.setY(i, y);
      const n = fbm(x * 0.07 + 3, z * 0.07 - 9, 3);
      c.copy(lush).lerp(fresh, smoothstep(0.35, 0.75, n)).lerp(deep, smoothstep(0.55, 0.85, fbm(x * 0.2, z * 0.2, 2)) * 0.5);
      if (y > 0.6) c.lerp(deep, Math.min(0.4, (y - 0.6) * 0.15));
      c.lerp(sand, smoothstep(0.15, 0.6, beachMask(x, z)));
      c.lerp(wet, smoothstep(WATER_Y + 0.35, WATER_Y - 0.05, y));
      c.lerp(seabed, smoothstep(WATER_Y - 0.3, WATER_Y - 2, y) * 0.6);
      colors.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
  }, []);
  const mat = useMemo(() => {
    const detail = detailTexture().clone();
    detail.repeat.set(48, 48);
    detail.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ vertexColors: true, map: detail, roughness: 0.95, metalness: 0 });
  }, []);
  return (
    <group>
      <mesh geometry={geo} material={mat} receiveShadow={shadows} />
      {/* deep seabed beyond the detailed ground so the sea never looks bottomless */}
      <mesh rotation-x={-Math.PI / 2} position-y={-6.2}>
        <circleGeometry args={[700, 48]} />
        <meshStandardMaterial color="#7f7559" roughness={1} />
      </mesh>
    </group>
  );
}

/** Water: turquoise in the shallows, deep blue offshore, two layers of moving ripples. */
function Water() {
  const night = useSun((s) => s.sun.night);
  const { geo, mat, n1, n2 } = useMemo(() => {
    // polar grid with fine rings near the shore so the colour/transparency can follow the depth
    const radii: number[] = [0, 18, 26, 30];
    for (let r = 31; r <= 48; r += 0.6) radii.push(r);
    radii.push(52, 58, 66, 80, 100, 140, 200, 300, 450, 650);
    const segs = 160;
    const positions: number[] = [];
    const colors: number[] = [];
    const uvs: number[] = [];
    const index: number[] = [];
    const shallow = new THREE.Color('#47c4c0');
    const mid = new THREE.Color('#1b8bb0');
    const deep = new THREE.Color('#0c4d78');
    const c = new THREE.Color();
    radii.forEach((r) => {
      for (let s = 0; s <= segs; s++) {
        const a = (s / segs) * Math.PI * 2;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        positions.push(x, 0, z);
        uvs.push(x / 12, z / 12);
        const depth = r > 60 ? 6 : Math.max(0, WATER_Y - heightAt(x, z));
        c.copy(shallow).lerp(mid, smoothstep(0.1, 1.6, depth)).lerp(deep, smoothstep(1.6, 5, depth));
        colors.push(c.r, c.g, c.b, Math.min(0.94, 0.42 + depth * 0.22));
      }
    });
    for (let ri = 0; ri < radii.length - 1; ri++)
      for (let s = 0; s < segs; s++) {
        const a = ri * (segs + 1) + s;
        const b = a + segs + 1;
        index.push(a, b, a + 1, b, b + 1, a + 1);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(index);
    g.computeVertexNormals();
    const n1 = waterNormals().clone();
    const n2 = waterNormals().clone();
    n1.needsUpdate = n2.needsUpdate = true;
    n2.repeat.set(0.6, 0.6);
    const m = new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      transparent: true,
      roughness: 0.08,
      metalness: 0,
      normalMap: n1,
      normalScale: new THREE.Vector2(0.28, 0.28),
      clearcoat: 1,
      clearcoatRoughness: 0.04,
      clearcoatNormalMap: n2,
      clearcoatNormalScale: new THREE.Vector2(0.35, 0.35),
      envMapIntensity: 1.25,
      depthWrite: false,
    });
    return { geo: g, mat: m, n1, n2 };
  }, []);
  useFrame((_, dt) => {
    n1.offset.x += dt * 0.012;
    n1.offset.y += dt * 0.007;
    n2.offset.x -= dt * 0.008;
    n2.offset.y += dt * 0.011;
  });
  mat.envMapIntensity = night ? 0.6 : 1.25;
  return <mesh geometry={geo} material={mat} position-y={WATER_Y} renderOrder={1} />;
}

/** White foam where the waves meet the sand, gently washing in and out. */
function Foam() {
  const ref = useRef<THREE.Mesh>(null);
  const geo = useMemo(() => {
    const segs = 220;
    const positions: number[] = [];
    const colors: number[] = [];
    const index: number[] = [];
    const bands = [
      [-0.45, 0],
      [0, 0.75],
      [0.35, 0.9],
      [1.6, 0],
    ];
    for (let s = 0; s <= segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      // find where the ground meets the water in this direction
      let lo = 25;
      let hi = shoreR(a) + 6;
      for (let k = 0; k < 24; k++) {
        const m = (lo + hi) / 2;
        if (heightAt(Math.cos(a) * m, Math.sin(a) * m) > WATER_Y) lo = m;
        else hi = m;
      }
      for (const [off, alpha] of bands) {
        const r = lo + off;
        positions.push(Math.cos(a) * r, 0, Math.sin(a) * r);
        colors.push(1, 1, 1, alpha);
      }
    }
    for (let s = 0; s < segs; s++)
      for (let b = 0; b < bands.length - 1; b++) {
        const i = s * bands.length + b;
        const j = i + bands.length;
        index.push(i, j, i + 1, j, j + 1, i + 1);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
    g.setIndex(index);
    return g;
  }, []);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime;
    ref.current.scale.setScalar(1 + Math.sin(t * 0.7) * 0.007);
    (ref.current.material as THREE.MeshBasicMaterial).opacity = 0.55 + Math.sin(t * 0.7 + 1) * 0.25;
  });
  return (
    <mesh ref={ref} geometry={geo} position-y={WATER_Y + 0.03} renderOrder={2}>
      <meshBasicMaterial vertexColors transparent depthWrite={false} color="#f4fbff" />
    </mesh>
  );
}

function Plaza() {
  const tex = plazaTexture();
  return (
    <group>
      <mesh position-y={0.04} receiveShadow>
        <cylinderGeometry args={[PLAZA_R, PLAZA_R + 0.08, 0.08, 96]} />
        <meshStandardMaterial map={tex} roughness={0.42} metalness={0.05} />
      </mesh>
      <mesh position-y={0.06} receiveShadow>
        <torusGeometry args={[PLAZA_R, 0.09, 8, 96]} />
        <meshStandardMaterial color="#e8e4dc" roughness={0.6} />
      </mesh>
    </group>
  );
}

/** Paved walkways with a glowing fibre "data line" down the middle - packets flow to each building. */
function Walkways() {
  const night = useSun((s) => s.sun.night);
  const segs = useMemo(
    () =>
      PATHS.map((p) => {
        const len = Math.hypot(p.bx - p.ax, p.bz - p.az);
        const tex = pavingTexture().clone();
        tex.repeat.set(PATH_W / 2, len / 2);
        tex.needsUpdate = true;
        return { p, len, yaw: Math.atan2(p.bx - p.ax, p.bz - p.az), mid: [(p.ax + p.bx) / 2, (p.az + p.bz) / 2] as [number, number], tex };
      }),
    [],
  );
  return (
    <group>
      {segs.map(({ p, len, yaw, mid, tex }) => (
        <group key={p.zone.id} position={[mid[0], 0, mid[1]]} rotation-y={yaw}>
          <mesh position-y={0.035} receiveShadow>
            <boxGeometry args={[PATH_W, 0.07, len]} />
            <meshStandardMaterial map={tex} roughness={0.8} />
          </mesh>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * (PATH_W / 2 + 0.06), 0.06, 0]} receiveShadow castShadow>
              <boxGeometry args={[0.14, 0.12, len]} />
              <meshStandardMaterial color="#e9e6df" roughness={0.7} />
            </mesh>
          ))}
          <mesh position-y={0.072}>
            <boxGeometry args={[0.07, 0.01, len - 0.4]} />
            <meshStandardMaterial color={p.zone.color} emissive={p.zone.color} emissiveIntensity={night ? 6 : 2.4} toneMapped={false} />
          </mesh>
          <Packets len={len} color={p.zone.color} seed={p.zone.id.length} />
        </group>
      ))}
    </group>
  );
}

function Packets({ len, color, seed }: { len: number; color: string; seed: number }) {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  useFrame(({ clock }) => {
    refs.current.forEach((m, k) => {
      if (!m) return;
      const t = (clock.elapsedTime * (3.2 / len) + seed * 0.37 + k / 3) % 1;
      const along = k % 2 === 0 ? t : 1 - t; // requests go out, replies come back
      m.position.z = (along - 0.5) * (len - 0.6);
    });
  });
  return (
    <>
      {[0, 1, 2].map((k) => (
        <mesh key={k} ref={(el) => (refs.current[k] = el)} position-y={0.09} rotation-x={Math.PI / 2}>
          <capsuleGeometry args={[0.05, 0.32, 4, 8]} />
          <meshBasicMaterial color={new THREE.Color(k % 2 ? '#fff4c2' : color).multiplyScalar(4)} toneMapped={false} />
        </mesh>
      ))}
    </>
  );
}

/** Tens of thousands of grass blades swaying in the wind (one draw call). */
function Grass({ count }: { count: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const { geo, mat, matrices, tints } = useMemo(() => {
    const segs = 4;
    const pos: number[] = [];
    const col: number[] = [];
    const nor: number[] = [];
    const idx: number[] = [];
    const base = new THREE.Color('#3d6e25');
    const tip = new THREE.Color('#a9cf62');
    for (let k = 0; k <= segs; k++) {
      const t = k / segs;
      const w = 0.045 * Math.pow(1 - t, 0.9);
      const z = t * t * 0.09;
      const c = base.clone().lerp(tip, t);
      if (k < segs) {
        pos.push(-w, t, z, w, t, z);
        col.push(c.r, c.g, c.b, c.r, c.g, c.b);
        nor.push(0, 1, 0, 0, 1, 0);
      } else {
        pos.push(0, t, z);
        col.push(c.r, c.g, c.b);
        nor.push(0, 1, 0);
      }
    }
    for (let k = 0; k < segs - 1; k++) {
      const a = k * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    idx.push((segs - 1) * 2, (segs - 1) * 2 + 1, segs * 2);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setIndex(idx);
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1 });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = timeUniform;
      shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec4 root = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float gust = sin(uTime * 1.6 + root.x * 0.32 + root.z * 0.21) * 0.6 + sin(uTime * 3.1 + root.x * 1.3 - root.z * 0.7) * 0.25;
        float bend = position.y * position.y;
        transformed.x += gust * bend * 0.22;
        transformed.z += (gust * 0.5 + 0.3) * bend * 0.16;`,
      );
    };
    const matrices: THREE.Matrix4[] = [];
    const tints: THREE.Color[] = [];
    const o = new THREE.Object3D();
    const tint = new THREE.Color();
    for (let i = 0; matrices.length < count && i < count * 4; i++) {
      const a = rand(i, 1) * Math.PI * 2;
      const r = Math.sqrt(rand(i, 2)) * 37;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (r < PLAZA_R + 0.25 || beachMask(x, z) > 0.2 || distToPath(x, z) < PATH_W / 2 + 0.2 || nearestBuildingDistance(x, z) < 0.55) continue;
      o.position.set(x, heightAt(x, z) - 0.02, z);
      o.rotation.set(0, rand(i, 3) * Math.PI * 2, 0);
      const tall = fbm(x * 0.15 + 7, z * 0.15 - 2, 2);
      const s = 0.16 + rand(i, 4) * 0.2 + tall * 0.22;
      o.scale.set(0.8 + rand(i, 6) * 0.5, s, 1);
      o.updateMatrix();
      matrices.push(o.matrix.clone());
      const n = fbm(x * 0.07 + 3, z * 0.07 - 9, 3);
      tints.push(tint.setRGB(0.85 + n * 0.25, 0.92 + n * 0.12, 0.8 + rand(i, 5) * 0.15).clone());
    }
    return { geo: g, mat: m, matrices, tints };
  }, [count]);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    matrices.forEach((m, i) => {
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, tints[i]);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [matrices, tints]);
  return <instancedMesh ref={ref} args={[geo, mat, matrices.length]} receiveShadow frustumCulled={false} />;
}
