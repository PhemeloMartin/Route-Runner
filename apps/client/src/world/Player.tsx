import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { WorldLabel } from './WorldLabel';
import * as THREE from 'three';
import { useGame } from '../store';
import { api } from '../api';
import { ISLAND_RADIUS, ZONES, doorOf } from './zones';

const keys = new Set<string>();
const typing = () => {
  const t = document.activeElement as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
};

/** Third-person controller + blocky Phemelo avatar + follow camera. */
export function Player() {
  const group = useRef<THREE.Group>(null);
  const body = useRef<{ legL: THREE.Mesh | null; legR: THREE.Mesh | null; armL: THREE.Mesh | null; armR: THREE.Mesh | null }>({ legL: null, legR: null, armL: null, armR: null });
  const state = useRef({ pos: new THREE.Vector3(0, 0, 8), vel: new THREE.Vector3(), vy: 0, heading: Math.PI, yaw: 0, pitch: 0.42, dist: 11, walk: 0, lastSave: 0, moved: false, loaded: false });
  const { camera, gl } = useThree();
  const profile = useGame((s) => s.profile);
  const started = useGame((s) => s.started);
  const avatar = profile?.avatar ?? {};

  // restore saved position ("continue where you left off")
  useEffect(() => {
    api
      .world()
      .then((w) => {
        if (w) {
          state.current.pos.set(w.x, 0, w.z);
          state.current.heading = w.heading;
          state.current.yaw = w.heading + Math.PI;
        }
        state.current.loaded = true;
      })
      .catch(() => (state.current.loaded = true));
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (typing()) return;
      keys.add(e.key.toLowerCase());
      if (e.key.toLowerCase() === 'e' && !useGame.getState().panel) {
        const z = ZONES.find((x) => x.id === useGame.getState().nearZone);
        if (z) {
          useGame.getState().open(z.panel);
          const s = state.current;
          void api.saveWorld({ x: s.pos.x, y: 0, z: s.pos.z, heading: s.heading, lastZone: z.id }).catch(() => undefined);
        }
      }
    };
    const up = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    const blur = () => keys.clear();
    let dragging = false;
    let lx = 0;
    let ly = 0;
    const el = gl.domElement;
    const pd = (e: PointerEvent) => {
      dragging = true;
      lx = e.clientX;
      ly = e.clientY;
    };
    const pm = (e: PointerEvent) => {
      if (!dragging) return;
      state.current.yaw -= (e.clientX - lx) * 0.006;
      state.current.pitch = Math.max(0.08, Math.min(1.2, state.current.pitch + (e.clientY - ly) * 0.004));
      lx = e.clientX;
      ly = e.clientY;
    };
    const pu = () => (dragging = false);
    const wheel = (e: WheelEvent) => {
      state.current.dist = Math.max(4, Math.min(28, state.current.dist + e.deltaY * 0.01));
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    el.addEventListener('pointerdown', pd);
    window.addEventListener('pointermove', pm);
    window.addEventListener('pointerup', pu);
    el.addEventListener('wheel', wheel, { passive: true });
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      el.removeEventListener('pointerdown', pd);
      window.removeEventListener('pointermove', pm);
      window.removeEventListener('pointerup', pu);
      el.removeEventListener('wheel', wheel);
    };
  }, [gl]);

  useFrame(({ clock }, dt) => {
    const s = state.current;
    dt = Math.min(dt, 0.05);
    const panelOpen = !!useGame.getState().panel;
    if (!started) {
      // title screen: slow cinematic orbit
      const t = clock.elapsedTime * 0.06;
      camera.position.set(Math.cos(t) * 42, 22, Math.sin(t) * 42);
      camera.lookAt(0, 2, 0);
      if (group.current) group.current.position.copy(s.pos);
      return;
    }
    // movement relative to camera yaw
    const input = new THREE.Vector3();
    if (!panelOpen && !typing()) {
      if (keys.has('w') || keys.has('arrowup')) input.z -= 1;
      if (keys.has('s') || keys.has('arrowdown')) input.z += 1;
      if (keys.has('a') || keys.has('arrowleft')) input.x -= 1;
      if (keys.has('d') || keys.has('arrowright')) input.x += 1;
    }
    const running = keys.has('shift');
    const speed = running ? 11 : 6;
    if (input.lengthSq() > 0) {
      input.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), s.yaw);
      const next = s.pos.clone().addScaledVector(input, speed * dt);
      // collide with buildings (AABB in each building's own rotated frame, approximated by radius)
      for (const z of ZONES) {
        const r = Math.max(z.size[0], z.size[2]) / 2 + 0.7;
        const dx = next.x - z.pos[0];
        const dz = next.z - z.pos[1];
        const dd = Math.hypot(dx, dz);
        if (dd < r) next.set(z.pos[0] + (dx / dd) * r, next.y, z.pos[1] + (dz / dd) * r);
      }
      if (Math.hypot(next.x, next.z) < 3.1) {
        const dd = Math.hypot(next.x, next.z) || 1;
        next.set((next.x / dd) * 3.1, next.y, (next.z / dd) * 3.1);
      }
      const rr = Math.hypot(next.x, next.z);
      if (rr > ISLAND_RADIUS - 2) next.multiplyScalar((ISLAND_RADIUS - 2) / rr);
      s.pos.x = next.x;
      s.pos.z = next.z;
      const target = Math.atan2(input.x, input.z);
      let diff = target - s.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      s.heading += diff * Math.min(1, dt * 12);
      s.walk += dt * (running ? 14 : 9);
      s.moved = true;
    } else s.walk *= 0.85;
    // jump & gravity
    if (keys.has(' ') && s.pos.y <= 0.001 && !panelOpen) s.vy = 7;
    s.vy -= 22 * dt;
    s.pos.y = Math.max(0, s.pos.y + s.vy * dt);
    if (s.pos.y === 0) s.vy = Math.max(0, s.vy);

    if (group.current) {
      group.current.position.copy(s.pos);
      group.current.rotation.y = s.heading;
    }
    const swing = Math.sin(s.walk) * 0.7 * Math.min(1, input.lengthSq());
    const b = body.current;
    if (b.legL) b.legL.rotation.x = swing;
    if (b.legR) b.legR.rotation.x = -swing;
    if (b.armL) b.armL.rotation.x = -swing;
    if (b.armR) b.armR.rotation.x = swing;

    // camera follow
    const target = s.pos.clone().add(new THREE.Vector3(0, 1.8, 0));
    const offset = new THREE.Vector3(Math.sin(s.yaw) * Math.cos(s.pitch), Math.sin(s.pitch), Math.cos(s.yaw) * Math.cos(s.pitch)).multiplyScalar(s.dist);
    camera.position.lerp(target.clone().add(offset), Math.min(1, dt * 8));
    camera.lookAt(target);

    // nearest door
    let near: string | null = null;
    for (const z of ZONES) {
      const [dx, dz] = doorOf(z);
      if (Math.hypot(s.pos.x - dx, s.pos.z - dz) < 3.2) near = z.id;
    }
    useGame.getState().setNearZone(near);

    // autosave position every 5 s after moving
    if (s.moved && clock.elapsedTime - s.lastSave > 5 && s.loaded) {
      s.lastSave = clock.elapsedTime;
      s.moved = false;
      void api.saveWorld({ x: s.pos.x, y: 0, z: s.pos.z, heading: s.heading, lastZone: near }).catch(() => undefined);
    }
  });

  const c = (k: string, d: string) => avatar[k] ?? d;
  return (
    <group ref={group}>
      {/* legs */}
      <group position={[-0.2, 0.9, 0]}>
        <mesh ref={(m) => (body.current.legL = m)} position={[0, 0, 0]} castShadow>
          <boxGeometry args={[0.32, 0.9, 0.32]} />
          <meshLambertMaterial color={c('pants', '#1f2937')} />
        </mesh>
      </group>
      <group position={[0.2, 0.9, 0]}>
        <mesh ref={(m) => (body.current.legR = m)} castShadow>
          <boxGeometry args={[0.32, 0.9, 0.32]} />
          <meshLambertMaterial color={c('pants', '#1f2937')} />
        </mesh>
      </group>
      {/* torso */}
      <mesh position={[0, 1.75, 0]} castShadow>
        <boxGeometry args={[0.8, 0.9, 0.42]} />
        <meshLambertMaterial color={c('shirt', '#2563eb')} />
      </mesh>
      {/* lanyard badge */}
      <mesh position={[0, 1.6, 0.22]}>
        <boxGeometry args={[0.18, 0.24, 0.02]} />
        <meshBasicMaterial color="#f59e0b" />
      </mesh>
      {/* arms */}
      <group position={[-0.55, 2.1, 0]}>
        <mesh ref={(m) => (body.current.armL = m)} position={[0, -0.35, 0]} castShadow>
          <boxGeometry args={[0.26, 0.8, 0.28]} />
          <meshLambertMaterial color={c('skin', '#8d5524')} />
        </mesh>
      </group>
      <group position={[0.55, 2.1, 0]}>
        <mesh ref={(m) => (body.current.armR = m)} position={[0, -0.35, 0]} castShadow>
          <boxGeometry args={[0.26, 0.8, 0.28]} />
          <meshLambertMaterial color={c('skin', '#8d5524')} />
        </mesh>
      </group>
      {/* head */}
      <mesh position={[0, 2.55, 0]} castShadow>
        <boxGeometry args={[0.62, 0.62, 0.62]} />
        <meshLambertMaterial color={c('skin', '#8d5524')} />
      </mesh>
      <mesh position={[0, 2.9, -0.02]}>
        <boxGeometry args={[0.66, 0.16, 0.66]} />
        <meshLambertMaterial color={c('hair', '#1a1a1a')} />
      </mesh>
      {/* eyes */}
      {[-0.13, 0.13].map((x) => (
        <mesh key={x} position={[x, 2.6, 0.315]}>
          <boxGeometry args={[0.1, 0.1, 0.02]} />
          <meshBasicMaterial color="#0b0b0b" />
        </mesh>
      ))}
      {/* shoes */}
      {[-0.2, 0.2].map((x) => (
        <mesh key={x} position={[x, 0.06, 0.04]}>
          <boxGeometry args={[0.34, 0.12, 0.42]} />
          <meshLambertMaterial color={c('shoes', '#f5f5f5')} />
        </mesh>
      ))}
      {started && (
        <WorldLabel position={[0, 3.45, 0]} size={12} near={1}>
          <div className="label3d" style={{ fontSize: 12 }}>
            {profile?.name ?? 'Phemelo'} · Lv {profile?.overall.level ?? 1}
          </div>
        </WorldLabel>
      )}
    </group>
  );
}
