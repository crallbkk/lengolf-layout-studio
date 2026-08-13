import { COLUMN_GRID_X_M, COLUMN_GRID_Y_M, SHELL_OUTLINE } from './floorplan';
import { corners, rotate } from './geometry';
import { isBay } from './catalog';
import type { ObjectKind, PlacedObject, Vec2 } from './types';

/**
 * The vertical model.
 *
 * The plan carries no heights — it is a traced 2D drawing — so every number in
 * this file is either an estimate or a convention, and all of them are user
 * editable at runtime. Keeping them here, with their provenance, is what stops
 * the 3D view from quietly becoming a source of fake precision.
 */

/* ------------------------------------------------------------------ */
/* Structure                                                           */
/* ------------------------------------------------------------------ */

/**
 * Storey heights ESTIMATED PHOTOGRAMMETRICALLY from the site photographs.
 * They are NOT from any drawing. The landlord has not confirmed clear height,
 * which the project notes flag as the single biggest technical risk.
 *
 * Method and evidence:
 *
 * - `beamSoffitM` — counted AAC blockwork courses on the long solid wall in
 *   `S__33980453_0.jpg`, floor to the underside of the downstand beam the wall
 *   dies into: 15 to 16 courses. Thai AAC block is 200 mm high (Q-CON /
 *   Superblock standard, thin-bed joints), so 3.00 to 3.20 m. A course count is
 *   a discrete tally rather than a scaled measurement, so it survives the
 *   unknown lens and camera tilt; the residual risk is the block module itself.
 *
 * - `slabSoffitM` — from `S__33980451_0.jpg`, where a standing figure and the
 *   full height of the plaza glazing appear at the same depth. Figure at ~1.60 m
 *   gives ~238 px/m; the glazing head measures ~880 px, so ~3.7 m to the head,
 *   with the slab a little above it. The figures stand slightly forward of the
 *   glass, which inflates the scale, so 3.7 m is a floor on the answer rather
 *   than a midpoint.
 *
 * Confidence: the beam soffit is the firmer of the two. Treat both as +/- 10%
 * and replace them the moment the tenant fit-out manual arrives.
 */
export const STRUCTURE_DEFAULTS = {
  /** Underside of the structural slab, above finished floor level. */
  slabSoffitM: 3.9,
  /** Underside of the downstand beams — the real constraint over a swing. */
  beamSoffitM: 3.15,
  /** Width of the modelled beam band, each side of the grid line. */
  beamWidthM: 0.6,
  /**
   * Screed plus finish, and the raised platform at the bays. Both eat into
   * clear height and are routinely forgotten when someone quotes "3.15 m".
   */
  floorBuildUpM: 0.1,
  bayPlatformM: 0.15,
} as const;

export type Structure = {
  slabSoffitM: number;
  beamSoffitM: number;
  beamWidthM: number;
  floorBuildUpM: number;
  bayPlatformM: number;
};

/**
 * Clear height a full driver swing needs above the mat. 3.05 m is the usual
 * quoted minimum for a simulator bay; below about 3.2 m a tall player is
 * already choosing their swing. The overhead launch monitor (Uneekor EYE XO)
 * mounts into this same envelope, so it is a ceiling on the ceiling.
 */
export const SWING_CLEARANCE_M = 3.05;

/* ------------------------------------------------------------------ */
/* Beams                                                               */
/* ------------------------------------------------------------------ */

export interface BeamLine {
  id: string;
  /** 'x' — a beam running along constant x (north/south). */
  axis: 'x' | 'y';
  at: number;
  from: number;
  to: number;
}

/**
 * Primary beams, INFERRED from the structural column grid: beams run column to
 * column, and the photographs show downstands on both axes. The landlord
 * drawing shows no beams at all, so secondary framing between these lines is
 * unknown and deliberately not invented here.
 *
 * The rear line at y = 13.377 is the long solid wall itself, which the
 * photographs show dying into a downstand — that is the beam the bay run sits
 * under.
 */
export const BEAM_LINES: BeamLine[] = [
  { id: 'beam-y-a', axis: 'y', at: COLUMN_GRID_Y_M[0], from: 0, to: 29.64 },
  { id: 'beam-y-b', axis: 'y', at: 13.377, from: 0, to: 29.64 },
  { id: 'beam-x-1', axis: 'x', at: COLUMN_GRID_X_M[0], from: 0, to: 13.377 },
  { id: 'beam-x-2', axis: 'x', at: COLUMN_GRID_X_M[1], from: 0, to: 13.377 },
  { id: 'beam-x-3', axis: 'x', at: COLUMN_GRID_X_M[2], from: 0, to: 16.919 },
];

/** Axis-aligned footprint of a beam band, for overlap tests and for meshing. */
export function beamFootprint(
  beam: BeamLine,
  widthM: number,
): { minX: number; maxX: number; minY: number; maxY: number } {
  const h = widthM / 2;
  return beam.axis === 'x'
    ? { minX: beam.at - h, maxX: beam.at + h, minY: beam.from, maxY: beam.to }
    : { minX: beam.from, maxX: beam.to, minY: beam.at - h, maxY: beam.at + h };
}

/* ------------------------------------------------------------------ */
/* Object volumes                                                      */
/* ------------------------------------------------------------------ */

/**
 * How each type reads in three dimensions.
 *
 * `mass` decides how it is drawn, not just how tall it is:
 *   room          — a built enclosure with walls you cannot see over
 *   furniture     — a solid object you read across the room
 *   floor-finish  — a change of surface, essentially flat
 */
export type Mass = 'room' | 'furniture' | 'floor-finish';

export interface VolumeSpec {
  heightM: number;
  mass: Mass;
}

export const VOLUMES: Record<ObjectKind, VolumeSpec> = {
  // Bay enclosure height is a fit-out choice, not a structural one; it is
  // capped against the real soffit at render time.
  'social-bay': { heightM: 3.0, mass: 'room' },
  'ai-bay': { heightM: 3.0, mass: 'room' },
  'vip-bay': { heightM: 3.0, mass: 'room' },
  'putting-green': { heightM: 0.04, mass: 'floor-finish' },
  'event-floor': { heightM: 0.02, mass: 'floor-finish' },
  bar: { heightM: 1.1, mass: 'furniture' },
  lounge: { heightM: 0.78, mass: 'furniture' },
  lockers: { heightM: 2.0, mass: 'room' },
  pantry: { heightM: 2.4, mass: 'room' },
  'service-band': { heightM: 2.4, mass: 'room' },
  store: { heightM: 2.6, mass: 'room' },
  // Roof height of a golf cart. The piece reads at eye level, which is the
  // whole point of putting it where people walk in.
  'cart-pillar': { heightM: 1.85, mass: 'furniture' },
  generic: { heightM: 1.0, mass: 'furniture' },
};

/* ------------------------------------------------------------------ */
/* Clearance                                                           */
/* ------------------------------------------------------------------ */

export interface ClearanceResult {
  objectId: string;
  label: string;
  /** Clear height over the swing zone, above the finished bay platform. */
  clearM: number;
  /** True when a beam, rather than the slab, sets that figure. */
  underBeam: boolean;
  /**
   * Lowest soffit over the WHOLE bay footprint. A different question from
   * `clearM`: it caps how tall the enclosure can be built, where `clearM` says
   * whether the player can swing inside it.
   */
  enclosureCeilingM: number;
  ok: boolean;
}

/**
 * A bay's depth is not one zone but three, per the v4 concept drawing:
 * "bays 4.5 x 5.5 m = screen buffer 1.25 + play 3.6 + high table row 0.65".
 *
 * The screen buffer is turf the player never stands on — ball flight and the
 * launch monitor's view. The play band is where a swing can happen. The table
 * row at the front is the plan's `seatingDepth`.
 */
export const SCREEN_BUFFER_M = 1.25;

/**
 * Lateral width of a swing. A player plus the arc of a driver, not the width of
 * the room they are standing in.
 */
export const SWING_ZONE_W_M = 2.0;

export interface BayZones {
  /** Table / bench row at the front, from the plan. */
  seating: number;
  /** Screen wall back to the front of the platform. */
  enclosureDepth: number;
  screenBuffer: number;
  playDepth: number;
  /** Local z of the enclosure centre, in the bay's own frame. */
  enclosureCz: number;
  /** Local z of the play band centre — where the tee goes. */
  playCz: number;
}

export function bayZones(o: PlacedObject): BayZones {
  const seating = Math.min(Math.max(o.seatingDepth ?? 0, 0), o.d);
  const enclosureDepth = o.d - seating;
  // A shallow bay gives up buffer before it gives up play; without the cap a
  // hand-shrunk bay would end up with negative play depth.
  const screenBuffer = Math.min(SCREEN_BUFFER_M, enclosureDepth * 0.4);
  return {
    seating,
    enclosureDepth,
    screenBuffer,
    playDepth: Math.max(0, enclosureDepth - screenBuffer),
    enclosureCz: seating / 2,
    playCz: o.d / 2 - screenBuffer - (enclosureDepth - screenBuffer) / 2,
  };
}

/**
 * The volume a swing actually occupies: the play band, narrowed to a player's
 * arc, in world space.
 *
 * Testing the full enclosure footprint instead is tempting and wrong. Every bay
 * in the concept layout has a beam clipping one edge or the back of its
 * enclosure, so a footprint test reports six bays out of six under a downstand
 * — technically true, useless as an answer, and it buries the one case that
 * would matter: a beam over the player's head.
 */
export function swingZone(o: PlacedObject): PlacedObject {
  const z = bayZones(o);
  // The offset is in the bay's own frame, so it has to be rotated with it.
  const offset = rotate({ x: 0, y: z.playCz }, o.rotation);
  return {
    ...o,
    cx: o.cx + offset.x,
    cy: o.cy + offset.y,
    w: Math.min(SWING_ZONE_W_M, o.w),
    d: Math.max(z.playDepth, 0.1),
  };
}

/**
 * Lowest overhead obstruction across a footprint. Returns the slab soffit when
 * no beam band overlaps.
 */
export function overheadAt(
  footprint: Vec2[],
  structure: Structure,
): { heightM: number; underBeam: boolean } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of footprint) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  for (const beam of BEAM_LINES) {
    const b = beamFootprint(beam, structure.beamWidthM);
    const overlaps =
      minX < b.maxX && maxX > b.minX && minY < b.maxY && maxY > b.minY;
    if (overlaps) return { heightM: structure.beamSoffitM, underBeam: true };
  }
  return { heightM: structure.slabSoffitM, underBeam: false };
}

/**
 * Swing clearance for every bay in the layout.
 *
 * This is the question the 3D view exists to answer: a plan cannot show that
 * the swing zone of a bay sits under a downstand, and a single "ceiling
 * height" number hides it just as well.
 */
export function swingClearances(
  objects: PlacedObject[],
  structure: Structure,
): ClearanceResult[] {
  const out: ClearanceResult[] = [];
  for (const o of objects) {
    if (!isBay(o.type)) continue;
    const { heightM, underBeam } = overheadAt(corners(swingZone(o)), structure);
    const enclosure = overheadAt(corners(o), structure);
    // The platform raises the player; the floor build-up raises everything, so
    // it cancels out of a soffit height already measured from finished floor.
    const clearM = heightM - structure.bayPlatformM;
    out.push({
      objectId: o.id,
      label: o.label,
      clearM,
      underBeam,
      enclosureCeilingM: enclosure.heightM,
      ok: clearM >= SWING_CLEARANCE_M,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Shell helpers                                                       */
/* ------------------------------------------------------------------ */

/** Plan bounds of the shell, used to frame the default camera. */
export function shellBounds() {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of SHELL_OUTLINE) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return {
    minX,
    maxX,
    minY,
    maxY,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    w: maxX - minX,
    d: maxY - minY,
  };
}
