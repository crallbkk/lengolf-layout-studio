import { LEASE_AREA_M2, SHELL_AREA_M2, type Vec2 } from './floorplan';
import { CATALOG } from './catalog';
import { corners, polygonArea } from './geometry';
import type { PlacedObject, Warning } from './types';

/**
 * Pure stats layer. No React, no store, no DOM — everything here is a function
 * of (objects, warnings), so it can be called from a render pass on every
 * pointer move during a drag without any bookkeeping.
 */

/**
 * Tolerance for the on-edge tests in the clipper. Coordinates are metres at a
 * magnitude of ~30, so 1e-9 sits comfortably above float noise and far below
 * anything a user could express (the finest snap is 1 mm = 1e-3).
 */
const EPS = 1e-9;

/** Signed shoelace area — sign carries the winding, unlike `polygonArea`. */
function signedArea(poly: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/**
 * Sutherland–Hodgman assumes a consistently wound clip polygon. `corners()`
 * already returns positive-signed-area rings, but normalising here means the
 * clipper is correct for any convex input a caller hands it.
 */
function toPositiveWinding(poly: Vec2[]): Vec2[] {
  return signedArea(poly) < 0 ? [...poly].reverse() : poly;
}

/** > 0 when p is to the left of a->b, i.e. inside a positively wound ring. */
function side(a: Vec2, b: Vec2, p: Vec2): number {
  return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
}

/** Intersection of the segment p->q with the infinite line a->b. */
function lineIntersection(p: Vec2, q: Vec2, a: Vec2, b: Vec2): Vec2 {
  const rx = q.x - p.x;
  const ry = q.y - p.y;
  const sx = b.x - a.x;
  const sy = b.y - a.y;
  const denom = rx * sy - ry * sx;
  // Parallel: the crossing is degenerate, so clamp to the endpoint. This only
  // happens for exactly-collinear edges, where the choice is area-neutral.
  if (Math.abs(denom) < EPS) return q;
  const t = ((a.x - p.x) * sy - (a.y - p.y) * sx) / denom;
  return { x: p.x + t * rx, y: p.y + t * ry };
}

/**
 * Sutherland–Hodgman convex polygon clipping. Exact for convex subject and
 * convex clip polygons, which is all we ever have here (every placed object is
 * an oriented box). Returns the intersection ring, or [] when they are
 * disjoint. Points lying exactly on a clip edge count as inside, so two
 * identical boxes clip to their full area rather than to nothing.
 */
export function clipPolygon(subject: Vec2[], clip: Vec2[]): Vec2[] {
  if (subject.length < 3 || clip.length < 3) return [];

  let output = toPositiveWinding(subject);
  const clipRing = toPositiveWinding(clip);

  for (let i = 0; i < clipRing.length && output.length > 0; i++) {
    const a = clipRing[i];
    const b = clipRing[(i + 1) % clipRing.length];
    const input = output;
    output = [];

    for (let j = 0; j < input.length; j++) {
      const current = input[j];
      const previous = input[(j + input.length - 1) % input.length];
      const currentInside = side(a, b, current) >= -EPS;
      const previousInside = side(a, b, previous) >= -EPS;

      if (currentInside) {
        if (!previousInside) output.push(lineIntersection(previous, current, a, b));
        output.push(current);
      } else if (previousInside) {
        output.push(lineIntersection(previous, current, a, b));
      }
    }
  }

  return output;
}

/** Intersection area of two convex rings, m². 0 when they do not overlap. */
export function intersectionArea(a: Vec2[], b: Vec2[]): number {
  const clipped = clipPolygon(a, b);
  return clipped.length < 3 ? 0 : polygonArea(clipped);
}

/**
 * Sum of every pairwise intersection area, m².
 *
 * Note this is a sum over PAIRS: a region covered by three objects at once
 * contributes three times. That is deliberate — it is exactly the quantity by
 * which the naive `occupiedM2` sum is inflated, which is what makes it useful
 * as a correction figure rather than as a true union measurement.
 */
export function totalOverlapArea(objects: PlacedObject[]): number {
  const polys = objects.map((o) => corners(o));
  let total = 0;
  for (let i = 0; i < polys.length; i++) {
    for (let j = i + 1; j < polys.length; j++) {
      total += intersectionArea(polys[i], polys[j]);
    }
  }
  return total;
}

export interface LayoutStats {
  /** Traced shell polygon area, m². The arithmetic source of truth. */
  totalAreaM2: number;
  /** The landlord's printed leasable figure, m². Reference only. */
  leaseAreaM2: number;
  /**
   * Naive sum of w × d over every object, m².
   *
   * This DOUBLE-COUNTS any region where objects overlap: two boxes sitting on
   * top of each other report their full areas twice over. `overlapAreaM2`
   * quantifies exactly that inflation, so `occupiedM2 - overlapAreaM2` is the
   * honest footprint whenever no more than two objects stack in one place.
   */
  occupiedM2: number;
  /**
   * totalAreaM2 - occupiedM2, m². May be NEGATIVE, and is deliberately not
   * clamped: a negative free area is real information that the layout is
   * over-committed (or double-counted, see overlapAreaM2).
   */
  freeM2: number;
  /** occupied / total × 100. Can exceed 100 for the same reason. */
  utilisationPct: number;
  socialBays: number;
  aiBays: number;
  vipBays: number;
  hardWarnings: number;
  softWarnings: number;
  /** Sum of per-type nominal capacity. A rough planning figure, not a survey. */
  capacityEstimate: number;
  /** Total pairwise overlapping area, m². See totalOverlapArea. */
  overlapAreaM2: number;
}

export function computeStats(
  objects: PlacedObject[],
  warnings: Warning[],
): LayoutStats {
  let occupiedM2 = 0;
  let socialBays = 0;
  let aiBays = 0;
  let vipBays = 0;
  let capacityEstimate = 0;

  for (const o of objects) {
    occupiedM2 += o.w * o.d;
    capacityEstimate += CATALOG[o.type].capacity;
    if (o.type === 'social-bay') socialBays++;
    else if (o.type === 'ai-bay') aiBays++;
    else if (o.type === 'vip-bay') vipBays++;
  }

  let hardWarnings = 0;
  let softWarnings = 0;
  for (const w of warnings) {
    if (w.severity === 'hard') hardWarnings++;
    else softWarnings++;
  }

  const totalAreaM2 = SHELL_AREA_M2;

  return {
    totalAreaM2,
    leaseAreaM2: LEASE_AREA_M2,
    occupiedM2,
    freeM2: totalAreaM2 - occupiedM2,
    utilisationPct: totalAreaM2 > 0 ? (occupiedM2 / totalAreaM2) * 100 : 0,
    socialBays,
    aiBays,
    vipBays,
    hardWarnings,
    softWarnings,
    capacityEstimate,
    overlapAreaM2: totalOverlapArea(objects),
  };
}
