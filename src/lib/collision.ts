import {
  COLUMNS,
  FIXED_OBSTACLES,
  RE_ENTRANT_CORNER_M,
  SHELL_OUTLINE,
  type Vec2,
} from './floorplan';
import { CATALOG, isBay } from './catalog';
import type { PlacedObject, Settings, Warning } from './types';
import {
  convexSeparation,
  corners,
  pointInPolygon,
  pointSegmentDistance,
  rectPolygon,
  segmentSegmentDistance,
  segmentsIntersect,
} from './geometry';

/**
 * 1 mm. Below any tolerance that means anything on a floor plan, but far above
 * float noise. Everything here is a *touching* test in disguise, and touching is
 * the normal case in this drawing — bays share dividers and sit flush to walls —
 * so getting this tolerance right is what separates useful warnings from noise.
 */
const EPS = 1e-3;

/** Shell edges as segment pairs, precomputed once. */
const SHELL_EDGES: Array<[Vec2, Vec2]> = SHELL_OUTLINE.map((p, i) => [
  p,
  SHELL_OUTLINE[(i + 1) % SHELL_OUTLINE.length],
]);

const OBSTACLE_POLYS = FIXED_OBSTACLES.map((o) => ({
  id: o.id,
  label: o.label,
  poly: rectPolygon(o.x, o.y, o.w, o.d),
}));

/**
 * Structural columns as convex polygons. Round columns become a 16-gon
 * inscribed in the circle — at a 350 mm radius that understates the true
 * footprint by under 1 mm, which is well inside the tolerance everything else
 * here works to, and it keeps every shape convex so SAT stays valid.
 */
const COLUMN_POLYS = COLUMNS.map((c) => {
  const r = c.size / 2;
  if (c.shape === 'circle') {
    const SIDES = 16;
    const poly: Vec2[] = [];
    for (let i = 0; i < SIDES; i++) {
      const a = (i / SIDES) * Math.PI * 2;
      poly.push({
        x: c.center.x + r * Math.cos(a),
        y: c.center.y + r * Math.sin(a),
      });
    }
    return { id: c.id, poly };
  }
  return {
    id: c.id,
    poly: rectPolygon(c.center.x - r, c.center.y - r, c.size, c.size),
  };
});

function distanceToShellBoundary(p: Vec2): number {
  let min = Infinity;
  for (const [a, b] of SHELL_EDGES) {
    const d = pointSegmentDistance(p, a, b);
    if (d < min) min = d;
    if (min <= EPS) return min;
  }
  return min;
}

/**
 * A point counts as outside only if it is outside AND more than EPS clear of the
 * boundary. Ray casting is undefined for a point lying exactly on an edge, and
 * objects here are routinely placed exactly on walls, so the boundary band must
 * resolve to "inside" rather than to whichever way the parity happens to fall.
 */
function pointEscapes(p: Vec2): boolean {
  if (pointInPolygon(p, SHELL_OUTLINE)) return false;
  return distanceToShellBoundary(p) > EPS;
}

/** Smallest gap from an object's outline to the shell wall, in metres. */
function distanceToShell(poly: Vec2[]): number {
  let min = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    for (const [c, d] of SHELL_EDGES) {
      const dd = segmentSegmentDistance(a, b, c, d);
      if (dd < min) min = dd;
    }
  }
  return min;
}

/** True when any part of the object genuinely escapes the shell footprint. */
function escapesShell(poly: Vec2[]): boolean {
  for (const p of poly) {
    if (pointEscapes(p)) return true;
  }
  /**
   * All corners inside can still hide a violation: a rotated box can cut the
   * corner off the re-entrant notch at 24.370 with both edge endpoints inside.
   * This uses a strict crossing test, so an edge lying flush along a wall — the
   * normal case — is not a crossing.
   */
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    for (const [c, d] of SHELL_EDGES) {
      if (segmentsIntersect(a, b, c, d)) return true;
    }
  }
  return false;
}

const fmt = (n: number) => n.toFixed(2);

/**
 * Full warning pass. Pure, and cheap enough (O(n^2) over tens of objects) to run
 * on every pointer move during a drag, which is what keeps the feedback live.
 */
export function computeWarnings(
  objects: PlacedObject[],
  settings: Settings,
): Warning[] {
  const warnings: Warning[] = [];
  const clearance = settings.clearanceM;

  const polys = new Map<string, Vec2[]>();
  for (const o of objects) polys.set(o.id, corners(o));

  /* ---- object vs object ---- */
  for (let i = 0; i < objects.length; i++) {
    for (let j = i + 1; j < objects.length; j++) {
      const a = objects[i];
      const b = objects[j];
      const sep = convexSeparation(polys.get(a.id)!, polys.get(b.id)!);

      if (sep < -EPS) {
        warnings.push({
          id: `overlap:${a.id}:${b.id}`,
          severity: 'hard',
          objectIds: [a.id, b.id],
          message: `${a.label} overlaps ${b.label} by ${fmt(-sep)} m`,
        });
        continue;
      }

      /**
       * Both sides must need clearance, i.e. bay-to-bay. Widening this to
       * bay-vs-any-zone flags every ordinary aisle in the plan.
       *
       * Also deliberately ignores sep <= EPS: bays in a row share dividers by
       * design. What is worth flagging is a *sliver* — a gap too small to walk
       * through but too big to be a shared face, i.e. dead space nobody can use.
       */
      const wantsClearance =
        CATALOG[a.type].requiresClearance && CATALOG[b.type].requiresClearance;
      if (wantsClearance && sep > EPS && sep < clearance) {
        warnings.push({
          id: `clearance:${a.id}:${b.id}`,
          severity: 'soft',
          objectIds: [a.id, b.id],
          message: `${a.label} to ${b.label} leaves a ${fmt(sep)} m gap — under the ${fmt(clearance)} m clearance rule, and too narrow to use`,
        });
      }
    }
  }

  /* ---- object vs shell, fixed obstacles, and the re-entrant corner ---- */
  for (const o of objects) {
    const poly = polys.get(o.id)!;

    if (escapesShell(poly)) {
      warnings.push({
        id: `outside:${o.id}`,
        severity: 'hard',
        objectIds: [o.id],
        message: `${o.label} extends outside the unit footprint`,
      });
    } else if (CATALOG[o.type].requiresClearance) {
      /**
       * Measured to the shell itself, so it cannot tell whether something is
       * legitimately built in that gap (in the concept, the service band fills
       * the 0.80 m between the VIP bay and the right-hand wall). The message is
       * therefore neutral — it reports the distance rather than declaring the
       * space wasted.
       */
      const gap = distanceToShell(poly);
      if (gap > EPS && gap < clearance) {
        warnings.push({
          id: `wall:${o.id}`,
          severity: 'soft',
          objectIds: [o.id],
          message: `${o.label} sits ${fmt(gap)} m from a wall — under the ${fmt(clearance)} m clearance rule`,
        });
      }
    }

    /**
     * Structural columns are load-bearing and immovable. Unlike a riser, which a
     * back-of-house room can legitimately enclose, you cannot build anything
     * through a column — so this is a hard clash, not a "check the drawing".
     */
    for (const col of COLUMN_POLYS) {
      const sep = convexSeparation(poly, col.poly);
      if (sep < -EPS) {
        warnings.push({
          id: `column:${o.id}:${col.id}`,
          severity: 'hard',
          objectIds: [o.id],
          message: `${o.label} covers structural column ${col.id.replace('col-', '')} by ${fmt(-sep)} m`,
        });
      }
    }

    /**
     * Risers are frequently enclosed inside back-of-house rooms on purpose, so a
     * clash is a "check the builder's drawing" flag rather than an impossibility.
     */
    for (const obs of OBSTACLE_POLYS) {
      if (convexSeparation(poly, obs.poly) < -EPS) {
        warnings.push({
          id: `obstacle:${o.id}:${obs.id}`,
          severity: 'soft',
          objectIds: [o.id],
          message: `${o.label} overlaps the fixed ${obs.label.toLowerCase()} — check the builder's drawing`,
        });
      }
    }

    /**
     * The 24,370 re-entrant corner carries a structural pier. A bay that
     * straddles it is not automatically wrong — the concept VIP does exactly
     * that — but it always needs a human to check the pier, so it is surfaced
     * as a soft warning rather than silently allowed.
     */
    if (isBay(o.type)) {
      const straddles =
        pointInPolygon(RE_ENTRANT_CORNER_M, poly) ||
        Math.min(
          ...poly.map((p, i) =>
            pointSegmentDistance(
              RE_ENTRANT_CORNER_M,
              p,
              poly[(i + 1) % poly.length],
            ),
          ),
        ) < 0.5;

      if (straddles) {
        warnings.push({
          id: `pier:${o.id}`,
          severity: 'soft',
          objectIds: [o.id],
          message: `${o.label} straddles the 24,370 corner — check the structural pier`,
        });
      }
    }
  }

  return warnings;
}

/** Ids with at least one hard warning — used to paint objects red. */
export function hardWarningIds(warnings: Warning[]): Set<string> {
  const s = new Set<string>();
  for (const w of warnings) {
    if (w.severity === 'hard') w.objectIds.forEach((id) => s.add(id));
  }
  return s;
}

export function softWarningIds(warnings: Warning[]): Set<string> {
  const s = new Set<string>();
  for (const w of warnings) {
    if (w.severity === 'soft') w.objectIds.forEach((id) => s.add(id));
  }
  return s;
}
