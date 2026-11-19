import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

const FONT = '"Inter Variable", "Segoe UI", "Segoe UI Emoji", system-ui, sans-serif';
const PX = 2; // draw at 2x for crisp text

function drawLabel(canvas: HTMLCanvasElement, title: string, subtitle: string | undefined, accent: string, compact: boolean) {
  const ctx = canvas.getContext('2d')!;
  const tSize = (compact ? 12 : 13.5) * PX;
  const sSize = 11 * PX;
  ctx.font = `650 ${tSize}px ${FONT}`;
  const tw = ctx.measureText(title).width;
  ctx.font = `450 ${sSize}px ${FONT}`;
  const sw = subtitle ? ctx.measureText(subtitle).width : 0;
  const padX = 11 * PX;
  const w = Math.ceil(Math.max(tw, sw) + padX * 2 + 4 * PX);
  const h = Math.ceil((subtitle ? 42 : compact ? 24 : 28) * PX);
  canvas.width = w + 8 * PX;
  canvas.height = h + 8 * PX;
  const x = 4 * PX;
  const y = 4 * PX;
  const r = 10 * PX;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = 'rgba(8, 13, 25, 0.78)';
  ctx.fill();
  ctx.lineWidth = PX;
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.stroke();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = accent;
  ctx.fillRect(x, y, 3 * PX, h);
  ctx.restore();
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f1f5fb';
  ctx.font = `650 ${tSize}px ${FONT}`;
  ctx.fillText(title, x + padX, y + (subtitle ? 15 * PX : h / 2 + PX));
  if (subtitle) {
    ctx.fillStyle = '#b6c3da';
    ctx.font = `450 ${sSize}px ${FONT}`;
    ctx.fillText(subtitle, x + padX, y + 31 * PX);
  }
  return { w: canvas.width, h: canvas.height };
}

/**
 * A floating name tag drawn inside the 3D scene (no web-page elements, so it costs almost nothing).
 * It shrinks with distance but never grows beyond its natural size up close, and hides when
 * the camera is very near or very far.
 */
export function WorldLabel({ position, title, subtitle, accent = '#60a5fa', near = 2.5, far = 75, size = 20, compact = false }: { position: [number, number, number]; title: string; subtitle?: string; accent?: string; near?: number; far?: number; size?: number; compact?: boolean }) {
  const sprite = useRef<THREE.Sprite>(null);
  const { size: viewport } = useThree();
  const { tex, mat, dims } = useMemo(() => {
    const canvas = document.createElement('canvas');
    const dims = drawLabel(canvas, title, subtitle, accent, compact);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false, toneMapped: false });
    return { tex, mat, dims };
  }, [title, subtitle, accent, compact]);
  useEffect(() => {
    // redraw once the bundled Inter font has loaded
    let alive = true;
    void document.fonts?.ready.then(() => {
      if (!alive) return;
      const d = drawLabel(tex.image as HTMLCanvasElement, title, subtitle, accent, compact);
      dims.w = d.w;
      dims.h = d.h;
      tex.needsUpdate = true;
    });
    return () => {
      alive = false;
      tex.dispose();
      mat.dispose();
    };
  }, [tex, mat, dims, title, subtitle, accent, compact]);
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }) => {
    const s = sprite.current;
    if (!s) return;
    s.getWorldPosition(v);
    const d = camera.position.distanceTo(v);
    s.visible = d > near && d < far;
    if (!s.visible) return;
    const k = Math.min(1, Math.max(0.42, size / d));
    const fov = ((camera as THREE.PerspectiveCamera).fov * Math.PI) / 180;
    const unitsPerPx = (2 * Math.tan(fov / 2)) / viewport.height;
    const hPx = (dims.h / PX) * k;
    s.scale.set(hPx * (dims.w / dims.h) * unitsPerPx, hPx * unitsPerPx, 1);
  });
  return <sprite ref={sprite} position={position} material={mat} renderOrder={20} center={new THREE.Vector2(0.5, 0)} />;
}
