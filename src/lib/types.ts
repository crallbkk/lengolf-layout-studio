import type { Vec2 } from './floorplan';

export type { Vec2 };

/**
 * Every placeable thing is an oriented rectangle. Keeping a single primitive
 * (rather than per-type shapes) is what makes the transform + collision layer
 * small enough to be provably correct.
 */
export type ObjectKind =
  | 'social-bay'
  | 'ai-bay'
  | 'vip-bay'
  | 'putting-green'
  | 'event-floor'
  | 'bar'
  | 'lounge'
  | 'lockers'
  | 'pantry'
  | 'service-band'
  | 'store'
  | 'cart-pillar'
  | 'movable-wall'
  | 'generic';

export interface PlacedObject {
  id: string;
  type: ObjectKind;
  label: string;
  /** Centre of the rectangle, in metres, model space (y DOWN). */
  cx: number;
  cy: number;
  /** Extents in metres, measured along the object's own local axes. */
  w: number;
  d: number;
  /** Degrees, clockwise on screen (consistent with the y-down frame). */
  rotation: number;
  locked: boolean;
  notes: string;
  /**
   * Bays only: depth of the seating/safety strip drawn at the front of the bay.
   * Rendered as an internal split line; does not affect collision.
   */
  seatingDepth?: number;
}

export interface TypeSpec {
  kind: ObjectKind;
  label: string;
  /** Muted fill + a stronger stroke of the same hue. */
  fill: string;
  stroke: string;
  text: string;
  /** Editable in the side panel. Going below these raises a soft warning. */
  minW: number;
  minD: number;
  /** Used when adding a fresh instance. */
  defaultW: number;
  defaultD: number;
  defaultSeatingDepth?: number;
  /** Rough simultaneous players this type contributes to the capacity estimate. */
  capacity: number;
  /**
   * "This type needs swing clearance." True for hitting bays only.
   *
   * The clearance rule fires between two objects only when BOTH sides set this,
   * and against walls only for these types. That is deliberately narrow: an
   * earlier, broader version (any bay vs any zone) buried the concept layout
   * under 29 warnings for what were simply its normal aisles, which is exactly
   * how a warning system trains people to ignore it.
   *
   * Flip this on for another type if the team decides it also needs protecting.
   */
  requiresClearance: boolean;
}

export interface Settings {
  /** Translation snap, in millimetres. */
  gridSnapMm: number;
  snapEnabled: boolean;
  /** Rotation snap in degrees, applied when angle snapping is on. */
  angleSnapDeg: number;
  angleSnapEnabled: boolean;
  /** Required clear gap between objects, and object-to-wall, in metres. */
  clearanceM: number;
  showGrid: boolean;
  showClearance: boolean;
}

export type WarningSeverity = 'hard' | 'soft';

export interface Warning {
  id: string;
  severity: WarningSeverity;
  /** Object ids implicated. Length 1 for shell/obstacle violations. */
  objectIds: string[];
  message: string;
}

export interface MeasureState {
  active: boolean;
  /** Committed points, metres. */
  points: Vec2[];
  /** Live cursor position while measuring, metres. */
  cursor: Vec2 | null;
}

/** The slice that is persisted, shared by URL, and pushed onto the undo stack. */
export interface LayoutSnapshot {
  objects: PlacedObject[];
  typeOverrides: Partial<Record<ObjectKind, Pick<TypeSpec, 'minW' | 'minD'>>>;
  settings: Settings;
  /**
   * Which published layout this copy started from. Absent on anything saved
   * before seed versioning existed, which is treated as "older than current".
   */
  seedVersion?: number;
}
