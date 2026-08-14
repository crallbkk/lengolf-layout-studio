import type { ObjectKind, PlacedObject } from './types';

/**
 * The OPTION 2 concept from unit_1225_full_option2.svg, converted from the
 * SVG's top-left rects to our centre-based model. Loading something real on
 * first run beats an empty canvas: the team starts by editing a known layout
 * rather than rebuilding it.
 *
 * Bays in the drawing are two stacked rects (seating strip + hitting
 * enclosure); here they are one object with `seatingDepth` marking the split.
 */
/**
 * Bump whenever the published layout below changes.
 *
 * A browser that has opened the app once keeps its own saved copy forever, and
 * that copy wins over this file — which is correct while someone is working,
 * and wrong the moment a new layout is published, because they never see it.
 * Stamping the version lets the app notice and OFFER the new one rather than
 * either ignoring it or silently overwriting whatever the user was doing.
 */
export const SEED_VERSION = 2;

type Seed = {
  type: ObjectKind;
  label: string;
  /** mm, top-left, as drawn */
  x: number;
  y: number;
  w: number;
  d: number;
  seatingDepth?: number;
  /** Degrees clockwise on screen, about the object centre. */
  rotation?: number;
};

/**
 * Column references used below, from `COLUMNS` in floorplan.ts. Front of house
 * has three free-standing columns and the layout is pinned to all three:
 *
 *   col-1  round,  (1.585, 5.394)
 *   col-2  square, (10.585, 5.150)   the green wraps this one, cart on it
 *   col-3  square, (19.660, 5.320)   the bar ends against this one
 *
 * Pinning to structure rather than to round numbers is the point. A column is
 * the one thing on this plan that cannot move, so anything aligned to one stays
 * aligned when the 366 sqm survey redraws the boundary.
 */
const SEEDS: Seed[] = [
  /**
   * Event floor ON the plaza glazing, putting green pulled back behind it.
   *
   * This is the 8 August correction and it is the opposite way round from the
   * Option 2 drawing the rest of this seed comes from. The frontage has to
   * carry people and activity, because that is what a podium landlord wants to
   * see from the plaza; turf against the glass shows the landlord grass.
   */
  { type: 'event-floor', label: 'Event floor', x: 600, y: 400, w: 9400, d: 2900 },
  /**
   * The green sits in the middle of the room and wraps col-2. It runs east to
   * exactly 12383, the face of the bar's return wall, so turf and bar meet on a
   * line rather than leaving a strip too narrow to be anything.
   */
  { type: 'putting-green', label: 'Putting green', x: 5500, y: 3900, w: 6883, d: 2700 },
  /**
   * Cart emerging from the WEST face of col-2, driving out onto the green —
   * hence the 180 degree rotation. East would put it through the bar, and the
   * two clear directions off that column are west and south; south runs into
   * the bay row.
   */
  {
    type: 'cart-pillar',
    label: 'Cart / DRIVE THRU',
    x: 7635,
    y: 4300,
    w: 2600,
    d: 1700,
    rotation: 180,
  },
  /**
   * Bar aligned to structure at both ends: flush to the return wall at 12383 on
   * the west, and stopping dead on col-3's west face at 19310 on the east. It
   * used to run to 19348, which clipped 38 mm into that column.
   */
  { type: 'bar', label: 'Bar', x: 12383, y: 3544, w: 6927, d: 2750 },
  /**
   * Lounge stops at the movable wall. It was 7150 wide and crossed the line the
   * partition now runs on; the glazing east of the wall goes to the VIP zone,
   * which is the reason for having the wall at all.
   */
  { type: 'lounge', label: 'Lounge', x: 19748, y: 3133, w: 3537, d: 2567 },
  /**
   * Operable partition on the VIP bay's west side, running from the bay all the
   * way north to the glazing. Closed, it makes the VIP bay, its own stretch of
   * plaza window and the floor between them one private room; open, the east
   * end reads as part of the venue.
   */
  { type: 'movable-wall', label: 'VIP movable wall', x: 23285, y: 2933, w: 150, d: 3661 },
  /**
   * The VIP zone's own sofa area, on its stretch of plaza window. This is what
   * the partition is FOR: closed, the VIP guest gets a bay, a lounge and a
   * window rather than a booth with a curtain.
   */
  {
    type: 'lounge',
    label: 'VIP lounge',
    x: 23435,
    y: 3133,
    w: 3463,
    // Runs all the way back to the VIP bay at 6594. Stopping short at 5900 left
    // a bare strip of tile between the sofa and the bay, which is the one part
    // of that zone anybody actually walks through.
    d: 3461,
  },
  { type: 'pantry', label: 'Pantry', x: 26998, y: 3444, w: 1842, d: 3050 },
  { type: 'lockers', label: 'Lockers / merch', x: 100, y: 7077, w: 1385, d: 6200 },
  /**
   * Three social, two AI, one VIP — David's 8 August correction. The single AI
   * bay at Mercury Ville is the busiest of the four and carries most of the
   * coaching, which is one of the strongest revenue lines. The widths still sum
   * the same way: 1585 lockers + 27255 enclosures + 800 service = 29640.
   */
  { type: 'social-bay', label: 'S1', x: 1585, y: 7077, w: 4500, d: 6300, seatingDepth: 1700 },
  { type: 'social-bay', label: 'S2', x: 6085, y: 7077, w: 4500, d: 6300, seatingDepth: 1700 },
  { type: 'social-bay', label: 'S3', x: 10585, y: 7077, w: 4500, d: 6300, seatingDepth: 1700 },
  { type: 'ai-bay', label: 'AI 1', x: 15085, y: 7077, w: 4500, d: 6300, seatingDepth: 1700 },
  { type: 'ai-bay', label: 'AI 2', x: 19585, y: 7077, w: 3700, d: 6300, seatingDepth: 1700 },
  { type: 'vip-bay', label: 'VIP', x: 23285, y: 6594, w: 5555, d: 6783, seatingDepth: 2183 },
  { type: 'service-band', label: 'Service band', x: 28840, y: 6594, w: 800, d: 10325 },
  { type: 'store', label: 'Store', x: 24370, y: 13377, w: 4470, d: 3542 },
];

export function conceptLayout(): PlacedObject[] {
  return SEEDS.map((s, i) => ({
    id: `seed-${i + 1}`,
    type: s.type,
    label: s.label,
    cx: (s.x + s.w / 2) / 1000,
    cy: (s.y + s.d / 2) / 1000,
    w: s.w / 1000,
    d: s.d / 1000,
    rotation: s.rotation ?? 0,
    locked: false,
    notes: '',
    ...(s.seatingDepth !== undefined
      ? { seatingDepth: s.seatingDepth / 1000 }
      : {}),
  }));
}
