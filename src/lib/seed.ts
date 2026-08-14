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
type Seed = {
  type: ObjectKind;
  label: string;
  /** mm, top-left, as drawn */
  x: number;
  y: number;
  w: number;
  d: number;
  seatingDepth?: number;
};

const SEEDS: Seed[] = [
  /**
   * Event floor ON the plaza glazing, putting green pulled back behind it.
   *
   * This is the 8 August correction and it is the opposite way round from the
   * Option 2 drawing the rest of this seed comes from. The frontage has to
   * carry people and activity, because that is what a podium landlord wants to
   * see from the plaza; turf against the glass shows the landlord grass.
   *
   * The green sits in the middle of the west portion and wraps the round
   * column at (1.585, 5.394) on purpose — the cart installation stands on it,
   * emerging from the base of that column.
   */
  { type: 'event-floor', label: 'Event floor', x: 600, y: 400, w: 9400, d: 2900 },
  { type: 'putting-green', label: 'Putting green', x: 600, y: 4000, w: 7400, d: 2600 },
  // Butted against the east face of the round column and centred on it, so the
  // cart reads as driving out of the pillar rather than parked beside it.
  { type: 'cart-pillar', label: 'Cart / DRIVE THRU', x: 1935, y: 4544, w: 2600, d: 1700 },
  { type: 'bar', label: 'Bar', x: 12583, y: 3544, w: 6765, d: 2750 },
  { type: 'lounge', label: 'Lounge', x: 19748, y: 3133, w: 7150, d: 2567 },
  { type: 'pantry', label: 'Pantry', x: 26998, y: 3444, w: 1842, d: 3050 },
  { type: 'lockers', label: 'Lockers / merch', x: 100, y: 7077, w: 1385, d: 6200 },
  { type: 'social-bay', label: 'S1', x: 1585, y: 7077, w: 4500, d: 6300, seatingDepth: 1700 },
  { type: 'social-bay', label: 'S2', x: 6085, y: 7077, w: 4500, d: 6300, seatingDepth: 1700 },
  { type: 'social-bay', label: 'S3', x: 10585, y: 7077, w: 4500, d: 6300, seatingDepth: 1700 },
  { type: 'social-bay', label: 'S4', x: 15085, y: 7077, w: 4500, d: 6300, seatingDepth: 1700 },
  { type: 'ai-bay', label: 'AI', x: 19585, y: 7077, w: 3700, d: 6300, seatingDepth: 1700 },
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
    rotation: 0,
    locked: false,
    notes: '',
    ...(s.seatingDepth !== undefined
      ? { seatingDepth: s.seatingDepth / 1000 }
      : {}),
  }));
}
