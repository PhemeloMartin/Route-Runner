import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, PerformanceMonitor, Stars } from '@react-three/drei';
import { Bloom, EffectComposer, N8AO, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';
import { Terrain } from './Terrain';
import { Clouds, Nature } from './Nature';
import { Buildings } from './Buildings';
import { Decor } from './Decor';
import { Player } from './Player';
import { palette, useSun, type SunState } from './sky';
import { QUALITY, playerPos, qualityOf, stepDown, timeUniform, type QualityPreset } from './shared';
import { useGame } from '../store';

/**
 * A clean gradient sky: deep blue overhead fading to a bright horizon, a warm halo around the sun,
 * orange at sunrise/sunset and navy at night. Same colours feed the fog so the sea melts into the sky.
 */
function SkyDome({ sun, distance }: { sun: SunState; distance: number }) {
  const pal = palette(sun);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          top: { value: new THREE.Color() },
          horizon: { value: new THREE.Color() },
          sunDir: { value: new THREE.Vector3() },
          sunColor: { value: new THREE.Color() },
          sunAmount: { value: 1 },
        },
        vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
        fragmentShader: `
          uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunColor; uniform float sunAmount;
          varying vec3 vDir;
          void main() {
            vec3 d = normalize(vDir);
            float h = max(d.y, 0.0);
            vec3 c = mix(horizon, top, pow(h, 0.5));
            c = mix(c, horizon * 0.82, smoothstep(0.0, -0.25, d.y));
            float s = max(dot(d, normalize(sunDir)), 0.0);
            c += sunColor * (pow(s, 900.0) * 18.0 + pow(s, 24.0) * 0.32 + pow(s, 4.0) * 0.12) * sunAmount;
            gl_FragColor = vec4(c, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      }),
    [],
  );
  mat.uniforms.top.value.copy(pal.zenith);
  mat.uniforms.horizon.value.copy(pal.fog);
  mat.uniforms.sunDir.value.copy(sun.dir);
  mat.uniforms.sunColor.value.copy(pal.sun);
  mat.uniforms.sunAmount.value = sun.night ? 0.15 : 1;
  return (
    <mesh material={mat} renderOrder={-1} frustumCulled={false}>
      <sphereGeometry args={[distance, 32, 16]} />
    </mesh>
  );
}

/** Sun, sky, fog and image-based lighting for the current time of day. */
function Atmosphere({ sun, q }: { sun: SunState; q: QualityPreset }) {
  const { scene, gl } = useThree();
  const light = useRef<THREE.DirectionalLight>(null);
  const pal = useMemo(() => palette(sun), [sun]);
  useEffect(() => {
    scene.environmentIntensity = pal.env;
    gl.toneMappingExposure = pal.exposure;
  }, [scene, gl, pal]);
  const frame = useRef(0);
  useEffect(() => {
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    return () => {
      gl.shadowMap.autoUpdate = true;
    };
  }, [gl]);
  useFrame(({ clock }) => {
    timeUniform.value = clock.elapsedTime;
    // shadows are re-rendered every other frame: half the cost, and the lag is invisible
    gl.shadowMap.needsUpdate = frame.current++ % 2 === 0;
    const l = light.current;
    if (!l) return;
    // keep the shadow camera centred on Phemelo so shadows stay sharp wherever you walk
    const snap = 0.5;
    const cx = Math.round(playerPos.x / snap) * snap;
    const cz = Math.round(playerPos.z / snap) * snap;
    l.position.set(cx + sun.dir.x * 60, sun.dir.y * 60, cz + sun.dir.z * 60);
    l.target.position.set(cx, 0, cz);
    l.target.updateMatrixWorld();
  });
  const S = 34;
  return (
    <>
      <SkyDome sun={sun} distance={800} />
      <fogExp2 attach="fog" args={[pal.fog, sun.night ? 0.009 : 0.0058]} />
      {sun.night && <Stars radius={300} depth={60} count={4000} factor={5} saturation={0.2} fade speed={0.4} />}
      <hemisphereLight args={[pal.sky, pal.ground, pal.hemi]} />
      <directionalLight
        ref={light}
        color={pal.sun}
        intensity={pal.sunIntensity}
        castShadow={q.shadows}
        shadow-mapSize={[q.shadowMap, q.shadowMap]}
        shadow-camera-left={-S}
        shadow-camera-right={S}
        shadow-camera-top={S}
        shadow-camera-bottom={-S}
        shadow-camera-near={1}
        shadow-camera-far={140}
        shadow-bias={-0.0004}
        shadow-normalBias={0.035}
      />
      {/* reflections in glass, water and metal come from a snapshot of this same sky */}
      <Environment key={sun.key} resolution={128} frames={1} background={false}>
        <SkyDome sun={sun} distance={400} />
        <mesh position-y={-60} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[800, 800]} />
          <meshBasicMaterial color={sun.night ? '#05080f' : '#3d5a4a'} />
        </mesh>
      </Environment>
    </>
  );
}

/** Glow pipeline for High / Ultra: bloom on bright lights, optional contact shading, filmic colour. */
function Effects({ q, night }: { q: QualityPreset; night: boolean }) {
  const effects = [
    q.ao ? <N8AO key="ao" halfRes aoRadius={1.6} distanceFalloff={0.6} intensity={2.4} quality="performance" color="#0b1020" /> : null,
    <Bloom key="bloom" mipmapBlur luminanceThreshold={1.15} luminanceSmoothing={0.3} intensity={night ? 1.1 : 0.55} radius={0.7} />,
    <ToneMapping key="tm" mode={ToneMappingMode.ACES_FILMIC} />,
  ].filter((e): e is JSX.Element => e !== null);
  return (
    <EffectComposer multisampling={q.msaa} enableNormalPass={false}>
      {effects}
    </EffectComposer>
  );
}

// Support/diagnostics: ?gfx=low|medium|high|ultra forces a level, ?dbg=shadow,grass,post,nature,buildings,decor,labels turns parts off.
const DBG = new URLSearchParams(location.search);
const off = (k: string) => (DBG.get('dbg') ?? '').split(',').includes(k);

function Probe() {
  useFrame(({ gl }) => {
    (window as unknown as { __rr: unknown }).__rr = { calls: gl.info.render.calls, tris: gl.info.render.triangles };
  });
  return null;
}

export function World() {
  const chosen = useGame((s) => qualityOf(DBG.get('gfx') ?? s.profile?.settings.quality));
  const panelOpen = useGame((s) => !!s.panel);
  const sun = useSun((s) => s.sun);
  const tick = useSun((s) => s.tick);
  const [drops, setDrops] = useState(0);
  const mounted = useRef(performance.now());
  useEffect(() => {
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [tick]);
  useEffect(() => setDrops(0), [chosen]);
  // if the laptop can't keep up, quietly step down one level (at most twice)
  let quality = chosen;
  for (let i = 0; i < drops; i++) quality = stepDown(quality);
  const base = QUALITY[quality];
  const q = { ...base, shadows: base.shadows && !off('shadow'), post: base.post && !off('post'), ao: base.ao && !off('ao'), grass: off('grass') ? 0 : base.grass };
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Canvas
        key={`${quality}-${q.post}`}
        shadows={q.shadows ? 'soft' : false}
        dpr={q.dpr}
        frameloop={panelOpen ? 'never' : 'always'}
        camera={{ fov: 50, near: 0.1, far: 1600, position: [38, 14, 38] }}
        gl={{ antialias: !q.post, powerPreference: 'high-performance', stencil: false }}
      >
        <PerformanceMonitor
          flipflops={2}
          onDecline={() => {
            if (performance.now() - mounted.current < 8000 || DBG.get('gfx')) return;
            mounted.current = performance.now();
            setDrops((d) => Math.min(2, d + 1));
          }}
        />
        <Atmosphere sun={sun} q={q} />
        <Terrain grass={q.grass} shadows={q.shadows} />
        {!off('nature') && <Nature shadows={q.shadows} />}
        <Clouds night={sun.night} />
        {!off('buildings') && <Buildings />}
        {!off('decor') && <Decor shadows={q.shadows} />}
        <Player />
        {DBG.has('dbg') || DBG.has('gfx') ? <Probe /> : null}
        {q.post && <Effects q={q} night={sun.night} />}
      </Canvas>
      <div className="vignette" />
    </div>
  );
}
