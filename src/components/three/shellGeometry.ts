import * as THREE from 'three';

import { SHELL_ARC, SHELL_OUTLINE, WALL_SEGMENTS } from '@/lib/floorplan';
import type { Vec2 } from '@/lib/types';

/**
 * Model space is metres, x east, y SOUTH (the plan's y-down frame). The scene
 * maps that to three.js as x -> x, y -> z, up -> +y.
 *
 * A plan rotation of `deg` (clockwise on screen, y down) is therefore a three
 * rotation of `-deg` about +y. That single sign is the whole conversion; it is
 * derived once here and used everywhere rather than guessed per component.
 */
export const planAngleToYaw = (deg: number) => (-deg * Math.PI) / 180;

/** Yaw that aligns a mesh's local +x with the direction a -> b. */
export function segmentYaw(a: Vec2, b: Vec2): number {
  return -Math.atan2(b.y - a.y, b.x - a.x);
}

export interface WallPanel {
  id: string;
  kind: 'glazing' | 'solid' | 'shopfront';
  a: Vec2;
  b: Vec2;
  length: number;
  /** Midpoint, model space. */
  mid: Vec2;
  yaw: number;
}

function panel(
  id: string,
  kind: WallPanel['kind'],
  a: Vec2,
  b: Vec2,
): WallPanel {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  return {
    id,
    kind,
    a,
    b,
    length,
    mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    yaw: segmentYaw(a, b),
  };
}

/**
 * Every wall as a straight panel.
 *
 * The straight runs come from WALL_SEGMENTS, which already carries the
 * landlord's glazing/solid/shopfront classification. The curved shop-front
 * corner is not in that list — it lives in SHELL_ARC — so it is rebuilt here
 * from the tessellated outline vertices that span it, and is glazing.
 */
export function wallPanels(): WallPanel[] {
  const panels = WALL_SEGMENTS.map((s) => panel(s.id, s.kind, s.a, s.b));

  // The arc runs from SHELL_ARC.start to SHELL_ARC.end; SHELL_OUTLINE carries
  // it as consecutive vertices between those two points.
  const near = (p: Vec2, q: Vec2) =>
    Math.abs(p.x - q.x) < 1e-6 && Math.abs(p.y - q.y) < 1e-6;
  const first = SHELL_OUTLINE.findIndex((p) => near(p, SHELL_ARC.start));
  const last = SHELL_OUTLINE.findIndex((p) => near(p, SHELL_ARC.end));
  if (first >= 0 && last > first) {
    for (let i = first; i < last; i++) {
      panels.push(
        panel(`arc-${i}`, 'glazing', SHELL_OUTLINE[i], SHELL_OUTLINE[i + 1]),
      );
    }
  }

  return panels;
}

/**
 * The shell footprint as a horizontal geometry at y = 0.
 *
 * THREE.Shape is authored in its own xy plane; rotating +90 degrees about x
 * sends (x, y) to (x, 0, y), which is exactly the model-to-scene mapping, so
 * the polygon needs no per-vertex conversion.
 */
export function floorGeometry(): THREE.ShapeGeometry {
  const shape = new THREE.Shape();
  SHELL_OUTLINE.forEach((p, i) => {
    if (i === 0) shape.moveTo(p.x, p.y);
    else shape.lineTo(p.x, p.y);
  });
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(Math.PI / 2);
  return geometry;
}
