import type { Vec2 } from './floorplan';
import type { PlacedObject } from './types';

/**
 * All geometry is in metres, model space, y DOWN. Rotation is degrees measured
 * clockwise on screen. In a y-down frame the standard CCW rotation matrix
 * already produces clockwise-on-screen motion, so no sign flips are needed
 * anywhere — this is the single reason the model keeps y down.
 */

export const deg2rad = (d: number) => (d * Math.PI) / 180;

export function rotate(p: Vec2, angleDeg: number): Vec2 {
  const a = deg2rad(angleDeg);
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

/** The four corners of an object, world space, in consistent winding order. */
export function corners(o: Pick<PlacedObject, 'cx' | 'cy' | 'w' | 'd' | 'rotation'>): Vec2[] {
  const hw = o.w / 2;
  const hd = o.d / 2;
  const local: Vec2[] = [
    { x: -hw, y: -hd },
    { x: hw, y: -hd },
    { x: hw, y: hd },
    { x: -hw, y: hd },
  ];
  return local.map((p) => {
    const r = rotate(p, o.rotation);
    return { x: r.x + o.cx, y: r.y + o.cy };
  });
}

/** World point -> the object's local (unrotated, centre-origin) frame. */
export function toLocal(
  p: Vec2,
  o: Pick<PlacedObject, 'cx' | 'cy' | 'rotation'>,
): Vec2 {
  return rotate({ x: p.x - o.cx, y: p.y - o.cy }, -o.rotation);
}

/** Object local frame -> world. */
export function toWorld(
  p: Vec2,
  o: Pick<PlacedObject, 'cx' | 'cy' | 'rotation'>,
): Vec2 {
  const r = rotate(p, o.rotation);
  return { x: r.x + o.cx, y: r.y + o.cy };
}

export function polygonArea(poly: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

export function pointInPolygon(pt: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    const straddles = a.y > pt.y !== b.y > pt.y;
    if (straddles && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Shortest distance from a point to the segment ab. */
export function pointSegmentDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const len2 = vx * vx + vy * vy;
  if (len2 === 0) return dist(p, a);
  let t = ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2;
  t = Math.max(0, Math.min(1, t));
  return dist(p, { x: a.x + t * vx, y: a.y + t * vy });
}

export function segmentsIntersect(p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2): boolean {
  const d = (a: Vec2, b: Vec2, c: Vec2) =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const d1 = d(p3, p4, p1);
  const d2 = d(p3, p4, p2);
  const d3 = d(p1, p2, p3);
  const d4 = d(p1, p2, p4);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  return false;
}

/** Shortest distance between two segments (0 when they cross). */
export function segmentSegmentDistance(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): number {
  if (segmentsIntersect(a1, a2, b1, b2)) return 0;
  return Math.min(
    pointSegmentDistance(a1, b1, b2),
    pointSegmentDistance(a2, b1, b2),
    pointSegmentDistance(b1, a1, a2),
    pointSegmentDistance(b2, a1, a2),
  );
}

/* ------------------------------------------------------------------ */
/* Separating Axis Theorem for two convex polygons (our oriented boxes) */
/* ------------------------------------------------------------------ */

function axesOf(poly: Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const edge = { x: b.x - a.x, y: b.y - a.y };
    const len = Math.hypot(edge.x, edge.y);
    if (len === 0) continue;
    // Normal, normalised, so overlap depths come out in real metres.
    out.push({ x: -edge.y / len, y: edge.x / len });
  }
  return out;
}

function project(poly: Vec2[], axis: Vec2): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const p of poly) {
    const v = p.x * axis.x + p.y * axis.y;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max };
}

/**
 * Signed separation between two convex polygons along their best axis.
 * Negative => overlapping, and the magnitude is the penetration depth.
 * Positive => the size of the real gap between them, in metres.
 *
 * One function answers both "do these collide?" and "is the clearance
 * satisfied?", which keeps the two checks from ever disagreeing.
 */
export function convexSeparation(a: Vec2[], b: Vec2[]): number {
  const axes = [...axesOf(a), ...axesOf(b)];
  let best = -Infinity;
  for (const axis of axes) {
    const pa = project(a, axis);
    const pb = project(b, axis);
    // Gap along this axis; positive means disjoint on this axis.
    const gap = Math.max(pa.min - pb.max, pb.min - pa.max);
    if (gap > best) best = gap;
    if (gap > 0) return gap; // separated: this axis proves it, stop early
  }
  return best;
}

export function polygonsOverlap(a: Vec2[], b: Vec2[]): boolean {
  return convexSeparation(a, b) < 0;
}

/** Axis-aligned bounds, handy for viewport fitting and cheap rejection. */
export function bounds(poly: Vec2[]) {
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

export function rectPolygon(x: number, y: number, w: number, d: number): Vec2[] {
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + d },
    { x, y: y + d },
  ];
}

export function snap(value: number, stepM: number): number {
  if (stepM <= 0) return value;
  return Math.round(value / stepM) * stepM;
}
