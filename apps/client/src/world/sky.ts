import * as THREE from 'three';
import { create } from 'zustand';

/**
 * Real South African time (SAST, UTC+2) drives the sun: sunrise ~06:00, sunset ~18:00,
 * warm golden light in between and lit-up windows at night.
 * Add ?time=19.5 to the URL to preview another hour.
 */
export interface SunState {
  hour: number;
  dir: THREE.Vector3; // unit vector towards the sun (or moon at night)
  elevation: number; // -1..1
  night: boolean;
  dusk: number; // 0 = midday, 1 = sun on the horizon
  key: string; // changes when the lighting should be re-captured
}

export function sunState(date = new Date()): SunState {
  const forced = Number(new URLSearchParams(location.search).get('time'));
  const hour = Number.isFinite(forced) && new URLSearchParams(location.search).has('time') ? forced : (date.getUTCHours() + 2 + date.getUTCMinutes() / 60) % 24;
  const t = ((hour - 6) / 12) * Math.PI;
  const elevation = Math.sin(t);
  const night = elevation < -0.04;
  // at night we light the scene from a high, cool "moon" opposite the sun's path
  const dir = night ? new THREE.Vector3(-0.35, 0.75, -0.45).normalize() : new THREE.Vector3(Math.cos(t), Math.max(0.03, elevation), 0.42).normalize();
  const dusk = night ? 1 : 1 - Math.min(1, Math.max(0, elevation / 0.45));
  return { hour, dir, elevation, night, dusk, key: `${night ? 'n' : 'd'}${Math.round(hour * 4)}` };
}

export const useSun = create<{ sun: SunState; tick: () => void }>((set) => ({
  sun: sunState(),
  tick: () => set({ sun: sunState() }),
}));

/** Colours for the current light. */
export function palette(s: SunState) {
  const c = (a: string, b: string, t: number) => new THREE.Color(a).lerp(new THREE.Color(b), t);
  if (s.night)
    return {
      sun: new THREE.Color('#a9bcff'),
      sunIntensity: 0.75,
      zenith: new THREE.Color('#02050d'),
      sky: new THREE.Color('#33467a'),
      ground: new THREE.Color('#161c2a'),
      hemi: 0.45,
      fog: new THREE.Color('#14223f'),
      env: 0.3,
      exposure: 1.0,
    };
  const dusk = Math.pow(s.dusk, 1.8);
  return {
    sun: c('#fff4e0', '#ffad5c', dusk),
    sunIntensity: 2.5 - s.dusk * 0.9,
    zenith: c('#1f5fc4', '#2b3f7d', dusk),
    sky: c('#bcd7f5', '#ffc9a0', dusk),
    ground: new THREE.Color('#4f5f34'),
    hemi: 0.55,
    fog: c('#a9cdee', '#f2b98c', dusk),
    env: 0.65,
    exposure: 1.0,
  };
}
