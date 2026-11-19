import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { WorldLabel } from './WorldLabel';
import { ZONES, type Zone } from './zones';
import { yawOf } from './ground';
import { claddingTexture, facadeTextures, screenTexture, signTexture, timberTexture } from './textures';
import { useSun } from './sky';
import { useGame } from '../store';
import { api } from '../api';

/* ------------------------------------------------------------------ materials */

const MAT = {
  concrete: new THREE.MeshStandardMaterial({ color: '#eceef1', roughness: 0.8 }),
  stone: new THREE.MeshStandardMaterial({ color: '#ddd7cc', roughness: 0.72 }),
  plinth: new THREE.MeshStandardMaterial({ color: '#b3aea4', roughness: 0.85 }),
  charcoal: new THREE.MeshStandardMaterial({ color: '#272b33', roughness: 0.55, metalness: 0.3 }),
  black: new THREE.MeshPhysicalMaterial({ color: '#0b0d16', roughness: 0.25, metalness: 0.55, clearcoat: 1, clearcoatRoughness: 0.08 }),
  metal: new THREE.MeshStandardMaterial({ color: '#c6cbd2', roughness: 0.32, metalness: 0.9 }),
  darkMetal: new THREE.MeshStandardMaterial({ color: '#363b44', roughness: 0.38, metalness: 0.85 }),
  frame: new THREE.MeshStandardMaterial({ color: '#2a2e35', roughness: 0.4, metalness: 0.75 }),
  white: new THREE.MeshStandardMaterial({ color: '#f7f7f5', roughness: 0.45 }),
  rubber: new THREE.MeshStandardMaterial({ color: '#16181d', roughness: 0.8 }),
  glass: new THREE.MeshPhysicalMaterial({ color: '#9fbfd6', roughness: 0.04, metalness: 0.85, envMapIntensity: 1.6 }),
  foliage: new THREE.MeshStandardMaterial({ color: '#3f7f34', roughness: 0.9 }),
  reelOrange: new THREE.MeshStandardMaterial({ color: '#f97316', roughness: 0.5 }),
  reelBlue: new THREE.MeshStandardMaterial({ color: '#2563eb', roughness: 0.5 }),
};

/** Glowing LED strips. Brighter at night; values above 1 feed the bloom glow. */
const leds = new Map<string, THREE.MeshStandardMaterial>();
function led(color: string) {
  let m = leds.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.6, toneMapped: false });
    leds.set(color, m);
  }
  return m;
}

/** Blinking status lights - six phases so they don't all flash together. */
const BLINK_COLORS = ['#22c55e', '#22c55e', '#f59e0b', '#38bdf8', '#22c55e', '#a855f7'];
const blinkMats = BLINK_COLORS.map((c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 2, toneMapped: false }));

function useFacade(seed: number, w: number, h: number, warm?: string) {
  const night = useSun((s) => s.sun.night);
  const mat = useMemo(() => {
    const { map, emissive } = facadeTextures(seed, warm);
    const m = map.clone();
    const e = emissive.clone();
    m.needsUpdate = e.needsUpdate = true;
    m.repeat.set(w / 1.8 / 8, h / 3 / 8);
    e.repeat.copy(m.repeat);
    return new THREE.MeshPhysicalMaterial({ map: m, emissiveMap: e, emissive: '#ffffff', roughness: 0.05, metalness: 0.72, envMapIntensity: 1.55, clearcoat: 0.6, clearcoatRoughness: 0.05 });
  }, [seed, w, h, warm]);
  mat.emissiveIntensity = night ? 1.25 : 0;
  return mat;
}

function useTimber(w: number, h: number) {
  return useMemo(() => {
    const t = timberTexture().clone();
    t.needsUpdate = true;
    t.repeat.set(w / 1.4, h / 2.6);
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.75 });
  }, [w, h]);
}

/* ------------------------------------------------------------------ small parts */

function Bx({ p, s, m, shadow = true }: { p: [number, number, number]; s: [number, number, number]; m: THREE.Material; shadow?: boolean }) {
  return (
    <mesh position={p} material={m} castShadow={shadow} receiveShadow>
      <boxGeometry args={s} />
    </mesh>
  );
}

function Sign({ text, color, width, y, z, x = 0 }: { text: string; color: string; width: number; y: number; z: number; x?: number }) {
  const night = useSun((s) => s.sun.night);
  const tex = signTexture(text);
  return (
    <mesh position={[x, y, z]} renderOrder={3}>
      <planeGeometry args={[width, width / 6.4]} />
      <meshStandardMaterial map={tex} transparent color="#ffffff" emissive={color} emissiveMap={tex} emissiveIntensity={night ? 5 : 1.5} toneMapped={false} depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
    </mesh>
  );
}

const Y0 = 0.3; // top of the plinth

/** Glass double doors, optional canopy, and a glowing pad that lights up when you can press E. */
function Entrance({ zone, frontZ, padZ, near, canopy = true, width = 1.8, height = 2.4 }: { zone: Zone; frontZ: number; padZ: number; near: boolean; canopy?: boolean; width?: number; height?: number }) {
  const night = useSun((s) => s.sun.night);
  const pad = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    if (pad.current) pad.current.opacity = near ? 0.65 + Math.sin(clock.elapsedTime * 5) * 0.3 : 0.22;
  });
  return (
    <group>
      <Bx p={[0, Y0 + height / 2 + 0.05, frontZ + 0.03]} s={[width + 0.24, height + 0.16, 0.08]} m={MAT.frame} />
      <mesh position={[0, Y0 + height / 2 + 0.03, frontZ + 0.08]}>
        <boxGeometry args={[width, height, 0.04]} />
        <meshPhysicalMaterial color={near ? zone.color : '#a7c3d6'} emissive={near ? zone.color : night ? '#ffcf8a' : '#000000'} emissiveIntensity={near ? 1.6 : night ? 1.1 : 0} roughness={0.04} metalness={0.6} envMapIntensity={1.4} />
      </mesh>
      <Bx p={[0, Y0 + height / 2 + 0.03, frontZ + 0.11]} s={[0.05, height, 0.03]} m={MAT.frame} shadow={false} />
      {[-0.14, 0.14].map((x) => (
        <Bx key={x} p={[x, Y0 + 1.05, frontZ + 0.14]} s={[0.04, 0.5, 0.04]} m={MAT.metal} shadow={false} />
      ))}
      {canopy && (
        <group position={[0, Y0 + height + 0.42, frontZ + 0.75]}>
          <RoundedBox args={[width + 1.6, 0.16, 1.5]} radius={0.05} smoothness={2} material={MAT.concrete} castShadow receiveShadow />
          <Bx p={[0, -0.06, 0.76]} s={[width + 1.6, 0.05, 0.03]} m={led(zone.color)} shadow={false} />
        </group>
      )}
      {/* steps */}
      <Bx p={[0, 0.075, frontZ + 0.65]} s={[width + 1, 0.15, 0.5]} m={MAT.plinth} />
      <mesh position={[0, 0.02, padZ]} rotation-x={-Math.PI / 2} renderOrder={2}>
        <ringGeometry args={[0.55, 0.72, 48]} />
        <meshBasicMaterial ref={pad} color={zone.color} transparent depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

function Fan({ p, r = 0.6 }: { p: [number, number, number]; r?: number }) {
  const blades = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (blades.current) blades.current.rotation.y += dt * 6;
  });
  return (
    <group position={p}>
      <mesh material={MAT.darkMetal} castShadow>
        <cylinderGeometry args={[r, r, 0.22, 32, 1, true]} />
      </mesh>
      <mesh position-y={-0.08} rotation-x={-Math.PI / 2} material={MAT.rubber}>
        <circleGeometry args={[r, 32]} />
      </mesh>
      <group ref={blades}>
        {[0, 1, 2, 3, 4].map((k) => (
          <mesh key={k} rotation-y={(k / 5) * Math.PI * 2} position-y={0.02} material={MAT.metal}>
            <boxGeometry args={[0.08, 0.02, r * 1.8]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function Penguin({ p }: { p: [number, number, number] }) {
  const orange = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f5a524', roughness: 0.5 }), []);
  return (
    <group position={p}>
      <RoundedBox args={[1.5, 0.3, 1.5]} radius={0.08} position-y={0.15} material={led('#eab308')} />
      <group position-y={0.3}>
        <mesh position-y={0.75} scale={[1, 1.35, 0.9]} material={MAT.black} castShadow>
          <sphereGeometry args={[0.55, 32, 24]} />
        </mesh>
        <mesh position={[0, 0.68, 0.2]} scale={[0.85, 1.2, 0.6]} material={MAT.white}>
          <sphereGeometry args={[0.45, 32, 24]} />
        </mesh>
        <mesh position-y={1.55} material={MAT.black} castShadow>
          <sphereGeometry args={[0.37, 32, 24]} />
        </mesh>
        {[-0.13, 0.13].map((x) => (
          <group key={x}>
            <mesh position={[x, 1.63, 0.29]} material={MAT.white}>
              <sphereGeometry args={[0.095, 16, 12]} />
            </mesh>
            <mesh position={[x * 0.9, 1.63, 0.37]} material={MAT.rubber}>
              <sphereGeometry args={[0.045, 12, 8]} />
            </mesh>
          </group>
        ))}
        <mesh position={[0, 1.48, 0.38]} rotation-x={Math.PI / 2} material={orange}>
          <coneGeometry args={[0.1, 0.28, 16]} />
        </mesh>
        {[-0.22, 0.22].map((x) => (
          <mesh key={x} position={[x, 0.05, 0.22]} scale={[1, 0.35, 1.5]} material={orange}>
            <sphereGeometry args={[0.15, 16, 8]} />
          </mesh>
        ))}
        {[-1, 1].map((sd) => (
          <mesh key={sd} position={[sd * 0.55, 0.85, 0]} rotation-z={sd * 0.3} scale={[0.25, 1, 0.7]} material={MAT.black}>
            <sphereGeometry args={[0.45, 20, 16]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function Dish({ p }: { p: [number, number, number] }) {
  return (
    <group position={p}>
      <Bx p={[0, 0.4, 0]} s={[0.12, 0.8, 0.12]} m={MAT.metal} />
      <group position-y={0.95} rotation-x={0.75}>
        <mesh material={MAT.white} castShadow>
          <sphereGeometry args={[0.85, 32, 12, 0, Math.PI * 2, Math.PI * 0.68, Math.PI * 0.32]} />
        </mesh>
        <Bx p={[0, 0.25, 0]} s={[0.04, 0.6, 0.04]} m={MAT.metal} shadow={false} />
      </group>
    </group>
  );
}

function Antenna({ p, h = 1.6 }: { p: [number, number, number]; h?: number }) {
  return (
    <group position={p}>
      <mesh position-y={h / 2} material={MAT.rubber}>
        <cylinderGeometry args={[0.035, 0.05, h, 10]} />
      </mesh>
      <mesh position-y={h} material={MAT.rubber}>
        <sphereGeometry args={[0.055, 12, 8]} />
      </mesh>
    </group>
  );
}

/** Racks seen through the data-centre window: rows of blinking status lights. */
function RackWindow({ x, w, frontZ }: { x: number; w: number; frontZ: number }) {
  const racks = Math.max(2, Math.floor(w / 0.7));
  return (
    <group position={[x, Y0 + 1.75, frontZ]}>
      <mesh position-z={0.02}>
        <boxGeometry args={[w, 1.5, 0.04]} />
        <meshPhysicalMaterial color="#0b1220" roughness={0.05} metalness={0.4} clearcoat={1} envMapIntensity={1.2} />
      </mesh>
      {Array.from({ length: racks }, (_, i) => (
        <group key={i} position-x={-w / 2 + (i + 0.5) * (w / racks)}>
          {Array.from({ length: 6 }, (_, k) => (
            <mesh key={k} position={[((k % 2) - 0.5) * 0.18, -0.55 + k * 0.21, 0.05]} material={blinkMats[(i * 3 + k) % blinkMats.length]}>
              <boxGeometry args={[0.07, 0.035, 0.01]} />
            </mesh>
          ))}
        </group>
      ))}
      <Bx p={[0, 0.78, 0.03]} s={[w + 0.12, 0.06, 0.08]} m={MAT.frame} shadow={false} />
      <Bx p={[0, -0.78, 0.03]} s={[w + 0.12, 0.06, 0.08]} m={MAT.frame} shadow={false} />
    </group>
  );
}

/** Rooftop LED wall on the Trading Floor: real EUR/USD history plus a ticker of the latest closes. */
function TradingScreen({ w, h }: { w: number; h: number }) {
  const tex = useMemo(() => screenTexture(1024, 288), []);
  const data = useRef<{ closes: number[]; latest: [string, { close: number; change: number }][] }>({ closes: [], latest: [] });
  const last = useRef(-1);
  useEffect(() => {
    api.candles('EURUSD', 'D', 120).then((r) => (data.current.closes = r.candles.map((c) => c.close))).catch(() => undefined);
    api.marketSymbols().then((r) => (data.current.latest = Object.entries(r.latest))).catch(() => undefined);
  }, []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if ((new URLSearchParams(location.search).get('dbg') ?? '').includes('screen')) return;
    if (t - last.current < 0.25) return;
    last.current = t;
    const canvas = tex.image as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    const W = canvas.width;
    const H = canvas.height;
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#04130c');
    bg.addColorStop(1, '#010604');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.font = '700 26px "Inter Variable", "Segoe UI", sans-serif';
    ctx.fillStyle = '#86efac';
    ctx.fillText('EUR/USD  ·  daily  ·  ECB reference rates', 24, 40);
    const closes = data.current.closes;
    if (closes.length > 2) {
      const lo = Math.min(...closes);
      const hi = Math.max(...closes);
      const cw = 620;
      const reveal = Math.min(closes.length, Math.floor(((t * 12) % (closes.length + 40)) + 1));
      ctx.beginPath();
      closes.slice(0, reveal).forEach((c, i) => {
        const x = 24 + (i / (closes.length - 1)) * cw;
        const y = 250 - ((c - lo) / (hi - lo || 1)) * 180;
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      });
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.fillStyle = '#e2fbe9';
      ctx.font = '800 44px "Inter Variable", "Segoe UI", sans-serif';
      ctx.fillText(closes[reveal - 1].toFixed(4), 24, 120);
    }
    // ticker column
    const rows = data.current.latest;
    ctx.font = '600 24px "Inter Variable", "Segoe UI", sans-serif';
    rows.forEach(([sym, q], i) => {
      const y = 80 + ((i * 34 - (t * 22) % (rows.length * 34) + rows.length * 34) % (rows.length * 34));
      if (y > H - 10 || y < 60) return;
      ctx.fillStyle = '#cbd5e1';
      ctx.fillText(`${sym.slice(0, 3)}/${sym.slice(3)}`, 690, y);
      ctx.fillStyle = q.change >= 0 ? '#4ade80' : '#f87171';
      ctx.fillText(`${q.close.toFixed(q.close > 20 ? 2 : 4)} ${q.change >= 0 ? '▲' : '▼'}`, 830, y);
    });
    ctx.fillStyle = 'rgba(255,255,255,.04)';
    for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
    tex.needsUpdate = true;
  });
  return (
    <mesh position-z={0.17}>
      <planeGeometry args={[w, h]} />
      <meshStandardMaterial map={tex} emissive="#ffffff" emissiveMap={tex} emissiveIntensity={1.15} toneMapped={false} />
    </mesh>
  );
}

/** Exam Hall clock showing real South African time. */
function SastClock({ r }: { r: number }) {
  const tex = useMemo(() => screenTexture(256, 256), []);
  useEffect(() => {
    const draw = () => {
      const canvas = tex.image as HTMLCanvasElement;
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, 256, 256);
      ctx.fillStyle = '#f8f5ee';
      ctx.beginPath();
      ctx.arc(128, 128, 124, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 8;
      ctx.strokeStyle = '#9f1239';
      ctx.stroke();
      ctx.fillStyle = '#1f2937';
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        ctx.fillRect(128 + Math.sin(a) * 100 - 3, 128 - Math.cos(a) * 100 - 3, 6, 6);
      }
      const now = new Date();
      const h = (now.getUTCHours() + 2) % 12;
      const m = now.getUTCMinutes();
      const hand = (a: number, len: number, wdt: number) => {
        ctx.lineWidth = wdt;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(128, 128);
        ctx.lineTo(128 + Math.sin(a) * len, 128 - Math.cos(a) * len);
        ctx.stroke();
      };
      ctx.strokeStyle = '#111827';
      hand(((h + m / 60) / 12) * Math.PI * 2, 58, 10);
      hand((m / 60) * Math.PI * 2, 88, 6);
      tex.needsUpdate = true;
    };
    draw();
    const id = setInterval(draw, 20000);
    return () => clearInterval(id);
  }, [tex]);
  return (
    <mesh>
      <circleGeometry args={[r, 48]} />
      <meshStandardMaterial map={tex} transparent roughness={0.4} emissive="#ffffff" emissiveMap={tex} emissiveIntensity={0.15} />
    </mesh>
  );
}

/* ------------------------------------------------------------------ building styles */

interface StyleOut {
  body: ReactNode;
  frontZ: number; // where the door sits
  canopy?: boolean;
  door?: { width?: number; height?: number };
  sign: { y: number; z: number; width: number; x?: number };
  top: number; // for the floating label
}

function useStyle(z: Zone): StyleOut {
  const [w, h, d] = z.size;
  const seed = z.id.length * 7 + z.pos[0];
  const facadeFront = useFacade(seed, w, h);
  const facadeTower1 = useFacade(seed + 1, 6, 8);
  const facadeTower2 = useFacade(seed + 2, 4.8, 3);
  const facadeTower3 = useFacade(seed + 3, 3.4, 1.8);
  const timber = useTimber(w, h);
  const cladding = useMemo(() => {
    const t = claddingTexture().clone();
    t.needsUpdate = true;
    t.repeat.set(w / 0.9, 1);
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.42, metalness: 0.55 });
  }, [w]);
  const pulse = useMemo(() => [new THREE.MeshStandardMaterial({ color: '#a855f7', emissive: '#a855f7', emissiveIntensity: 2, toneMapped: false }), new THREE.MeshStandardMaterial({ color: '#38bdf8', emissive: '#38bdf8', emissiveIntensity: 2, toneMapped: false })], []);
  const beacon = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ef4444', emissive: '#ef4444', emissiveIntensity: 3, toneMapped: false }), []);
  const houseWindow = useMemo(() => new THREE.MeshPhysicalMaterial({ color: '#b9d2e2', roughness: 0.04, metalness: 0.6, emissive: '#ffcf8a', emissiveIntensity: 0.1, envMapIntensity: 1.4 }), []);
  const night = useSun((s) => s.sun.night);
  houseWindow.emissiveIntensity = night ? 1.7 : 0.08;
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    pulse[0].emissiveIntensity = 2 + Math.max(0, Math.sin(t * 2.2)) * 5;
    pulse[1].emissiveIntensity = 2 + Math.max(0, Math.sin(t * 2.2 + 1.6)) * 5;
    beacon.emissiveIntensity = Math.sin(t * 2.5) > 0.6 ? 9 : 0.3;
  });

  const paint = useMemo(() => new THREE.MeshStandardMaterial({ color: z.color, roughness: 0.5 }), [z.color]);
  const pediment = useMemo(() => new THREE.Shape([new THREE.Vector2(-(w + 0.4) / 2, 0), new THREE.Vector2((w + 0.4) / 2, 0), new THREE.Vector2(0, 1.05)]), [w]);
  const L = led(z.color);
  const roof = Y0 + h;

  switch (z.style) {
    case 'academy': {
      const coreFront = d / 2 - 1;
      return {
        frontZ: coreFront,
        canopy: false,
        top: roof + 2.6,
        sign: { y: roof + 1.25, z: -0.3 + (d - 2.6) / 2 + 0.05, width: w - 3.5 },
        body: (
          <>
            <RoundedBox args={[w, h, d - 1]} radius={0.08} smoothness={2} position={[0, Y0 + h / 2, -0.5]} material={MAT.concrete} castShadow receiveShadow />
            <mesh position={[0, Y0 + (h - 0.5) / 2, coreFront + 0.02]} material={facadeFront}>
              <boxGeometry args={[w - 1.1, h - 0.5, 0.06]} />
            </mesh>
            {[-2.9, -1.3, 1.3, 2.9].map((x) => (
              <group key={x} position={[x, Y0, d / 2 - 0.2]}>
                <mesh position-y={h / 2} material={MAT.white} castShadow>
                  <cylinderGeometry args={[0.15, 0.17, h, 24]} />
                </mesh>
              </group>
            ))}
            {[-1, 1].map((s) => (
              <Bx key={s} p={[s * (w / 2 - 0.12), Y0 + h / 2, coreFront + 0.12]} s={[0.24, h, 0.24]} m={L} shadow={false} />
            ))}
            <RoundedBox args={[w + 0.6, 0.4, d + 0.4]} radius={0.06} smoothness={2} position={[0, roof + 0.2, 0.2]} material={MAT.concrete} castShadow receiveShadow />
            <Bx p={[0, roof + 0.02, 0.2 + (d + 0.4) / 2 + 0.01]} s={[w + 0.6, 0.06, 0.03]} m={L} shadow={false} />
            <mesh position={[0, roof + 0.4 + 0.8, -0.3]} material={facadeFront} castShadow>
              <boxGeometry args={[w - 3, 1.6, d - 2.6]} />
            </mesh>
            <RoundedBox args={[w - 2.6, 0.2, d - 2.2]} radius={0.05} smoothness={2} position={[0, roof + 2.1, -0.3]} material={MAT.concrete} castShadow />
            <Antenna p={[w / 2 - 1.8, roof + 2.2, -1.4]} />
          </>
        ),
      };
    }
    case 'lab':
      return {
        frontZ: d / 2,
        top: roof + 2.4,
        sign: { y: roof - 0.42, z: d / 2 + 0.03, width: Math.min(w - 1.2, 4.2) },
        body: (
          <>
            <RoundedBox args={[w, h, d]} radius={0.07} smoothness={2} position={[0, Y0 + h / 2, 0]} material={MAT.charcoal} castShadow receiveShadow />
            {[1.25, 2.85].map((y) => (
              <Bx key={y} p={[0, Y0 + y, 0]} s={[w + 0.03, 0.07, d + 0.03]} m={L} shadow={false} />
            ))}
            <mesh position={[0, Y0 + 1.42, d / 2 + 0.02]} material={facadeFront}>
              <boxGeometry args={[w * 0.66, 2.6, 0.05]} />
            </mesh>
            <Bx p={[0, roof + 0.12, 0]} s={[w - 0.3, 0.24, d - 0.3]} m={MAT.darkMetal} />
            <Dish p={[-w / 2 + 1.4, roof + 0.24, -0.8]} />
            <Antenna p={[w / 2 - 0.8, roof + 0.24, -d / 2 + 0.8]} h={2.2} />
            <Antenna p={[w / 2 - 1.4, roof + 0.24, -d / 2 + 0.8]} h={1.5} />
          </>
        ),
      };
    case 'hut': {
      const doorH = Math.min(2.3, h - 0.65);
      return {
        frontZ: d / 2,
        canopy: false,
        door: { width: 1.5, height: doorH },
        top: roof + 2.0,
        sign: { y: roof - 0.36, z: d / 2 + 0.03, width: Math.min(w - 0.8, 3.6) },
        body: (
          <>
            <mesh position={[0, Y0 + h / 2, 0]} material={timber} castShadow receiveShadow>
              <boxGeometry args={[w, h, d]} />
            </mesh>
            <mesh position={[0, Y0 + doorH / 2 + 0.02, d / 2 + 0.02]} material={MAT.glass}>
              <boxGeometry args={[w * 0.74, doorH, 0.05]} />
            </mesh>
            {[0.33, 0.66].map((f) => (
              <Bx key={f} p={[0, Y0 + doorH * f, d / 2 + 0.05]} s={[w * 0.74, 0.04, 0.03]} m={MAT.metal} shadow={false} />
            ))}
            <Bx p={[0, Y0 + 0.08, 0]} s={[w + 0.02, 0.16, d + 0.02]} m={paint} shadow={false} />
            <group position={[0, roof + 0.22, 0]} rotation-x={-0.09}>
              <RoundedBox args={[w + 1, 0.2, d + 1.2]} radius={0.05} smoothness={2} material={MAT.charcoal} castShadow receiveShadow />
              <Bx p={[0, -0.12, (d + 1.2) / 2 - 0.02]} s={[w + 1, 0.05, 0.04]} m={L} shadow={false} />
            </group>
            {z.id === 'cable' ? (
              <group position={[w / 2 + 1, 0, 0.6]}>
                {[0, 1].map((k) => (
                  <group key={k} position={[0, 0.55, k * 1.1 - 0.5]} rotation-y={Math.PI / 2}>
                    <mesh material={k ? MAT.reelBlue : MAT.reelOrange} castShadow>
                      <torusGeometry args={[0.38, 0.17, 16, 32]} />
                    </mesh>
                    <mesh rotation-x={Math.PI / 2} material={MAT.plinth}>
                      <cylinderGeometry args={[0.55, 0.55, 0.06, 32]} />
                    </mesh>
                  </group>
                ))}
              </group>
            ) : (
              <>
                <Fan p={[-w / 4, roof + 0.6, -0.6]} r={0.5} />
                <Fan p={[w / 4, roof + 0.6, -0.6]} r={0.5} />
              </>
            )}
          </>
        ),
      };
    }
    case 'datacenter': {
      const winW = (w - 3.4) / 2;
      return {
        frontZ: d / 2,
        top: roof + 2.4,
        sign: { y: roof - 0.48, z: d / 2 + 0.04, width: 3.9 },
        body: (
          <>
            <mesh position={[0, Y0 + h / 2, 0]} material={cladding} castShadow receiveShadow>
              <boxGeometry args={[w, h, d]} />
            </mesh>
            <Bx p={[0, Y0 + 0.3, 0]} s={[w + 0.04, 0.6, d + 0.04]} m={MAT.charcoal} />
            <RoundedBox args={[w + 0.2, 0.25, d + 0.2]} radius={0.05} smoothness={2} position={[0, roof + 0.12, 0]} material={MAT.darkMetal} castShadow />
            <Bx p={[0, roof - 0.1, d / 2 + 0.03]} s={[w, 0.05, 0.03]} m={led('#22c55e')} shadow={false} />
            <RackWindow x={-(winW / 2 + 1.25)} w={winW} frontZ={d / 2} />
            <RackWindow x={winW / 2 + 1.25} w={winW} frontZ={d / 2} />
            {[-2.6, 0, 2.6].map((x) => (
              <group key={x} position={[x, roof + 0.25, -0.6]}>
                <RoundedBox args={[1.9, 0.8, 1.9]} radius={0.06} smoothness={2} position-y={0.4} material={MAT.metal} castShadow />
                <Fan p={[0, 0.85, 0]} r={0.62} />
              </group>
            ))}
          </>
        ),
      };
    }
    case 'linux':
      return {
        frontZ: d / 2,
        top: roof + 3.2,
        sign: { y: roof - 0.55, z: d / 2 + 0.04, width: 4.0 },
        body: (
          <>
            <RoundedBox args={[w, h, d]} radius={0.07} smoothness={2} position={[0, Y0 + h / 2, 0]} material={MAT.charcoal} castShadow receiveShadow />
            <mesh position={[0, Y0 + 0.2 + (h - 1.7) / 2, d / 2 + 0.02]} material={facadeFront}>
              <boxGeometry args={[w - 1.2, h - 1.7, 0.05]} />
            </mesh>
            {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => <Bx key={`${sx}${sz}`} p={[sx * (w / 2), Y0 + h / 2, sz * (d / 2)]} s={[0.2, h + 0.02, 0.2]} m={L} shadow={false} />))}
            <Penguin p={[0, roof, -0.6]} />
          </>
        ),
      };
    case 'hpc':
      return {
        frontZ: d / 2,
        top: roof + 2.4,
        sign: { y: Y0 + 3.75, z: d / 2 + 0.04, width: 3.6 },
        body: (
          <>
            <RoundedBox args={[w, h, d]} radius={0.08} smoothness={2} position={[0, Y0 + h / 2, 0]} material={MAT.black} castShadow receiveShadow />
            {[-2.55, -2.0, 2.0, 2.55].map((x, i) => (
              <Bx key={x} p={[x, Y0 + (h - 0.9) / 2 + 0.2, d / 2 + 0.02]} s={[0.07, h - 1.3, 0.04]} m={pulse[i % 2]} shadow={false} />
            ))}
            {[-1, 1].flatMap((side) =>
              [-1.6, 0, 1.6].map((zz, i) => <Bx key={`${side}${zz}`} p={[side * (w / 2 + 0.02), Y0 + (h - 0.9) / 2 + 0.2, zz]} s={[0.04, h - 1.3, 0.07]} m={pulse[(i + (side > 0 ? 1 : 0)) % 2]} shadow={false} />),
            )}
            <Bx p={[0, roof - 0.55, 0]} s={[w + 0.03, 0.12, d + 0.03]} m={L} shadow={false} />
            {[-1.3, 1.3].map((x) => (
              <mesh key={x} position={[x, roof + 0.55, -0.4]} material={MAT.metal} castShadow>
                <cylinderGeometry args={[0.55, 0.75, 1.1, 32]} />
              </mesh>
            ))}
          </>
        ),
      };
    case 'tower':
      return {
        frontZ: d / 2,
        top: Y0 + 18.2,
        sign: { y: Y0 + 7.25, z: d / 2 + 0.04, width: 4.4 },
        body: (
          <>
            <mesh position={[0, Y0 + 4, 0]} material={facadeTower1} castShadow receiveShadow>
              <boxGeometry args={[6, 8, 6]} />
            </mesh>
            <RoundedBox args={[6.3, 0.3, 6.3]} radius={0.06} smoothness={2} position={[0, Y0 + 8.15, 0]} material={MAT.concrete} castShadow />
            <Bx p={[0, Y0 + 8.02, 0]} s={[6.33, 0.06, 6.33]} m={L} shadow={false} />
            <mesh position={[0, Y0 + 8.3 + 1.5, 0]} material={facadeTower2} castShadow>
              <boxGeometry args={[4.8, 3, 4.8]} />
            </mesh>
            <RoundedBox args={[5.1, 0.3, 5.1]} radius={0.06} smoothness={2} position={[0, Y0 + 11.45, 0]} material={MAT.concrete} castShadow />
            <Bx p={[0, Y0 + 11.32, 0]} s={[5.13, 0.06, 5.13]} m={L} shadow={false} />
            <mesh position={[0, Y0 + 11.6 + 0.9, 0]} material={facadeTower3} castShadow>
              <boxGeometry args={[3.4, 1.8, 3.4]} />
            </mesh>
            <RoundedBox args={[3.7, 0.3, 3.7]} radius={0.06} smoothness={2} position={[0, Y0 + 13.55, 0]} material={MAT.concrete} castShadow />
            <Bx p={[0, Y0 + 13.42, 0]} s={[3.73, 0.06, 3.73]} m={L} shadow={false} />
            <mesh position={[0, Y0 + 15.2, 0]} material={MAT.metal}>
              <cylinderGeometry args={[0.05, 0.13, 3.2, 12]} />
            </mesh>
            <mesh position={[0, Y0 + 16.85, 0]} material={beacon}>
              <sphereGeometry args={[0.13, 16, 12]} />
            </mesh>
            <CloudRing y={Y0 + 10.5} />
          </>
        ),
      };
    case 'trading':
      return {
        frontZ: d / 2,
        top: roof + 3.4,
        sign: { y: roof - 0.45, z: d / 2 + 0.04, width: 4.6 },
        body: (
          <>
            <RoundedBox args={[w, h, d]} radius={0.07} smoothness={2} position={[0, Y0 + h / 2, 0]} material={MAT.concrete} castShadow receiveShadow />
            <mesh position={[0, Y0 + (h - 0.95) / 2 + 0.05, d / 2 + 0.02]} material={facadeFront}>
              <boxGeometry args={[w - 1.2, h - 0.95, 0.05]} />
            </mesh>
            <Bx p={[0, roof + 0.02, d / 2 + 0.02]} s={[w, 0.06, 0.03]} m={L} shadow={false} />
            <group position={[0, roof + 1.3, d / 2 - 0.7]}>
              <RoundedBox args={[w - 0.6, 2.2, 0.3]} radius={0.06} smoothness={2} material={MAT.charcoal} castShadow />
              <TradingScreen w={w - 0.9} h={1.95} />
              {[-w / 3, w / 3].map((x) => (
                <Bx key={x} p={[x, -1.15, -0.1]} s={[0.15, 0.6, 0.15]} m={MAT.darkMetal} />
              ))}
            </group>
          </>
        ),
      };
    case 'exam': {
      const coreFront = d / 2 - 1.2;
      return {
        frontZ: coreFront,
        canopy: false,
        door: { width: 1.6, height: 2.4 },
        top: roof + 3.0,
        sign: { y: roof + 0.25, z: (d + 0.4) / 2 + 0.02, width: 3.0 },
        body: (
          <>
            <RoundedBox args={[w, h, d - 1.2]} radius={0.05} smoothness={2} position={[0, Y0 + h / 2, -0.6]} material={MAT.stone} castShadow receiveShadow />
            {[-2.05, -1.2, 1.2, 2.05].map((x) => (
              <group key={x} position={[x, Y0, d / 2 - 0.3]}>
                <Bx p={[0, 0.07, 0]} s={[0.46, 0.14, 0.46]} m={MAT.stone} />
                <mesh position-y={h / 2} material={MAT.white} castShadow>
                  <cylinderGeometry args={[0.15, 0.18, h - 0.2, 24]} />
                </mesh>
                <Bx p={[0, h - 0.07, 0]} s={[0.46, 0.14, 0.46]} m={MAT.stone} />
              </group>
            ))}
            <RoundedBox args={[w + 0.4, 0.5, d + 0.4]} radius={0.04} smoothness={2} position={[0, roof + 0.25, 0]} material={MAT.stone} castShadow receiveShadow />
            <mesh position={[0, roof + 0.5, -(d + 0.4) / 2]} material={MAT.stone} castShadow>
              <extrudeGeometry args={[pediment, { depth: d + 0.4, bevelEnabled: false }]} />
            </mesh>
            <Bx p={[0, roof - 0.02, (d + 0.4) / 2 + 0.01]} s={[w + 0.4, 0.05, 0.03]} m={L} shadow={false} />
            <group position={[0, roof + 0.88, (d + 0.4) / 2 + 0.02]}>
              <SastClock r={0.34} />
            </group>
          </>
        ),
      };
    }
    case 'studio':
      return {
        frontZ: d / 2,
        top: roof + 4.3,
        sign: { y: roof - 0.45, z: d / 2 + 0.04, width: 3.8 },
        body: (
          <>
            <RoundedBox args={[w, h, d]} radius={0.08} smoothness={2} position={[0, Y0 + h / 2, 0]} material={MAT.concrete} castShadow receiveShadow />
            <mesh position={[0, Y0 + (h - 1.2) / 2 + 0.05, d / 2 + 0.02]} material={facadeFront}>
              <boxGeometry args={[w - 1.2, h - 1.2, 0.05]} />
            </mesh>
            {[-1, 1].map((sx) => (
              <Bx key={sx} p={[sx * (w / 2 - 0.25), Y0 + h / 2, d / 2 + 0.05]} s={[0.12, h - 0.2, 0.06]} m={L} shadow={false} />
            ))}
            <RoundedBox args={[w + 0.5, 0.22, d + 0.5]} radius={0.05} smoothness={2} position={[0, roof + 0.11, 0]} material={MAT.charcoal} castShadow receiveShadow />
            <Bx p={[0, roof - 0.02, (d + 0.5) / 2]} s={[w + 0.5, 0.05, 0.03]} m={L} shadow={false} />
            <group position={[-1.2, roof + 0.22, -0.5]} rotation-y={0.25}>
              <mesh position-y={0.08} material={MAT.metal}>
                <cylinderGeometry args={[0.45, 0.5, 0.16, 32]} />
              </mesh>
              <group position-y={1.62} rotation-x={-0.1}>
                <RoundedBox args={[1.5, 2.9, 0.16]} radius={0.14} smoothness={4} material={MAT.black} castShadow />
                <PhoneScreen w={1.32} h={2.62} />
              </group>
            </group>
            <InfinityLoop position={[1.5, roof + 1.7, -0.4]} />
          </>
        ),
      };
    case 'home':
    default:
      return {
        frontZ: d / 2,
        canopy: false,
        door: { width: 1.1, height: 2.2 },
        top: roof + 2.2,
        sign: { y: roof - 0.42, z: d / 2 + 0.03, width: 2.6, x: 0.55 },
        body: (
          <>
            <RoundedBox args={[w, h, d]} radius={0.06} smoothness={2} position={[0, Y0 + h / 2, 0]} material={MAT.white} castShadow receiveShadow />
            <mesh position={[-w / 2 + 0.6, Y0 + h / 2, 0]} material={timber} castShadow>
              <boxGeometry args={[1.25, h + 0.01, d + 0.02]} />
            </mesh>
            <mesh position={[1.25, Y0 + 1.35, d / 2 + 0.02]} material={houseWindow}>
              <boxGeometry args={[1.2, 1.7, 0.05]} />
            </mesh>
            <Bx p={[1.25, Y0 + 1.35, d / 2 + 0.04]} s={[1.3, 1.8, 0.02]} m={MAT.frame} shadow={false} />
            <RoundedBox args={[w + 0.9, 0.18, d + 0.9]} radius={0.04} smoothness={2} position={[0, roof + 0.09, 0]} material={MAT.charcoal} castShadow receiveShadow />
            <Bx p={[0, roof - 0.02, (d + 0.9) / 2]} s={[w + 0.9, 0.05, 0.03]} m={L} shadow={false} />
            {[-1, 1].map((s) => (
              <group key={s} position={[s * 1.15 + (s < 0 ? 0.25 : 0), 0, d / 2 + 0.95]}>
                <mesh position-y={0.25} material={MAT.charcoal} castShadow>
                  <cylinderGeometry args={[0.28, 0.22, 0.5, 20]} />
                </mesh>
                <mesh position-y={0.7} material={MAT.foliage} castShadow>
                  <sphereGeometry args={[0.38, 20, 14]} />
                </mesh>
              </group>
            ))}
          </>
        ),
      };
  }
}

/** The App Studio's giant phone shows the Kasi Market Flutter app you build in this stream. */
function PhoneScreen({ w, h }: { w: number; h: number }) {
  const night = useSun((s) => s.sun.night);
  const tex = useMemo(() => {
    const t = screenTexture(512, 1016);
    const draw = () => {
      const c = t.image as HTMLCanvasElement;
      const ctx = c.getContext('2d')!;
      const F = '"Inter Variable", "Segoe UI", sans-serif';
      ctx.fillStyle = '#f5f3ff';
      ctx.fillRect(0, 0, 512, 1016);
      ctx.fillStyle = '#6d28d9';
      ctx.fillRect(0, 0, 512, 170);
      ctx.fillStyle = '#ede9fe';
      ctx.font = `600 24px ${F}`;
      ctx.fillText('9:41', 28, 40);
      ctx.fillText('5G ▮▮▮', 400, 40);
      ctx.fillStyle = '#ffffff';
      ctx.font = `800 46px ${F}`;
      ctx.fillText('Kasi Market', 28, 128);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.roundRect(24, 196, 464, 64, 32);
      ctx.fill();
      ctx.fillStyle = '#7c7a8c';
      ctx.font = `500 26px ${F}`;
      ctx.fillText('🔍  Search bread, airtime...', 48, 238);
      const items: [string, string, string][] = [
        ['🍞', 'Brown bread', 'R 17.99'],
        ['🥛', 'Amasi 2 L', 'R 39.99'],
        ['📱', 'Airtime R29', 'R 29.00'],
        ['🌽', 'Maize meal 5 kg', 'R 64.99'],
        ['🍌', 'Bananas 1 kg', 'R 24.99'],
      ];
      items.forEach(([icon, name, price], i) => {
        const y = 290 + i * 128;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.roundRect(24, y, 464, 108, 22);
        ctx.fill();
        ctx.font = `48px ${F}`;
        ctx.fillText(icon, 44, y + 70);
        ctx.fillStyle = '#1e1b4b';
        ctx.font = `700 30px ${F}`;
        ctx.fillText(name, 120, y + 50);
        ctx.fillStyle = '#6d28d9';
        ctx.font = `700 28px ${F}`;
        ctx.fillText(price, 120, y + 88);
      });
      ctx.fillStyle = '#7c3aed';
      ctx.beginPath();
      ctx.arc(420, 930, 50, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = `600 64px ${F}`;
      ctx.fillText('+', 401, 952);
      t.needsUpdate = true;
    };
    draw();
    void document.fonts?.ready.then(draw);
    return t;
  }, []);
  return (
    <mesh position-z={0.085}>
      <planeGeometry args={[w, h]} />
      <meshStandardMaterial map={tex} emissive="#ffffff" emissiveMap={tex} emissiveIntensity={night ? 1.2 : 0.75} toneMapped={false} />
    </mesh>
  );
}

/** A glowing, slowly turning infinity loop: the DevOps cycle (plan, code, build, test, release, deploy, operate, monitor). */
function InfinityLoop({ position }: { position: [number, number, number] }) {
  const ref = useRef<THREE.Group>(null);
  const geo = useMemo(() => {
    class Lemniscate extends THREE.Curve<THREE.Vector3> {
      constructor() {
        super();
      }
      override getPoint(t: number, target = new THREE.Vector3()) {
        const a = t * Math.PI * 2;
        const d = 1 + Math.sin(a) ** 2;
        return target.set((1.1 * Math.cos(a)) / d, (1.1 * Math.sin(a) * Math.cos(a)) / d, 0);
      }
    }
    return new THREE.TubeGeometry(new Lemniscate(), 160, 0.07, 12, true);
  }, []);
  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.rotation.y = clock.elapsedTime * 0.5;
      ref.current.position.y = position[1] + Math.sin(clock.elapsedTime * 1.3) * 0.08;
    }
  });
  return (
    <group ref={ref} position={position}>
      <mesh geometry={geo} material={led('#a78bfa')} />
      <mesh position-y={-1.2} material={MAT.metal}>
        <cylinderGeometry args={[0.03, 0.05, 1.0, 10]} />
      </mesh>
    </group>
  );
}

function CloudRing({ y }: { y: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.2;
  });
  const puffs = [
    [0, 0, 0, 0.7],
    [0.7, -0.1, 0.1, 0.5],
    [-0.7, -0.12, 0, 0.55],
    [0.2, 0.35, 0, 0.45],
  ];
  return (
    <group ref={ref} position-y={y}>
      {[0, 1, 2, 3].map((k) => (
        <group key={k} rotation-y={(k * Math.PI) / 2} position-y={(k % 2) * 0.9}>
          <group position-x={5.2}>
            {puffs.map(([px, py, pz, r], i) => (
              <mesh key={i} position={[px, py, pz]}>
                <sphereGeometry args={[r, 20, 14]} />
                <meshStandardMaterial color="#ffffff" emissive="#e0f2fe" emissiveIntensity={0.35} roughness={1} />
              </mesh>
            ))}
          </group>
        </group>
      ))}
    </group>
  );
}

function Building({ z }: { z: Zone }) {
  const near = useGame((s) => s.nearZone === z.id);
  const [w, , d] = z.size;
  const st = useStyle(z);
  return (
    <group position={[z.pos[0], 0, z.pos[1]]} rotation-y={yawOf(z)}>
      <RoundedBox args={[w + 0.8, 0.3, d + 0.8]} radius={0.06} smoothness={2} position-y={0.15} material={MAT.plinth} receiveShadow castShadow />
      {st.body}
      <Entrance zone={z} frontZ={st.frontZ} padZ={d / 2 + 1.25} near={near} canopy={st.canopy !== false} width={st.door?.width} height={st.door?.height} />
      <Sign text={z.name.toUpperCase()} color={z.color} width={st.sign.width} y={st.sign.y} z={st.sign.z} x={st.sign.x} />
      <WorldLabel position={[0, st.top, 0]} size={26} title={`${z.icon}  ${z.name}`} subtitle={z.subtitle} accent={z.color} />
    </group>
  );
}

/** The landmark at the centre of the plaza: a giant core router with holographic rings and a data beam. */
function CoreRouter() {
  const rings = useRef<THREE.Group>(null);
  const beam = useMemo(() => {
    const g = new THREE.CylinderGeometry(0.06, 0.45, 9, 24, 1, true);
    const colors: number[] = [];
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const t = (p.getY(i) + 4.5) / 9;
      colors.push(0.4, 0.85, 1, (1 - t) * 0.35);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
    return g;
  }, []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (!rings.current) return;
    rings.current.children[0].rotation.set(Math.PI / 2, 0, t * 0.6);
    rings.current.children[1].rotation.set(Math.PI / 2 + Math.sin(t * 0.4) * 0.35, t * 0.25, 0);
    rings.current.position.y = 3.6 + Math.sin(t * 1.2) * 0.12;
  });
  const ports = Array.from({ length: 8 }, (_, i) => -1.12 + i * 0.32);
  return (
    <group>
      <mesh position-y={0.25} material={MAT.stone} castShadow receiveShadow>
        <cylinderGeometry args={[3.0, 3.2, 0.5, 72]} />
      </mesh>
      <mesh position-y={0.505} rotation-x={-Math.PI / 2} material={led('#22d3ee')}>
        <ringGeometry args={[2.55, 2.68, 96]} />
      </mesh>
      {[-1.3, 1.3].flatMap((x) => [-0.7, 0.7].map((zz) => <Bx key={`${x}${zz}`} p={[x, 0.6, zz]} s={[0.2, 0.2, 0.2]} m={MAT.rubber} />))}
      <RoundedBox args={[3.3, 1.05, 1.9]} radius={0.12} smoothness={3} position={[0, 1.22, 0]} material={MAT.darkMetal} castShadow receiveShadow />
      <Bx p={[0, 1.22, 0.96]} s={[3.0, 0.75, 0.02]} m={MAT.frame} shadow={false} />
      {ports.map((x, i) => (
        <group key={x} position={[x, 1.12, 0.98]}>
          <Bx p={[0, 0, 0]} s={[0.22, 0.17, 0.02]} m={MAT.rubber} shadow={false} />
          <Bx p={[0.07, 0.15, 0.005]} s={[0.05, 0.03, 0.01]} m={blinkMats[i % blinkMats.length]} shadow={false} />
        </group>
      ))}
      <Sign text="ITHUTE CORE" color="#22d3ee" width={1.5} y={1.47} z={0.98} />
      {[-1.25, 1.25].flatMap((x) => [-0.6, 0.6].map((zz) => <Antenna key={`${x}${zz}`} p={[x, 1.74, zz]} h={1.5} />))}
      <group ref={rings}>
        <mesh material={led('#22d3ee')}>
          <torusGeometry args={[1.55, 0.03, 8, 120]} />
        </mesh>
        <mesh material={led('#3b82f6')}>
          <torusGeometry args={[1.9, 0.025, 8, 120]} />
        </mesh>
      </group>
      <mesh geometry={beam} position-y={6.2}>
        <meshBasicMaterial vertexColors transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>
      <WorldLabel position={[0, 5.6, 0]} size={22} near={4} title="📡  Core Router · Ithute Plaza" accent="#22d3ee" />
    </group>
  );
}

/** One clock for every blinking LED and the night/day LED brightness. */
function LightDriver() {
  const night = useSun((s) => s.sun.night);
  useEffect(() => {
    for (const m of leds.values()) m.emissiveIntensity = night ? 7 : 2.6;
  }, [night]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    blinkMats.forEach((m, i) => (m.emissiveIntensity = Math.sin(t * (3 + i * 1.7) + i * 2) > 0.1 ? 5 : 0.2));
  });
  return null;
}

export function Buildings() {
  return (
    <group>
      {ZONES.map((z) => (
        <Building key={z.id} z={z} />
      ))}
      <CoreRouter />
      <LightDriver />
    </group>
  );
}
