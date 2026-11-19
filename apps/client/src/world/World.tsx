import { Canvas } from '@react-three/fiber';
import { Sky, Stars } from '@react-three/drei';
import { Terrain, Trees } from './Terrain';
import { Buildings } from './Buildings';
import { ForexCandles, NetworkCables, SkyClouds } from './Decor';
import { Player } from './Player';
import { useGame } from '../store';

/** Real South African time drives the sky: day, golden hour or night. */
function sunFromClock(): { sun: [number, number, number]; night: boolean } {
  const h = (new Date().getUTCHours() + 2 + new Date().getUTCMinutes() / 60) % 24;
  const t = ((h - 6) / 12) * Math.PI; // 06:00 sunrise, 18:00 sunset
  const y = Math.sin(t);
  return { sun: [Math.cos(t) * 100, Math.max(-0.2, y) * 100 + 4, 40], night: y < -0.05 };
}

export function World() {
  const quality = useGame((s) => s.profile?.settings.quality ?? 'high');
  const { sun, night } = sunFromClock();
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Canvas shadows={quality === 'high'} dpr={quality === 'high' ? [1, 1.75] : 1} camera={{ fov: 55, near: 0.1, far: 600, position: [30, 22, 30] }} gl={{ antialias: quality === 'high' }}>
        <color attach="background" args={[night ? '#0b1026' : '#8ec5ff']} />
        <fog attach="fog" args={[night ? '#0b1026' : '#a7d3ff', 70, 230]} />
        <Sky sunPosition={sun} turbidity={6} rayleigh={night ? 0.2 : 1.2} />
        {night && <Stars radius={180} depth={40} count={2500} factor={4} fade />}
        <hemisphereLight args={[night ? '#5b6b9a' : '#dbeafe', '#3f6212', night ? 0.55 : 0.9]} />
        <directionalLight
          position={[30, 45, 20]}
          intensity={night ? 0.35 : 1.15}
          castShadow={quality === 'high'}
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-45}
          shadow-camera-right={45}
          shadow-camera-top={45}
          shadow-camera-bottom={-45}
        />
        {night && <pointLight position={[0, 6, 0]} intensity={40} distance={30} color="#fde68a" />}
        <Terrain />
        <Trees />
        <Buildings />
        <NetworkCables />
        <ForexCandles />
        <SkyClouds />
        <Player />
      </Canvas>
    </div>
  );
}
