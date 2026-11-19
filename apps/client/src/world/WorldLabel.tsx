import { useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';

/**
 * A floating 3D label that stays readable: it shrinks with distance but never grows
 * beyond its natural size up close, and hides when the camera is inside it or very far away.
 */
export function WorldLabel({ position, children, near = 2.5, far = 75, size = 20 }: { position: [number, number, number]; children: ReactNode; near?: number; far?: number; size?: number }) {
  const anchor = useRef<THREE.Group>(null);
  const box = useRef<HTMLDivElement>(null);
  const v = new THREE.Vector3();
  useFrame(({ camera }) => {
    if (!anchor.current || !box.current) return;
    anchor.current.getWorldPosition(v);
    const d = camera.position.distanceTo(v);
    const visible = d > near && d < far;
    box.current.style.display = visible ? 'block' : 'none';
    if (visible) box.current.style.transform = `scale(${Math.min(1, Math.max(0.42, size / d))})`;
  });
  return (
    <group ref={anchor} position={position}>
      <Html center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
        <div ref={box} style={{ transformOrigin: 'center bottom' }}>
          {children}
        </div>
      </Html>
    </group>
  );
}
