import * as THREE from 'three';

/** Live player position, read by the sun's shadow camera so shadows stay crisp around Phemelo. */
export const playerPos = new THREE.Vector3(0, 0, 8);

/** One clock uniform shared by every wind / water shader. */
export const timeUniform = { value: 0 };

export type Quality = 'ultra' | 'high' | 'medium' | 'low';
export type QualitySetting = Quality | 'auto';

export interface QualityPreset {
  dpr: [number, number];
  shadows: boolean;
  shadowMap: number;
  post: boolean; // bloom glow pipeline
  ao: boolean; // ambient occlusion (contact shading)
  msaa: number; // samples inside the post pipeline
  grass: number;
  label: string;
}

export const QUALITY: Record<Quality, QualityPreset> = {
  ultra: { dpr: [1, 1.5], shadows: true, shadowMap: 2048, post: true, ao: true, msaa: 4, grass: 40000, label: 'Ultra - everything on (gaming laptops / desktop GPUs)' },
  high: { dpr: [1, 1.5], shadows: true, shadowMap: 2048, post: true, ao: false, msaa: 2, grass: 26000, label: 'High - soft shadows and glowing lights' },
  medium: { dpr: [1, 1.25], shadows: true, shadowMap: 1024, post: false, ao: false, msaa: 0, grass: 16000, label: 'Medium - shadows, smooth edges (best for most laptops)' },
  low: { dpr: [1, 1], shadows: false, shadowMap: 512, post: false, ao: false, msaa: 0, grass: 0, label: 'Low - fastest' },
};

let detected: Quality | null = null;

/**
 * Pick a sensible default from the graphics chip: laptops with built-in Intel / AMD graphics get
 * Medium, dedicated GPUs get High, software rendering gets Low.
 */
export function detectQuality(): Quality {
  if (detected) return detected;
  detected = 'medium';
  try {
    const gl = document.createElement('canvas').getContext('webgl2') ?? document.createElement('canvas').getContext('webgl');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    const name = String(ext ? gl!.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '').toLowerCase();
    if (/swiftshader|llvmpipe|software|basic render/.test(name)) detected = 'low';
    else if (/nvidia|geforce|rtx|gtx|quadro|radeon rx|radeon pro|arc a\d/.test(name)) detected = 'high';
    else detected = 'medium';
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    detected = 'medium';
  }
  return detected;
}

export function qualityOf(v: unknown): Quality {
  if (v === 'ultra' || v === 'high' || v === 'medium' || v === 'low') return v;
  return detectQuality();
}

export function stepDown(q: Quality): Quality {
  return q === 'ultra' ? 'high' : q === 'high' ? 'medium' : 'low';
}
