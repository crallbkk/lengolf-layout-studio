import { describe, expect, it } from 'vitest';

import {
  SHELL_ARC,
  SHELL_AREA_M2,
  SHELL_OUTLINE,
  RE_ENTRANT_CORNER_M,
} from '../floorplan';
import {
  convexSeparation,
  corners,
  pointInPolygon,
  polygonArea,
  rectPolygon,
  rotate,
  segmentSegmentDistance,
  snap,
  toLocal,
  toWorld,
} from '../geometry';

const box = (cx: number, cy: number, w: number, d: number, rotation = 0) => ({
  cx,
  cy,
  w,
  d,
  rotation,
});

const near = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) < tol;

describe('floor plan geometry', () => {
  it('reproduces the traced unit area', () => {
    expect(polygonArea(SHELL_OUTLINE)).toBeCloseTo(SHELL_AREA_M2, 1);
    // Sanity band against the landlord's 355 m2 figure.
    expect(SHELL_AREA_M2).toBeGreaterThan(350);
    expect(SHELL_AREA_M2).toBeLessThan(360);
  });

  it('places the shop-front arc centre where the trace implies', () => {
    expect(SHELL_ARC.center.x).toBeCloseTo(10.5, 3);
    expect(SHELL_ARC.center.y).toBeCloseTo(1.788, 3);
    expect(SHELL_ARC.sweepDeg).toBeCloseTo(39.99, 1);
  });

  it('has a simple outline with no duplicated vertices', () => {
    for (let i = 0; i < SHELL_OUTLINE.length; i++) {
      const a = SHELL_OUTLINE[i];
      const b = SHELL_OUTLINE[(i + 1) % SHELL_OUTLINE.length];
      expect(Number.isFinite(a.x) && Number.isFinite(a.y)).toBe(true);
      expect(near(a.x, b.x) && near(a.y, b.y)).toBe(false);
    }
  });

  it('classifies points against the footprint, including the 24.37 notch', () => {
    // Deep inside the main hall.
    expect(pointInPolygon({ x: 5, y: 8 }, SHELL_OUTLINE)).toBe(true);
    // Inside the rear-right store bay.
    expect(pointInPolygon({ x: 27, y: 15 }, SHELL_OUTLINE)).toBe(true);
    // The notch: left of the re-entrant corner but below the rear wall is OUT.
    expect(pointInPolygon({ x: 10, y: 15 }, SHELL_OUTLINE)).toBe(false);
    // Well outside on every side.
    expect(pointInPolygon({ x: -1, y: 5 }, SHELL_OUTLINE)).toBe(false);
    expect(pointInPolygon({ x: 35, y: 5 }, SHELL_OUTLINE)).toBe(false);
    expect(pointInPolygon({ x: 5, y: -1 }, SHELL_OUTLINE)).toBe(false);
  });

  it('keeps the re-entrant corner on the boundary', () => {
    const justInside = { x: RE_ENTRANT_CORNER_M.x - 0.05, y: RE_ENTRANT_CORNER_M.y - 0.05 };
    const justOutside = { x: RE_ENTRANT_CORNER_M.x - 0.05, y: RE_ENTRANT_CORNER_M.y + 0.05 };
    expect(pointInPolygon(justInside, SHELL_OUTLINE)).toBe(true);
    expect(pointInPolygon(justOutside, SHELL_OUTLINE)).toBe(false);
  });
});

describe('rotation and local frames', () => {
  it('rotates clockwise on screen in the y-down frame', () => {
    // +x rotated by +90 must land on +y (i.e. downward on screen).
    const r = rotate({ x: 1, y: 0 }, 90);
    expect(r.x).toBeCloseTo(0, 10);
    expect(r.y).toBeCloseTo(1, 10);
  });

  it('round-trips world <-> local for a rotated object', () => {
    const o = box(10, 5, 4, 6, 37);
    const p = { x: 12.3, y: 7.1 };
    const back = toWorld(toLocal(p, o), o);
    expect(back.x).toBeCloseTo(p.x, 10);
    expect(back.y).toBeCloseTo(p.y, 10);
  });

  it('produces corners consistent with translate+rotate rendering', () => {
    // The canvas renders <g translate(cx,cy) rotate(deg)><rect -w/2 -d/2 w d>.
    // corners() must agree with that exactly, or hit-testing drifts from paint.
    const o = box(3, 4, 2, 6, 30);
    const c = corners(o);
    expect(c).toHaveLength(4);
    // Centroid of the corners is the object centre.
    const mx = c.reduce((s, p) => s + p.x, 0) / 4;
    const my = c.reduce((s, p) => s + p.y, 0) / 4;
    expect(mx).toBeCloseTo(3, 10);
    expect(my).toBeCloseTo(4, 10);
    // Area is preserved under rotation.
    expect(polygonArea(c)).toBeCloseTo(12, 10);
    // First corner is local (-w/2,-d/2) rotated then translated.
    const expected = rotate({ x: -1, y: -3 }, 30);
    expect(c[0].x).toBeCloseTo(expected.x + 3, 10);
    expect(c[0].y).toBeCloseTo(expected.y + 4, 10);
  });
});

describe('convexSeparation', () => {
  it('returns a real positive gap in metres when disjoint', () => {
    const a = corners(box(0, 0, 2, 2));
    const b = corners(box(5, 0, 2, 2));
    // Boxes span x -1..1 and 4..6, so the gap is 3 m.
    expect(convexSeparation(a, b)).toBeCloseTo(3, 10);
  });

  it('returns negative penetration depth when overlapping', () => {
    const a = corners(box(0, 0, 2, 2));
    const b = corners(box(1.5, 0, 2, 2));
    // Overlap along x is 0.5 m.
    expect(convexSeparation(a, b)).toBeCloseTo(-0.5, 10);
  });

  it('treats touching boxes as separation zero, not an overlap', () => {
    const a = corners(box(0, 0, 2, 2));
    const b = corners(box(2, 0, 2, 2));
    expect(convexSeparation(a, b)).toBeCloseTo(0, 10);
    expect(convexSeparation(a, b) < 0).toBe(false);
  });

  it('detects overlap between rotated boxes that AABBs would get wrong', () => {
    // Two 45-degree diamonds whose bounding boxes overlap but whose bodies do not.
    const a = corners(box(0, 0, 2, 2, 45));
    const b = corners(box(2.2, 2.2, 2, 2, 45));
    expect(convexSeparation(a, b)).toBeGreaterThan(0);

    // Same centres, closer together: now genuinely overlapping.
    const c = corners(box(1.0, 1.0, 2, 2, 45));
    expect(convexSeparation(a, c)).toBeLessThan(0);
  });

  it('is symmetric', () => {
    const a = corners(box(1, 2, 3, 4, 17));
    const b = corners(box(3, 3, 2, 2, -40));
    expect(convexSeparation(a, b)).toBeCloseTo(convexSeparation(b, a), 10);
  });
});

describe('segment distance', () => {
  it('is zero for crossing segments', () => {
    expect(
      segmentSegmentDistance({ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }, { x: 2, y: 0 }),
    ).toBe(0);
  });

  it('measures the perpendicular gap for parallel segments', () => {
    expect(
      segmentSegmentDistance({ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1.5 }, { x: 2, y: 1.5 }),
    ).toBeCloseTo(1.5, 10);
  });

  it('measures endpoint distance for skewed, non-overlapping segments', () => {
    expect(
      segmentSegmentDistance({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 4, y: 0 }, { x: 5, y: 0 }),
    ).toBeCloseTo(3, 10);
  });
});

describe('helpers', () => {
  it('snaps to a metre step', () => {
    expect(snap(4.53, 0.1)).toBeCloseTo(4.5, 10);
    expect(snap(4.56, 0.1)).toBeCloseTo(4.6, 10);
    expect(snap(-0.04, 0.1)).toBeCloseTo(-0, 10);
    // A zero or negative step must be a no-op, never a divide-by-zero.
    expect(snap(4.53, 0)).toBe(4.53);
  });

  it('builds a rect polygon with the right area and winding', () => {
    const p = rectPolygon(1, 2, 3, 4);
    expect(polygonArea(p)).toBeCloseTo(12, 10);
  });
});

describe('convexSeparation reports the TRUE distance when disjoint', () => {
  /**
   * Regression: the old implementation returned the first positive SAT axis
   * gap. An axis gap is only a LOWER bound on distance for disjoint convex
   * polygons (the vertex-vertex closest-feature case has no face-normal
   * witness), so it under-reported gaps and — because of the early exit — gave
   * different answers depending on argument order.
   */
  it('matches the true diagonal distance, not an axis projection', () => {
    // Spans x 0..4.5, y 0..6.3 and x 5.2..9.7, y 7.0..13.3.
    const a = corners(box(2.25, 3.15, 4.5, 6.3));
    const b = corners(box(7.45, 10.15, 4.5, 6.3));
    // Closest features are the corners (4.5, 6.3) and (5.2, 7.0).
    const expected = Math.hypot(5.2 - 4.5, 7.0 - 6.3);
    expect(convexSeparation(a, b)).toBeCloseTo(expected, 9);
    // The y-axis projection gap alone is 0.7 — the old wrong answer.
    expect(convexSeparation(a, b)).toBeGreaterThan(0.7);
  });

  it('is order-independent for rotated boxes', () => {
    const p = corners(box(0, 0, 4.5, 6.3, 30));
    const q = corners(box(6.2, 4.6, 4.5, 6.3, 0));
    const ab = convexSeparation(p, q);
    const ba = convexSeparation(q, p);
    expect(ab).toBeCloseTo(ba, 9);
    expect(ab).toBeGreaterThan(1.5);
  });

  it('still reports exact penetration depth when overlapping', () => {
    const a = corners(box(0, 0, 2, 2));
    const b = corners(box(1.5, 0, 2, 2));
    expect(convexSeparation(a, b)).toBeCloseTo(-0.5, 10);
  });

  it('still treats touching as separation zero', () => {
    const a = corners(box(0, 0, 2, 2));
    const b = corners(box(2, 0, 2, 2));
    expect(convexSeparation(a, b)).toBeCloseTo(0, 10);
  });
});
