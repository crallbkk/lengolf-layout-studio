import {
  COLUMNS,
  FIXED_OBSTACLES,
  RE_ENTRANT_CORNER_M,
  SHELL_OUTLINE,
  type Vec2,
} from './floorplan';
import { CATALOG, isBay } from './catalog';
import { VOLUMES } from './volume';
import type { PlacedObject, Settings, Warning } from './types';
import {
  bounds,
  convexSeparation,
  corners,
  pointInPolygon,
  pointSegmentDistance,
  rectPolygon,
  segmentSegmentDistance,
  segmentsIntersect,
} from './geometry';

type AABB = ReturnType<typeof bounds>;

/**
 * Gap between two AABBs along their most separated axis. Because an axis gap
 * is a lower bound on true distance, `aabbGap(a, b) > t` PROVES the true
 * distance exceeds t — which is all the pair loop needs to skip the exact
 * (and much more expensive) SAT + edge-distance work for far-apart pairs.
 */
function aabbGap(a: AABB, b: AABB): number {
  const gx = Math.max(a.minX - b.maxX, b.minX - a.maxX);
  const gy = Math.max(a.minY - b.maxY, b.minY - a.maxY);
  return Math.max(gx, gy);
}

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
 * CIRCUMSCRIBED about the circle (radius r / cos(pi/16)), not inscribed: an
 * inscribed polygon understates the footprint by the sagitta, 6.7 mm at
 * r = 350 mm, silently accepting real clashes that deep. Circumscribed
 * over-covers by at most ~6.9 mm at the vertices, which errs on the safe
 * side — the only acceptable direction for a structural clash.
 */
const COLUMN_POLYS = COLUMNS.map((c) => {
  const r = c.size / 2;
  if (c.shape === 'circle') {
    const SIDES = 16;
    const R = r / Math.cos(Math.PI / SIDES);
    const poly: Vec2[] = [];
    for (let i = 0; i < SIDES; i++) {
      const a = (i / SIDES) * Math.PI * 2;
      poly.push({
        x: c.center.x + R * Math.cos(a),
        y: c.center.y + R * Math.sin(a),
      });
    }
    return { id: c.id, poly, box: bounds(poly) };
  }
  const poly = rectPolygon(c.center.x - r, c.center.y - r, c.size, c.size);
  return { id: c.id, poly, box: bounds(poly) };
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

/**
 * Gap to the nearest shell wall the object is NOT touching, in metres.
 *
 * Evaluated per shell edge, not as one global minimum: a bay flush against the
 * rear wall has a global minimum of zero, and a single-minimum version let that
 * zero suppress the sliver warning against every OTHER wall — a bay flush to
 * the rear with a 0.5 m dead strip to the side wall reported nothing, which is
 * exactly the strip this rule exists to catch. Touching edges (<= EPS) are
 * excluded per edge instead of short-circuiting the whole test.
 */
function nearestNonTouchingWallGap(poly: Vec2[]): number {
  let min = Infinity;
  for (const [c, d] of SHELL_EDGES) {
    let edgeMin = Infinity;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const dd = segmentSegmentDistance(a, b, c, d);
      if (dd < edgeMin) edgeMin = dd;
    }
    if (edgeMin > EPS && edgeMin < min) min = edgeMin;
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
  const boxes = new Map<string, AABB>();
  for (const o of objects) {
    const poly = corners(o);
    polys.set(o.id, poly);
    boxes.set(o.id, bounds(poly));
  }

  /* ---- object vs object ---- */
  for (let i = 0; i < objects.length; i++) {
    for (let j = i + 1; j < objects.length; j++) {
      const a = objects[i];
      const b = objects[j];

      /**
       * A floor finish is a surface, and things stand on surfaces. The cart
       * installation stands on the putting green by design, and cocktail
       * tables stand on the event floor; calling either an overlap would be
       * calling the concept an error.
       *
       * Exactly one side, though. Two floor finishes overlapping each other IS
       * a conflict — turf and tile cannot both be the floor.
       */
      const aFloor = VOLUMES[a.type].mass === 'floor-finish';
      const bFloor = VOLUMES[b.type].mass === 'floor-finish';
      if (aFloor !== bFloor) continue;

      // Far-apart pairs can neither overlap nor violate clearance; prove it
      // with two subtractions instead of the full SAT + edge-distance pass.
      if (aabbGap(boxes.get(a.id)!, boxes.get(b.id)!) > clearance) continue;

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
      const gap = nearestNonTouchingWallGap(poly);
      if (gap < clearance) {
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
     *
     * A floor finish is the exception, and not a grudging one. Turf or tile is
     * laid AROUND a column base, not through it, and the concept deliberately
     * wraps the putting green around the round column so the cart installation
     * can stand on it. Flagging that would be flagging the design, which is how
     * a warning list trains people to stop reading warnings.
     */
    if (VOLUMES[o.type].mass !== 'floor-finish') {
      const box = boxes.get(o.id)!;
      for (const col of COLUMN_POLYS) {
        // Only overlap matters here, so AABB-disjoint columns are skipped
        // before any SAT work — most objects are far from most columns.
        if (aabbGap(box, col.box) > EPS) continue;
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

/**
 * Last computed result, keyed on identity of the inputs.
 *
 * StatsBar and WarningsPanel each need the warning list and each had their own
 * useMemo, so every drag frame ran the whole O(n^2) pass twice. Zustand hands
 * both the same `objects` and `settings` references, so a one-entry identity
 * cache collapses that to once — and any additional consumer added later is
 * free rather than another full pass.
 */
let cacheObjects: PlacedObject[] | null = null;
let cacheSettings: Settings | null = null;
let cacheResult: Warning[] = [];

export function computeWarningsCached(
  objects: PlacedObject[],
  settings: Settings,
): Warning[] {
  if (objects === cacheObjects && settings === cacheSettings) return cacheResult;
  cacheResult = computeWarnings(objects, settings);
  cacheObjects = objects;
  cacheSettings = settings;
  return cacheResult;
}
