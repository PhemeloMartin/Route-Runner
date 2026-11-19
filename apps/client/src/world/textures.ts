import * as THREE from 'three';

/**
 * Every texture in the world is drawn in code on a <canvas>, so the game stays fully offline
 * and the download stays small - no image files needed.
 */

const FONT = '"Inter Variable", "Segoe UI", system-ui, sans-serif';

function make(size: number | [number, number], draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, srgb = true) {
  const [w, h] = typeof size === 'number' ? [size, size] : size;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

const cache = new Map<string, THREE.Texture>();
function cached(key: string, build: () => THREE.Texture) {
  let t = cache.get(key);
  if (!t) {
    t = build();
    cache.set(key, t);
  }
  return t;
}

/** Tileable value noise (wraps at `period`). */
function tileNoise(x: number, y: number, period: number) {
  const h = (a: number, b: number) => {
    const s = Math.sin(((a % period) + period) % period * 127.1 + (((b % period) + period) % period) * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = h(xi, yi);
  const b = h(xi + 1, yi);
  const c = h(xi, yi + 1);
  const d = h(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Fine grain that breaks up flat colours on the grass and sand. */
export function detailTexture() {
  return cached('detail', () =>
    make(256, (ctx, w, h) => {
      const img = ctx.createImageData(w, h);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          let n = 0;
          let amp = 0.5;
          for (let o = 0; o < 4; o++) {
            const p = 8 << o;
            n += amp * tileNoise((x / w) * p, (y / h) * p, p);
            amp *= 0.5;
          }
          const v = Math.round(255 * (0.8 + n * 0.22));
          const i = (y * w + x) * 4;
          img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.min(255, v);
          img.data[i + 3] = 255;
        }
      ctx.putImageData(img, 0, 0);
    }),
  );
}

/** Normal map for the sea: overlapping sine swells that tile seamlessly. */
export function waterNormals() {
  return cached('water', () =>
    make(
      256,
      (ctx, w, h) => {
        const height = (x: number, y: number) => {
          const u = (x / w) * Math.PI * 2;
          const v = (y / h) * Math.PI * 2;
          return Math.sin(u * 3 + v * 2) * 0.5 + Math.sin(u * 5 - v * 4 + 1.3) * 0.3 + Math.sin(u * 2 - v * 7 + 2.1) * 0.25 + Math.sin(u * 11 + v * 9) * 0.12 + tileNoise((x / w) * 16, (y / h) * 16, 16) * 0.35;
        };
        const img = ctx.createImageData(w, h);
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++) {
            const dx = height(x + 1, y) - height(x - 1, y);
            const dy = height(x, y + 1) - height(x, y - 1);
            const n = new THREE.Vector3(-dx * 2.2, -dy * 2.2, 1).normalize();
            const i = (y * w + x) * 4;
            img.data[i] = (n.x * 0.5 + 0.5) * 255;
            img.data[i + 1] = (n.y * 0.5 + 0.5) * 255;
            img.data[i + 2] = (n.z * 0.5 + 0.5) * 255;
            img.data[i + 3] = 255;
          }
        ctx.putImageData(img, 0, 0);
      },
      false,
    ),
  );
}

/** Light stone paving for the walkways (repeats every 2 m). */
export function pavingTexture() {
  return cached('paving', () =>
    make(512, (ctx, w, h) => {
      ctx.fillStyle = '#c9c6bf';
      ctx.fillRect(0, 0, w, h);
      const n = 4;
      const s = w / n;
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n * 2; j++) {
          const off = j % 2 ? s / 2 : 0;
          const shade = 196 + Math.round(tileNoise(i * 3.1, j * 1.7, 64) * 26);
          ctx.fillStyle = `rgb(${shade},${shade - 3},${shade - 9})`;
          const x = i * s + off;
          const y = (j * s) / 2;
          ctx.fillRect(x + 3, y + 3, s - 6, s / 2 - 6);
          if (x + s > w) ctx.fillRect(x + 3 - w, y + 3, s - 6, s / 2 - 6);
        }
      // subtle speckle
      const img = ctx.getImageData(0, 0, w, h);
      for (let k = 0; k < img.data.length; k += 4) {
        const d = (Math.random() - 0.5) * 14;
        img.data[k] += d;
        img.data[k + 1] += d;
        img.data[k + 2] += d;
      }
      ctx.putImageData(img, 0, 0);
    }),
  );
}

/** Concentric rings of polished stone for the central plaza. */
export function plazaTexture() {
  return cached('plaza', () =>
    make(1024, (ctx, w) => {
      const c = w / 2;
      ctx.fillStyle = '#bdb8ae';
      ctx.fillRect(0, 0, w, w);
      for (let ring = 0; ring < 9; ring++) {
        const r0 = (ring / 9) * c;
        const r1 = ((ring + 1) / 9) * c;
        const segs = 8 + ring * 6;
        for (let s = 0; s < segs; s++) {
          const a0 = (s / segs) * Math.PI * 2;
          const a1 = ((s + 1) / segs) * Math.PI * 2;
          const tone = ring % 3 === 2 ? 150 : 200 + Math.round(tileNoise(ring * 5.3, s * 2.1, 97) * 28);
          ctx.fillStyle = ring % 3 === 2 ? `rgb(${tone - 40},${tone - 30},${tone - 15})` : `rgb(${tone},${tone - 4},${tone - 11})`;
          ctx.beginPath();
          ctx.arc(c, c, r1 - 2, a0 + 0.004, a1 - 0.004);
          ctx.arc(c, c, r0 + 2, a1 - 0.004, a0 + 0.004, true);
          ctx.closePath();
          ctx.fill();
        }
      }
    }),
  );
}

/** Vertical timber slats for workshop walls. */
export function timberTexture() {
  return cached('timber', () =>
    make(256, (ctx, w, h) => {
      const slats = 8;
      for (let i = 0; i < slats; i++) {
        const t = 150 + Math.round(tileNoise(i * 7.7, 3, 64) * 40);
        ctx.fillStyle = `rgb(${t},${Math.round(t * 0.68)},${Math.round(t * 0.42)})`;
        ctx.fillRect((i * w) / slats, 0, w / slats - 3, h);
        ctx.fillStyle = 'rgba(0,0,0,.08)';
        for (let g = 0; g < 6; g++) ctx.fillRect((i * w) / slats + 4 + g * 3.3, 0, 1, h);
      }
      ctx.fillStyle = '#3b2412';
      for (let i = 0; i < slats; i++) ctx.fillRect(((i + 1) * w) / slats - 3, 0, 3, h);
    }),
  );
}

/** Ribbed metal cladding for the data centre. */
export function claddingTexture() {
  return cached('cladding', () =>
    make(256, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, w / 8, 0);
      g.addColorStop(0, '#b9c0c9');
      g.addColorStop(0.45, '#e2e6ec');
      g.addColorStop(0.55, '#d4d9e0');
      g.addColorStop(1, '#9aa3ae');
      for (let i = 0; i < 8; i++) {
        ctx.save();
        ctx.translate((i * w) / 8, 0);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w / 8, h);
        ctx.restore();
      }
    }),
  );
}

/**
 * Curtain-wall glass. Returns a colour map (mullions + tinted panes) and an emissive map
 * where a random mix of offices has the lights on - used at night.
 */
export function facadeTextures(seed: number, warm = '#ffd9a0') {
  const key = `facade-${seed}-${warm}`;
  const cols = 8;
  const rows = 8;
  const lit = (i: number, j: number) => tileNoise(i * 3.7 + seed * 11.1, j * 5.3 + seed * 2.7, 9999) > 0.56;
  const map = cached(key + 'm', () =>
    make(512, (ctx, w, h) => {
      const cw = w / cols;
      const rh = h / rows;
      ctx.fillStyle = '#2b3542';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < cols; i++)
        for (let j = 0; j < rows; j++) {
          const g = ctx.createLinearGradient(0, j * rh, 0, (j + 1) * rh);
          const t = 0.85 + tileNoise(i * 1.3 + seed, j * 2.9, 9999) * 0.25;
          g.addColorStop(0, `rgb(${Math.round(150 * t)},${Math.round(178 * t)},${Math.round(204 * t)})`);
          g.addColorStop(1, `rgb(${Math.round(98 * t)},${Math.round(124 * t)},${Math.round(150 * t)})`);
          ctx.fillStyle = g;
          ctx.fillRect(i * cw + 5, j * rh + 7, cw - 10, rh - 14);
          // each bay is two panes with a slim mullion and a spandrel band at floor level
          ctx.fillStyle = '#2b3542';
          ctx.fillRect(i * cw + cw / 2 - 2, j * rh, 4, rh);
          ctx.fillStyle = 'rgba(40,52,66,.85)';
          ctx.fillRect(i * cw, j * rh + rh - 16, cw, 9);
        }
    }),
  );
  const emissive = cached(key + 'e', () =>
    make(512, (ctx, w, h) => {
      const cw = w / cols;
      const rh = h / rows;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < cols; i++)
        for (let j = 0; j < rows; j++) {
          if (!lit(i, j)) continue;
          const g = ctx.createRadialGradient((i + 0.5) * cw, (j + 0.3) * rh, 2, (i + 0.5) * cw, (j + 0.5) * rh, cw);
          const dim = 0.55 + tileNoise(i * 9.1 + seed, j * 4.3, 9999) * 0.45;
          g.addColorStop(0, warm);
          g.addColorStop(1, '#4a3a28');
          ctx.globalAlpha = dim;
          ctx.fillStyle = g;
          ctx.fillRect(i * cw + 5, j * rh + 7, cw / 2 - 8, rh - 24);
          ctx.fillRect(i * cw + cw / 2 + 3, j * rh + 7, cw / 2 - 8, rh - 24);
          ctx.globalAlpha = 1;
        }
    }),
  );
  return { map, emissive };
}

/** Illuminated building sign: white lettering on transparent background. */
export function signTexture(text: string) {
  return cached(`sign-${text}`, () => {
    const tex = make([1024, 160], () => undefined);
    const draw = () => {
      const canvas = tex.image as HTMLCanvasElement;
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let size = 104;
      ctx.font = `800 ${size}px ${FONT}`;
      while (ctx.measureText(text).width > canvas.width - 40 && size > 30) ctx.font = `800 ${(size -= 4)}px ${FONT}`;
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 4);
      tex.needsUpdate = true;
    };
    draw();
    void document.fonts?.ready.then(draw);
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  });
}

/** The South African flag, drawn to the official layout. */
export function flagTexture() {
  return cached('flag-za', () =>
    make([600, 400], (ctx, w, h) => {
      ctx.fillStyle = '#E03C31';
      ctx.fillRect(0, 0, w, h / 2);
      ctx.fillStyle = '#001489';
      ctx.fillRect(0, h / 2, w, h / 2);
      const y = (pts: [number, number][], width: number, color: string) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineJoin = 'miter';
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]);
        ctx.stroke();
      };
      const meet = w * 0.405;
      y([[-40, -26.7], [meet, h / 2], [w + 10, h / 2]], h / 3, '#FFFFFF');
      y([[-40, h + 26.7], [meet, h / 2]], h / 3, '#FFFFFF');
      y([[-40, -26.7], [meet, h / 2], [w + 10, h / 2]], h / 5, '#007749');
      y([[-40, h + 26.7], [meet, h / 2]], h / 5, '#007749');
      // the hoist triangle sits inside the notch of the white-bordered Y, edges parallel to the arms
      const slope = (h / 2 + 26.7) / (meet + 40);
      const sinA = Math.sin(Math.atan(slope));
      const apex0 = meet - h / 6 / sinA;
      const tri = (inset: number, color: string) => {
        const ax = apex0 - inset / sinA;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(ax, h / 2);
        ctx.lineTo(0, h / 2 - ax * slope);
        ctx.lineTo(0, h / 2 + ax * slope);
        ctx.closePath();
        ctx.fill();
      };
      tri(0, '#FFB81C');
      tri(h / 15, '#000000');
    }),
  );
}

/** A small live screen texture that the caller redraws (ticker boards, clocks). */
export function screenTexture(w: number, h: number) {
  const tex = make([w, h], (ctx) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
  });
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}
