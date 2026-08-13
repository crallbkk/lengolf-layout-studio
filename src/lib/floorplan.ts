// AUTO-EXTRACTED from lengolf-area.svg (traced One Bangkok R1 plan).
// Source units: millimetres, y-axis DOWN (standard SVG). Output units: METRES,
// origin unchanged at SVG (0,0), y still DOWN. All values are exact traced
// numbers converted by /1000 and rounded to mm precision (3 dp).

export type Vec2 = { x: number; y: number };

/** Outer shell `d` attribute, copied verbatim from the fill="#F9C46B" path. */
export const SHELL_PATH_MM: string =
  'M 0 0 L 10500 0 A 1788 1788 0 0 1 11649 418 L 12383 1780 L 12383 3344 L 19548 3344 L 19548 2933 L 26898 2933 L 26898 3344 L 29190 3344 L 29190 6594 L 29640 6594 L 29640 16919 L 24370 16919 L 24370 13377 L 0 13377 Z';

/**
 * The single arc in the shell (`A 1788 1788 0 0 1` from 10500,0 to 11649,418),
 * converted to metres/degrees. Centre derived via the SVG endpoint-to-centre
 * parameterisation (spec F.6.5) with largeArcFlag=0, sweepFlag=1.
 * Angles are atan2(y - cy, x - cx) in the y-down frame.
 */
export const SHELL_ARC: {
  start: Vec2;
  end: Vec2;
  center: Vec2;
  radius: number;
  startAngleDeg: number;
  endAngleDeg: number;
  sweepDeg: number;
} = {
  start: { x: 10.500, y: 0.000 },
  end: { x: 11.649, y: 0.418 },
  center: { x: 10.500, y: 1.788 },
  radius: 1.788,
  startAngleDeg: -90.002189,
  endAngleDeg: -50.015583,
  sweepDeg: 39.986606,
};

/**
 * Shell as a closed polygon in metres, path order, arc tessellated at
 * <= 2 deg of sweep per segment (21 segments). First vertex is NOT repeated.
 */
export const SHELL_OUTLINE: Vec2[] = [
  { x: 0.000, y: 0.000 },
  { x: 10.500, y: 0.000 },
  { x: 10.559, y: 0.001 },
  { x: 10.619, y: 0.004 },
  { x: 10.678, y: 0.009 },
  { x: 10.737, y: 0.016 },
  { x: 10.796, y: 0.025 },
  { x: 10.854, y: 0.035 },
  { x: 10.912, y: 0.048 },
  { x: 10.970, y: 0.063 },
  { x: 11.027, y: 0.079 },
  { x: 11.083, y: 0.098 },
  { x: 11.139, y: 0.118 },
  { x: 11.194, y: 0.140 },
  { x: 11.249, y: 0.164 },
  { x: 11.302, y: 0.190 },
  { x: 11.355, y: 0.218 },
  { x: 11.407, y: 0.247 },
  { x: 11.457, y: 0.278 },
  { x: 11.507, y: 0.310 },
  { x: 11.555, y: 0.345 },
  { x: 11.603, y: 0.381 },
  { x: 11.649, y: 0.418 },
  { x: 12.383, y: 1.780 },
  { x: 12.383, y: 3.344 },
  { x: 19.548, y: 3.344 },
  { x: 19.548, y: 2.933 },
  { x: 26.898, y: 2.933 },
  { x: 26.898, y: 3.344 },
  { x: 29.190, y: 3.344 },
  { x: 29.190, y: 6.594 },
  { x: 29.640, y: 6.594 },
  { x: 29.640, y: 16.919 },
  { x: 24.370, y: 16.919 },
  { x: 24.370, y: 13.377 },
  { x: 0.000, y: 13.377 },
];

/** Shoelace area of SHELL_OUTLINE, absolute value, m^2. */
export const SHELL_AREA_M2: number = 358.05;

/** Structural grid lines (dashed grid group): vertical lines -> X positions. */
export const COLUMN_GRID_X_M: number[] = [1.585, 10.585, 19.585, 30.385];

/** Structural grid lines (dashed grid group): horizontal lines -> Y positions. */
export const COLUMN_GRID_Y_M: number[] = [5.394, 17.394];

/**
 * Structural columns from the fill="#8a8a8a" group, document order.
 * `center` is the shape centre; `size` is the circle DIAMETER / rect WIDTH.
 */
export const COLUMNS: Array<{
  id: string;
  shape: 'circle' | 'square';
  center: Vec2;
  size: number;
}> = [
  { id: 'col-1', shape: 'circle', center: { x: 1.585, y: 5.394 }, size: 0.700 },
  { id: 'col-2', shape: 'square', center: { x: 10.585, y: 5.150 }, size: 0.700 },
  { id: 'col-3', shape: 'square', center: { x: 19.660, y: 5.320 }, size: 0.700 },
  { id: 'col-4', shape: 'square', center: { x: 1.585, y: 13.377 }, size: 0.700 },
  { id: 'col-5', shape: 'square', center: { x: 10.585, y: 13.377 }, size: 0.700 },
  { id: 'col-6', shape: 'square', center: { x: 19.585, y: 13.377 }, size: 0.700 },
];

/**
 * Straight wall runs, one entry per straight segment, classified by the
 * coloured stroke overlays: #38a8e0 -> glazing, #3a3a3a -> solid,
 * #3f9d3f (dashed) -> shopfront. The glazing arc is omitted here; it is
 * covered by SHELL_ARC.
 */
export const WALL_SEGMENTS: Array<{
  id: string;
  kind: 'glazing' | 'solid' | 'shopfront';
  a: Vec2;
  b: Vec2;
}> = [
  { id: 'glz-front-1', kind: 'glazing', a: { x: 0.000, y: 0.000 }, b: { x: 10.500, y: 0.000 } },
  { id: 'glz-splay-1', kind: 'glazing', a: { x: 11.649, y: 0.418 }, b: { x: 12.383, y: 1.780 } },
  { id: 'glz-rear-1', kind: 'glazing', a: { x: 19.548, y: 2.933 }, b: { x: 26.898, y: 2.933 } },
  { id: 'sol-a-1', kind: 'solid', a: { x: 12.383, y: 1.780 }, b: { x: 12.383, y: 3.344 } },
  { id: 'sol-a-2', kind: 'solid', a: { x: 12.383, y: 3.344 }, b: { x: 19.548, y: 3.344 } },
  { id: 'sol-a-3', kind: 'solid', a: { x: 19.548, y: 3.344 }, b: { x: 19.548, y: 2.933 } },
  { id: 'sol-b-1', kind: 'solid', a: { x: 26.898, y: 2.933 }, b: { x: 26.898, y: 3.344 } },
  { id: 'sol-b-2', kind: 'solid', a: { x: 26.898, y: 3.344 }, b: { x: 29.190, y: 3.344 } },
  { id: 'sol-b-3', kind: 'solid', a: { x: 29.190, y: 3.344 }, b: { x: 29.190, y: 6.594 } },
  { id: 'sol-b-4', kind: 'solid', a: { x: 29.190, y: 6.594 }, b: { x: 29.640, y: 6.594 } },
  { id: 'sol-b-5', kind: 'solid', a: { x: 29.640, y: 6.594 }, b: { x: 29.640, y: 16.919 } },
  { id: 'sol-b-6', kind: 'solid', a: { x: 29.640, y: 16.919 }, b: { x: 24.370, y: 16.919 } },
  { id: 'sol-b-7', kind: 'solid', a: { x: 24.370, y: 16.919 }, b: { x: 24.370, y: 13.377 } },
  { id: 'sol-b-8', kind: 'solid', a: { x: 24.370, y: 13.377 }, b: { x: 0.000, y: 13.377 } },
  { id: 'shf-1', kind: 'shopfront', a: { x: 0.000, y: 0.000 }, b: { x: 0.000, y: 13.377 } },
];

/** Labelled dimensions read off the SVG dimension strings, in metres. */
export const KEY_DIMENSIONS_M = {
  /** 13377: depth of the main hall, shop front (y=0) to rear wall. */
  mainDepth: 13.377,
  /**
   * 10500: width of the straight glazed run along y = 0.
   * NOTE: this is the *front glazing* run, NOT the green "SHOP FRONT BY TENANT"
   * edge, which is the left wall (x = 0, y 0 -> 13.377). Two different things
   * in the source drawing; do not conflate them.
   */
  glazedFrontRunWidth: 10.500,
  /** 29640: overall extent in +x. */
  overallWidth: 29.640,
  /** 16919: overall extent in +y. */
  overallDepth: 16.919,
  /** 24370: x of the re-entrant rear corner. */
  rearRightCornerX: 24.370,
  /** 3542: depth of the rear store bay (16919 - 13377). */
  storeDepth: 3.542,
  /** 10325: length of the right-hand service band (16919 - 6594). */
  serviceBandRight: 10.325,
  /** 1788: radius of the shop-front corner arc. */
  arcRadius: 1.788,
  /** 7165: first solid rear-wall run (19548 - 12383). */
  solidRunFirst: 7.165,
  /** 7350: glazed rear run (26898 - 19548). */
  glazedRunRear: 7.350,
  /** 14515: 12383 to 26898 along the top. */
  topRunToRightSolid: 14.515,
  /** 2292: 26898 to 29190 along the top. */
  topRunRightSolid: 2.292,
  /** 5270: width of the rear store bay (29640 - 24370). */
  storeWidth: 5.270,
  /** 2804: chord/run of the splayed glazing from arc end to 12383,1780. */
  splayGlazingRun: 2.804,
  /** 1564: 12383 wall drop from y=1780 to y=3344. */
  solidReturnDepth: 1.564,
  /** 411: 3344 - 2933 recess depth at the rear glazing. */
  rearGlazingRecess: 0.411,
  /** 5394: grid line 1-B offset from the shop front. */
  gridBOffset: 5.394,
  /** 7983: 13377 - 5394, grid 1-B to the rear wall. */
  gridBToRear: 7.983,
} as const;

/** The re-entrant corner at mm (24370, 13377). */
export const RE_ENTRANT_CORNER_M: Vec2 = { x: 24.370, y: 13.377 };

/**
 * Fixed built obstacles inside the shell that are NOT part of the outline.
 * The hatched, X-crossed rect in the source drawing reads as a riser / shaft
 * enclosure in the right-hand band. Treated as permanently locked: objects may
 * not overlap it.
 */
export const FIXED_OBSTACLES: Array<{
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  d: number;
}> = [
  { id: 'shaft-1', label: 'Riser / shaft', x: 27.700, y: 3.344, w: 1.085, d: 0.900 },
];

/**
 * Leasable area as printed on the landlord's plan. The traced polygon comes out
 * at SHELL_AREA_M2 (358.05), ~0.9% larger. The difference is tracing tolerance.
 * SHELL_AREA_M2 is the arithmetic source of truth for the app so that
 * occupied + free always reconciles; this figure is shown for reference only.
 */
export const LEASE_AREA_M2 = 355;
