import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { WorldLabel } from './WorldLabel';
import { useGame } from '../store';
import { api } from '../api';
import { ZONES, doorOf } from './zones';
import { fromLocal, heightAt, obstacles, toLocal, walkLimit } from './ground';
import { playerPos } from './shared';

const keys = new Set<string>();
const typing = () => {
  const t = document.activeElement as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
};

const ROUTER_R = 3.55;
const BODY_R = 0.32;

/** Keep Phemelo out of walls, trees and the sea. */
function resolve(next: THREE.Vector3) {
  for (const z of ZONES) {
    const [lx, lz] = toLocal(z, next.x, next.z);
    const hx = z.size[0] / 2 + 0.4 + BODY_R;
    const hz = z.size[2] / 2 + 0.4 + BODY_R;
    if (Math.abs(lx) < hx && Math.abs(lz) < hz) {
      // push out through the nearest side
      const px = hx - Math.abs(lx);
      const pz = hz - Math.abs(lz);
      const [nx, nz] = px < pz ? fromLocal(z, Math.sign(lx || 1) * hx, lz) : fromLocal(z, lx, Math.sign(lz || 1) * hz);
      next.x = nx;
      next.z = nz;
    }
  }
  const rc = Math.hypot(next.x, next.z);
  if (rc < ROUTER_R) {
    const k = ROUTER_R / (rc || 1);
    next.x *= k;
    next.z *= k;
  }
  for (const o of obstacles) {
    const dx = next.x - o.x;
    const dz = next.z - o.z;
    const d = Math.hypot(dx, dz);
    const min = o.r + BODY_R;
    if (d < min && d > 1e-4) {
      next.x = o.x + (dx / d) * min;
      next.z = o.z + (dz / d) * min;
    }
  }
  const r = Math.hypot(next.x, next.z);
  const lim = walkLimit(Math.atan2(next.z, next.x));
  if (r > lim) {
    next.x *= lim / r;
    next.z *= lim / r;
  }
}

interface Rig {
  hips: THREE.Group | null;
  torso: THREE.Group | null;
  head: THREE.Group | null;
  thighL: THREE.Group | null;
  thighR: THREE.Group | null;
  kneeL: THREE.Group | null;
  kneeR: THREE.Group | null;
  armL: THREE.Group | null;
  armR: THREE.Group | null;
  elbowL: THREE.Group | null;
  elbowR: THREE.Group | null;
}

/** Third-person controller, smooth humanoid Phemelo and a cinematic follow camera. */
export function Player() {
  const group = useRef<THREE.Group>(null);
  const rig = useRef<Rig>({ hips: null, torso: null, head: null, thighL: null, thighR: null, kneeL: null, kneeR: null, armL: null, armR: null, elbowL: null, elbowR: null });
  const state = useRef({
    pos: new THREE.Vector3(0, 0, 8.5),
    vel: new THREE.Vector3(),
    jump: 0,
    vy: 0,
    heading: Math.PI,
    yaw: 0,
    pitch: 0.3,
    dist: 7,
    phase: 0,
    stride: 0,
    run: 0,
    lastSave: 0,
    moved: false,
    loaded: false,
    look: new THREE.Vector3(0, 1.5, 8.5),
    camPos: new THREE.Vector3(30, 14, 30),
  });
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
          const p = new THREE.Vector3(w.x, 0, w.z);
          resolve(p);
          state.current.pos.copy(p);
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
      if (e.key === ' ' && !useGame.getState().panel) e.preventDefault();
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
      state.current.yaw -= (e.clientX - lx) * 0.005;
      state.current.pitch = Math.max(0.02, Math.min(1.25, state.current.pitch + (e.clientY - ly) * 0.0035));
      lx = e.clientX;
      ly = e.clientY;
    };
    const pu = () => (dragging = false);
    const wheel = (e: WheelEvent) => {
      state.current.dist = Math.max(2.6, Math.min(26, state.current.dist * (1 + e.deltaY * 0.0012)));
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

  const tmp = useMemo(() => ({ input: new THREE.Vector3(), next: new THREE.Vector3(), target: new THREE.Vector3(), offset: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0) }), []);

  useFrame(({ clock }, dt) => {
    const s = state.current;
    dt = Math.min(dt, 0.05);
    const cam = camera as THREE.PerspectiveCamera;
    const panelOpen = !!useGame.getState().panel;
    if (!started) {
      // title screen: slow cinematic orbit over the sea
      const t = clock.elapsedTime * 0.05 + 0.6;
      cam.position.set(Math.cos(t) * 47, 19 + Math.sin(t * 2) * 2.5, Math.sin(t) * 47);
      cam.lookAt(0, 2.5, 0);
      s.camPos.copy(cam.position);
      if (group.current) group.current.position.set(s.pos.x, heightAt(s.pos.x, s.pos.z), s.pos.z);
      playerPos.copy(s.pos);
      return;
    }
    // ---- movement relative to the camera
    const input = tmp.input.set(0, 0, 0);
    if (!panelOpen && !typing()) {
      if (keys.has('w') || keys.has('arrowup')) input.z -= 1;
      if (keys.has('s') || keys.has('arrowdown')) input.z += 1;
      if (keys.has('a') || keys.has('arrowleft')) input.x -= 1;
      if (keys.has('d') || keys.has('arrowright')) input.x += 1;
    }
    const moving = input.lengthSq() > 0;
    const running = moving && keys.has('shift');
    s.run += ((running ? 1 : 0) - s.run) * Math.min(1, dt * 5);
    const speed = 4.4 + s.run * 4.6;
    if (moving) input.normalize().applyAxisAngle(tmp.up, s.yaw);
    // smooth acceleration so starts and stops feel weighty
    s.vel.lerp(input.multiplyScalar(speed), Math.min(1, dt * (moving ? 9 : 7)));
    const spd = s.vel.length();
    if (spd > 0.05) {
      const next = tmp.next.copy(s.pos).addScaledVector(s.vel, dt);
      resolve(next);
      s.pos.x = next.x;
      s.pos.z = next.z;
      if (moving) {
        const target = Math.atan2(s.vel.x, s.vel.z);
        let diff = target - s.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        s.heading += diff * Math.min(1, dt * 10);
      }
      s.moved = true;
    }
    s.phase += dt * spd * 1.55;
    s.stride += ((spd > 0.3 ? Math.min(1, spd / 4.4) : 0) - s.stride) * Math.min(1, dt * 8);
    // ---- jump & gravity
    if (keys.has(' ') && s.jump <= 0.001 && !panelOpen) s.vy = 5.2;
    s.vy -= 16 * dt;
    s.jump = Math.max(0, s.jump + s.vy * dt);
    if (s.jump === 0) s.vy = Math.max(0, s.vy);
    const ground = heightAt(s.pos.x, s.pos.z);
    playerPos.set(s.pos.x, ground, s.pos.z);

    // ---- animate the body
    const g = group.current;
    const r = rig.current;
    const t = clock.elapsedTime;
    const air = s.jump > 0.02 ? 1 : 0;
    if (g) {
      g.position.set(s.pos.x, ground + s.jump, s.pos.z);
      g.rotation.y = s.heading;
    }
    const sw = Math.sin(s.phase);
    const amp = s.stride * (0.55 + s.run * 0.35);
    if (r.hips) r.hips.position.y = 0.95 + Math.abs(Math.cos(s.phase)) * 0.045 * s.stride - s.stride * 0.02 + Math.sin(t * 2) * 0.006 * (1 - s.stride);
    if (r.torso) {
      r.torso.rotation.x = s.run * 0.22 * s.stride + air * 0.1;
      r.torso.rotation.y = sw * 0.12 * s.stride;
      r.torso.scale.y = 1 + Math.sin(t * 2) * 0.008 * (1 - s.stride);
    }
    if (r.head) r.head.rotation.x = -s.run * 0.15 * s.stride;
    if (r.thighL) r.thighL.rotation.x = air ? -0.7 : sw * amp;
    if (r.thighR) r.thighR.rotation.x = air ? -0.2 : -sw * amp;
    if (r.kneeL) r.kneeL.rotation.x = air ? 1.1 : Math.max(0, -Math.cos(s.phase + 0.4)) * amp * 1.6 + 0.05;
    if (r.kneeR) r.kneeR.rotation.x = air ? 0.5 : Math.max(0, Math.cos(s.phase + 0.4)) * amp * 1.6 + 0.05;
    if (r.armL) {
      r.armL.rotation.x = air ? -0.9 : -sw * amp * 0.9;
      r.armL.rotation.z = -0.08 - air * 0.3;
    }
    if (r.armR) {
      r.armR.rotation.x = air ? -0.9 : sw * amp * 0.9;
      r.armR.rotation.z = 0.08 + air * 0.3;
    }
    if (r.elbowL) r.elbowL.rotation.x = -(0.15 + s.run * 1.1 * s.stride + s.stride * 0.25);
    if (r.elbowR) r.elbowR.rotation.x = -(0.15 + s.run * 1.1 * s.stride + s.stride * 0.25);

    // ---- cinematic follow camera
    const target = tmp.target.set(s.pos.x, ground + 1.45 + s.jump * 0.4, s.pos.z);
    s.look.lerp(target, Math.min(1, dt * 10));
    const offset = tmp.offset.set(Math.sin(s.yaw) * Math.cos(s.pitch), Math.sin(s.pitch), Math.cos(s.yaw) * Math.cos(s.pitch)).multiplyScalar(s.dist);
    const desired = target.clone().add(offset);
    const floor = heightAt(desired.x, desired.z) + 0.45;
    if (desired.y < floor) desired.y = floor;
    s.camPos.lerp(desired, Math.min(1, dt * 6));
    cam.position.copy(s.camPos);
    cam.lookAt(s.look);
    const fov = 50 + s.run * s.stride * 7;
    if (Math.abs(cam.fov - fov) > 0.05) {
      cam.fov += (fov - cam.fov) * Math.min(1, dt * 4);
      cam.updateProjectionMatrix();
    }

    // ---- nearest door
    let near: string | null = null;
    for (const z of ZONES) {
      const [dx, dz] = doorOf(z);
      if (Math.hypot(s.pos.x - dx, s.pos.z - dz) < 3.2) near = z.id;
    }
    useGame.getState().setNearZone(near);

    // ---- autosave position every 5 s after moving
    if (s.moved && clock.elapsedTime - s.lastSave > 5 && s.loaded) {
      s.lastSave = clock.elapsedTime;
      s.moved = false;
      void api.saveWorld({ x: s.pos.x, y: 0, z: s.pos.z, heading: s.heading, lastZone: near }).catch(() => undefined);
    }
  });

  return (
    <group ref={group}>
      <Character avatar={avatar} rig={rig} />
      {started && (
        <WorldLabel position={[0, 2.2, 0]} size={9} near={1.2} far={40} compact title={`${profile?.name ?? 'Phemelo'} · Lv ${profile?.overall.level ?? 1}`} accent="#f59e0b" />
      )}
    </group>
  );
}

/** A smooth, stylised human built from capsules and spheres, with knees and elbows that bend. */
function Character({ avatar, rig }: { avatar: Record<string, string>; rig: React.MutableRefObject<Rig> }) {
  const col = (k: string, d: string) => avatar[k] ?? d;
  const m = useMemo(
    () => ({
      skin: new THREE.MeshStandardMaterial({ color: col('skin', '#8d5524'), roughness: 0.55 }),
      shirt: new THREE.MeshStandardMaterial({ color: col('shirt', '#2563eb'), roughness: 0.75 }),
      pants: new THREE.MeshStandardMaterial({ color: col('pants', '#1f2937'), roughness: 0.8 }),
      hair: new THREE.MeshStandardMaterial({ color: col('hair', '#141414'), roughness: 0.9 }),
      shoes: new THREE.MeshStandardMaterial({ color: col('shoes', '#f5f5f5'), roughness: 0.5 }),
      sole: new THREE.MeshStandardMaterial({ color: '#2b2b2b', roughness: 0.8 }),
      bag: new THREE.MeshStandardMaterial({ color: '#30363f', roughness: 0.7 }),
      badge: new THREE.MeshStandardMaterial({ color: '#f59e0b', emissive: '#f59e0b', emissiveIntensity: 0.6, roughness: 0.4 }),
      eye: new THREE.MeshStandardMaterial({ color: '#0b0b0b', roughness: 0.2 }),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(avatar)],
  );
  const set = (k: keyof Rig) => (el: THREE.Group | null) => {
    rig.current[k] = el;
  };
  const leg = (side: 1 | -1) => (
    <group key={side} ref={set(side < 0 ? 'thighL' : 'thighR')} position={[side * 0.11, -0.02, 0]}>
      <mesh position-y={-0.22} material={m.pants} castShadow>
        <capsuleGeometry args={[0.085, 0.3, 6, 14]} />
      </mesh>
      <group ref={set(side < 0 ? 'kneeL' : 'kneeR')} position-y={-0.45}>
        <mesh position-y={-0.2} material={m.pants} castShadow>
          <capsuleGeometry args={[0.072, 0.3, 6, 14]} />
        </mesh>
        <group position={[0, -0.43, 0.045]}>
          <RoundedBox args={[0.13, 0.09, 0.28]} radius={0.04} smoothness={3} material={m.shoes} castShadow />
          <mesh position={[0, -0.04, 0]} material={m.sole}>
            <boxGeometry args={[0.135, 0.02, 0.285]} />
          </mesh>
        </group>
      </group>
    </group>
  );
  const arm = (side: 1 | -1) => (
    <group key={side} ref={set(side < 0 ? 'armL' : 'armR')} position={[side * 0.25, 0.44, 0]}>
      <mesh position-y={-0.08} material={m.shirt} castShadow>
        <capsuleGeometry args={[0.068, 0.12, 6, 12]} />
      </mesh>
      <mesh position-y={-0.2} material={m.skin} castShadow>
        <capsuleGeometry args={[0.055, 0.14, 6, 12]} />
      </mesh>
      <group ref={set(side < 0 ? 'elbowL' : 'elbowR')} position-y={-0.3}>
        <mesh position-y={-0.12} material={m.skin} castShadow>
          <capsuleGeometry args={[0.05, 0.18, 6, 12]} />
        </mesh>
        <mesh position-y={-0.29} scale={[0.9, 1.15, 0.7]} material={m.skin}>
          <sphereGeometry args={[0.058, 14, 10]} />
        </mesh>
      </group>
    </group>
  );
  return (
    <group ref={set('hips')} position-y={0.95}>
      <mesh rotation-z={Math.PI / 2} material={m.pants} castShadow>
        <capsuleGeometry args={[0.13, 0.12, 6, 14]} />
      </mesh>
      {leg(-1)}
      {leg(1)}
      <group ref={set('torso')} position-y={0.06}>
        <mesh position-y={0.26} scale={[1.12, 1, 0.72]} material={m.shirt} castShadow>
          <capsuleGeometry args={[0.18, 0.26, 8, 18]} />
        </mesh>
        <mesh position={[0, 0.3, 0.13]} material={m.badge}>
          <boxGeometry args={[0.07, 0.09, 0.01]} />
        </mesh>
        <RoundedBox args={[0.3, 0.36, 0.13]} radius={0.05} smoothness={3} position={[0, 0.3, -0.19]} material={m.bag} castShadow />
        {[-1, 1].map((sd) => (
          <mesh key={sd} position={[sd * 0.11, 0.38, -0.02]} rotation-x={0.15} material={m.bag}>
            <boxGeometry args={[0.04, 0.3, 0.25]} />
          </mesh>
        ))}
        {arm(-1)}
        {arm(1)}
        <mesh position-y={0.53} material={m.skin}>
          <cylinderGeometry args={[0.05, 0.06, 0.1, 12]} />
        </mesh>
        <group ref={set('head')} position-y={0.69}>
          <mesh scale={[0.92, 1.08, 1]} material={m.skin} castShadow>
            <sphereGeometry args={[0.12, 28, 20]} />
          </mesh>
          <mesh position={[0, 0.03, -0.008]} scale={[0.96, 0.92, 1.03]} material={m.hair}>
            <sphereGeometry args={[0.124, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.52]} />
          </mesh>
          {[-1, 1].map((sd) => (
            <group key={sd}>
              <mesh position={[sd * 0.04, 0.012, 0.106]} material={m.eye}>
                <sphereGeometry args={[0.014, 10, 8]} />
              </mesh>
              <mesh position={[sd * 0.112, -0.005, 0]} scale={[0.5, 1, 0.8]} material={m.skin}>
                <sphereGeometry args={[0.03, 10, 8]} />
              </mesh>
            </group>
          ))}
          <mesh position={[0, -0.02, 0.115]} material={m.skin}>
            <sphereGeometry args={[0.018, 10, 8]} />
          </mesh>
        </group>
      </group>
    </group>
  );
}
