import { ZONES, doorOf, type Zone } from './zones';

/**
 * The shape of the island, shared by the terrain mesh, the grass, the trees and the player.
 * One function (heightAt) decides how high the ground is anywhere, so feet never float.
 */

export const PLAZA_R = 6.5;
export const WATER_Y = -0.55;
export const PATH_W = 2.6;

function hash2(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
const fade = (t: number) => t * t * (3 - 2 * t);
export const smoothstep = (a: number, b: number, x: number) => fade(Math.min(1, Math.max(0, (x - a) / (b - a))));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Smooth value noise in [0,1]. */
export function noise(x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const u = fade(x - xi);
  const v = fade(y - yi);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x: number, y: number, octaves = 4) {
  let sum = 0;
  let amp = 0.5;
  let f = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise(x * f, y * f);
    norm += amp;
    f *= 2.03;
    amp *= 0.5;
  }
  return sum / norm;
}

/** Deterministic pseudo-random number for scattering things the same way every time. */
export function rand(i: number, salt = 0) {
  return hash2(i * 1.618 + salt * 7.3, salt * 3.1 + i * 0.37);
}

/** The coastline wobbles so the island looks natural rather than a perfect circle. */
export function shoreR(theta: number) {
  return 38.5 + 1.6 * Math.sin(3 * theta + 0.5) + 1.1 * Math.sin(5 * theta + 1.3) + 0.5 * Math.sin(9 * theta + 2.1);
}

/** How far from the centre Phemelo may walk in a given direction (stops at the wet sand). */
export function walkLimit(theta: number) {
  return shoreR(theta) - 2.2;
}

export interface Segment {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  zone: Zone;
}

/** Each building's yaw so its front door faces the plaza. */
export function yawOf(z: Zone) {
  const [dx, dz] = doorOf(z);
  return Math.atan2(dx - z.pos[0], dz - z.pos[1]);
}

/** Walkways run from the plaza edge straight to each building's front face. */
export const PATHS: Segment[] = ZONES.map((z) => {
  const [cx, cz] = z.pos;
  const len = Math.hypot(cx, cz) || 1;
  const ux = cx / len;
  const uz = cz / len;
  const end = len - z.size[2] / 2 + 0.2;
  return { ax: ux * (PLAZA_R - 0.4), az: uz * (PLAZA_R - 0.4), bx: ux * end, bz: uz * end, zone: z };
});

export function distToSegment(x: number, z: number, s: Segment) {
  const vx = s.bx - s.ax;
  const vz = s.bz - s.az;
  const t = Math.max(0, Math.min(1, ((x - s.ax) * vx + (z - s.az) * vz) / (vx * vx + vz * vz)));
  return Math.hypot(x - s.ax - vx * t, z - s.az - vz * t);
}

export function distToPath(x: number, z: number) {
  let d = Infinity;
  for (const s of PATHS) d = Math.min(d, distToSegment(x, z, s));
  return d;
}

/** Point in a building's own frame (x across the front, z towards the plaza). */
export function toLocal(z: Zone, x: number, zz: number): [number, number] {
  const yaw = yawOf(z);
  const dx = x - z.pos[0];
  const dz = zz - z.pos[1];
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [dx * c - dz * s, dx * s + dz * c];
}

export function fromLocal(z: Zone, lx: number, lz: number): [number, number] {
  const yaw = yawOf(z);
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [z.pos[0] + lx * c + lz * s, z.pos[1] - lx * s + lz * c];
}

/** Distance outside the building footprint (negative = inside). */
export function buildingDistance(z: Zone, x: number, zz: number) {
  const [lx, lz] = toLocal(z, x, zz);
  const qx = Math.abs(lx) - z.size[0] / 2;
  const qz = Math.abs(lz) - z.size[2] / 2;
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0);
}

export function nearestBuildingDistance(x: number, z: number) {
  let d = Infinity;
  for (const zn of ZONES) d = Math.min(d, buildingDistance(zn, x, z));
  return d;
}

/** 1 where the ground must be perfectly flat (plaza, walkways, building pads), 0 in open nature. */
export function flatness(x: number, z: number) {
  const r = Math.hypot(x, z);
  const plaza = 1 - smoothstep(PLAZA_R + 0.5, PLAZA_R + 3, r);
  const path = 1 - smoothstep(PATH_W / 2 + 0.3, PATH_W / 2 + 2.5, distToPath(x, z));
  const pad = 1 - smoothstep(1.2, 4.5, nearestBuildingDistance(x, z));
  return Math.max(plaza, path, pad);
}

/** 0 on the lawn, 1 on the beach and under water. */
export function beachMask(x: number, z: number) {
  const r = Math.hypot(x, z);
  const s = shoreR(Math.atan2(z, x));
  return smoothstep(s - 7, s - 4.5, r);
}

export function heightAt(x: number, z: number) {
  const r = Math.hypot(x, z);
  const shore = shoreR(Math.atan2(z, x));
  const lawn = (fbm(x * 0.055 + 10, z * 0.055 - 4) - 0.5) * 0.7;
  const hills = smoothstep(24, 31, r) * Math.pow(fbm(x * 0.08 - 3, z * 0.08 + 7), 1.5) * 4.2;
  const land = (lawn + hills) * (1 - flatness(x, z));
  // beach profile: dry sand gently slopes into the sea, then the seabed drops away
  const beach = r < shore ? lerp(0.05, WATER_Y - 0.35, smoothstep(shore - 5.5, shore, r)) : WATER_Y - 0.35 - Math.min(5.5, (r - shore) * 0.32);
  return lerp(land, beach, beachMask(x, z));
}

/** Simple circles Phemelo can't walk through (trees, lamp posts), filled in by the scenery. */
export const obstacles: { x: number; z: number; r: number }[] = [];
