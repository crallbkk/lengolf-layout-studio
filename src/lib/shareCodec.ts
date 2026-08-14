import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent,
} from 'lz-string';

import { CATALOG } from './catalog';
import { DEFAULT_SETTINGS } from './defaults';
import type { LayoutSnapshot, ObjectKind, Settings } from './types';

/**
 * The share-link payload format.
 *
 * A link used to be `lz(JSON(snapshot))` — the whole store slice, verbatim, one
 * JSON object per placed rectangle with every key spelled out. That is 1,658
 * characters for the seed layout, and more once objects carry 21-character
 * nanoids instead of the seed's `seed-N`. Long enough to wrap badly in chat,
 * get truncated by the occasional link parser, and be impossible to sanity-check
 * by eye.
 *
 * v2 sheds what the receiver can reconstruct rather than compressing harder:
 *
 *   - ids are dropped. They are per-session handles for selection and undo;
 *     nothing outside the tab that made them ever refers to one, and the parser
 *     already mints a fresh id for any object arriving without one.
 *   - objects become positional tuples, so the key names are not repeated 17
 *     times, and the kind becomes an index into SHARE_KINDS.
 *   - a label equal to its type's catalog label, empty notes, and absent
 *     seatingDepth all encode as 0 and are then dropped if they trail.
 *   - settings and typeOverrides are omitted entirely when they are the
 *     defaults, which is the overwhelmingly common case.
 *   - coordinates round to a tenth of a millimetre, which trims float noise
 *     without moving anything (see `round` below for why not whole mm).
 *
 * Measured on the seed layout: the encoded payload goes from 1,637 to 558
 * characters — 66% shorter — with no server, no upload and no expiry. The
 * pinned figure is the payload, not a full URL, since the URL also carries
 * whatever the origin and share token happen to be.
 */

/**
 * The wire order of object kinds. APPEND ONLY, and never reorder.
 *
 * Deliberately its own list rather than `CATALOG_ORDER`, which exists to order
 * the palette in the side panel. Sharing one array would mean that reordering
 * the palette for usability silently repoints every link ever sent: a link
 * whose bays decoded as bays yesterday decodes them as lounges today, with no
 * error anywhere. A UI decision must not be able to do that.
 *
 * `shareCodec.test.ts` fails if a kind is missing here, so adding one to the
 * catalog forces a decision about where it goes.
 */
export const SHARE_KINDS: readonly ObjectKind[] = [
  'social-bay',
  'ai-bay',
  'vip-bay',
  'putting-green',
  'event-floor',
  'bar',
  'lounge',
  'lockers',
  'pantry',
  'service-band',
  'store',
  'cart-pillar',
  'movable-wall',
  'generic',
];

const KIND_INDEX = new Map<ObjectKind, number>(
  SHARE_KINDS.map((k, i) => [k, i]),
);

/** Bit positions in an object's flags field. */
const F_LOCKED = 1;
/**
 * "This object has a seatingDepth", carried separately from the value because
 * `0` and absent are different states and the value alone cannot tell them
 * apart. The inspector shows or hides its seating-depth control on
 * `seatingDepth !== undefined`, so collapsing the two would take the control
 * away from a bay whose strip had been set to zero, with no way back short of
 * changing the object's type.
 */
const F_HAS_SEATING = 2;

/** Bit positions in the settings flags field. */
const S_SNAP = 1;
const S_ANGLE_SNAP = 2;
const S_GRID = 4;
const S_CLEARANCE = 8;

/**
 * A ceiling on how many tuples are expanded into objects.
 *
 * It bounds the walk, not the parse: JSON.parse has already materialised the
 * array by the time this applies, and a compressed payload expands enough that
 * a 26 KB URL can describe 300,000 tuples. That parse is tens of milliseconds
 * and allocates once, which is survivable; building 300,000 objects and handing
 * them to an O(n²) warning pass that runs every frame is not, which is what this
 * actually prevents. `parseSnapshot` independently caps objects at 500.
 */
const MAX_TUPLES = 600;

/**
 * Tenth-of-a-millimetre precision.
 *
 * Millimetres would be plenty for a plan traced from photographs, and would
 * save a handful of characters — but the seed is converted from an SVG drawn in
 * mm and lands on half-millimetre centres (8.9415 m), so a mm grid would move
 * every one of those by 0.5 mm on the way through a link. Sending someone a
 * layout and getting back geometry that is not quite the geometry you sent is a
 * bad property to trade for four characters; this rounds off float noise only.
 */
const round = (n: number) => Math.round(n * 10000) / 10000;

const isNum = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

type Tuple = (number | string)[];

interface CompactPayload {
  v: 2;
  o: Tuple[];
  sv?: number;
  s?: number[];
  t?: Record<string, [number, number]>;
}

/* ------------------------------------------------------------------ */
/* Encode                                                              */
/* ------------------------------------------------------------------ */

function encodeSettings(s: Settings): number[] | null {
  const d = DEFAULT_SETTINGS;
  if (
    s.gridSnapMm === d.gridSnapMm &&
    s.angleSnapDeg === d.angleSnapDeg &&
    s.clearanceM === d.clearanceM &&
    s.snapEnabled === d.snapEnabled &&
    s.angleSnapEnabled === d.angleSnapEnabled &&
    s.showGrid === d.showGrid &&
    s.showClearance === d.showClearance
  ) {
    return null;
  }
  const flags =
    (s.snapEnabled ? S_SNAP : 0) |
    (s.angleSnapEnabled ? S_ANGLE_SNAP : 0) |
    (s.showGrid ? S_GRID : 0) |
    (s.showClearance ? S_CLEARANCE : 0);
  return [s.gridSnapMm, s.angleSnapDeg, round(s.clearanceM), flags];
}

export function encodeShare(snap: LayoutSnapshot): string {
  const o: Tuple[] = snap.objects.map((obj) => {
    // Both the index and the label default resolve through the SAME fallback.
    // Guarding one and then dereferencing CATALOG[obj.type] for the other made
    // the guard dead code that read like live defence, and turned an object of
    // an unknown type from a mislabelled rectangle into a "Share link" that
    // throws. `parseSnapshot` should make this unreachable; if it ever is not,
    // failing soft is the right failure.
    const kind = KIND_INDEX.has(obj.type) ? obj.type : 'generic';
    const t: Tuple = [
      KIND_INDEX.get(kind)!,
      round(obj.cx),
      round(obj.cy),
      round(obj.w),
      round(obj.d),
      round(obj.rotation),
      (obj.locked ? F_LOCKED : 0) |
        (obj.seatingDepth !== undefined ? F_HAS_SEATING : 0),
      obj.label === CATALOG[kind].label ? 0 : obj.label,
      obj.notes || 0,
      obj.seatingDepth !== undefined ? round(obj.seatingDepth) : 0,
    ];
    // Only TRAILING zeros may go: dropping an interior one would shift every
    // field after it by a position.
    while (t.length > 7 && t[t.length - 1] === 0) t.pop();
    return t;
  });

  const payload: CompactPayload = { v: 2, o };
  if (snap.seedVersion) payload.sv = snap.seedVersion;

  const s = encodeSettings(snap.settings);
  if (s) payload.s = s;

  const overrides = Object.entries(snap.typeOverrides);
  if (overrides.length > 0) {
    const t: Record<string, [number, number]> = {};
    for (const [kind, ov] of overrides) {
      const i = KIND_INDEX.get(kind as ObjectKind);
      if (i === undefined || !ov) continue;
      t[i] = [round(ov.minW), round(ov.minD)];
    }
    if (Object.keys(t).length > 0) payload.t = t;
  }

  return compressToEncodedURIComponent(JSON.stringify(payload));
}

/* ------------------------------------------------------------------ */
/* Decode                                                              */
/* ------------------------------------------------------------------ */

/**
 * Expands a share payload back to the SHAPE of a v1 snapshot — deliberately
 * not to a validated `LayoutSnapshot`.
 *
 * Everything arriving from a URL is untrusted, and `parseSnapshot` in the store
 * is already the one place that clamps coordinates, bounds text, drops unknown
 * types and caps the object count. Returning raw shape means this codec never
 * becomes a second, subtly different validator that some future field is added
 * to only one of.
 *
 * Returns null when the payload is not decodable at all; individual malformed
 * tuples are skipped rather than failing the whole link, so one bad object
 * cannot cost someone the other sixteen.
 */
export function decodeShare(param: string): unknown | null {
  let raw: string | null;
  try {
    raw = decompressFromEncodedURIComponent(param);
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;

  const p = parsed as Record<string, unknown>;

  // v1 links are still in circulation — in chat threads, in email, in whatever
  // the team pasted into the concept deck. They are already snapshot-shaped,
  // so they pass straight through.
  if (Array.isArray(p.objects)) return p;

  if (p.v !== 2 || !Array.isArray(p.o)) return null;

  const objects: Record<string, unknown>[] = [];
  for (const item of p.o.slice(0, MAX_TUPLES)) {
    if (!Array.isArray(item) || item.length < 7) continue;
    const kind = SHARE_KINDS[item[0] as number];
    if (!kind) continue;

    const [, cx, cy, w, d, rotation, flags] = item as number[];
    const label = item[7];
    const notes = item[8];
    const seatingDepth = item[9];

    objects.push({
      type: kind,
      label: typeof label === 'string' ? label : CATALOG[kind].label,
      cx,
      cy,
      w,
      d,
      rotation,
      locked: (Number(flags) & F_LOCKED) !== 0,
      notes: typeof notes === 'string' ? notes : '',
      // The flag decides presence, the field only supplies the value — so a
      // seatingDepth of 0 still round-trips even though the trailing-zero trim
      // has removed the field itself.
      ...((Number(flags) & F_HAS_SEATING) !== 0
        ? { seatingDepth: isNum(seatingDepth) ? seatingDepth : 0 }
        : {}),
    });
  }

  const out: Record<string, unknown> = { objects };

  if (isNum(p.sv)) out.seedVersion = p.sv;

  if (Array.isArray(p.s) && p.s.length >= 4) {
    const [gridSnapMm, angleSnapDeg, clearanceM, flags] = p.s as number[];
    const f = Number(flags);
    out.settings = {
      gridSnapMm,
      angleSnapDeg,
      clearanceM,
      snapEnabled: (f & S_SNAP) !== 0,
      angleSnapEnabled: (f & S_ANGLE_SNAP) !== 0,
      showGrid: (f & S_GRID) !== 0,
      showClearance: (f & S_CLEARANCE) !== 0,
    };
  }

  if (p.t && typeof p.t === 'object') {
    const overrides: Record<string, { minW: number; minD: number }> = {};
    for (const [i, v] of Object.entries(p.t as Record<string, unknown>)) {
      const kind = SHARE_KINDS[Number(i)];
      if (!kind || !Array.isArray(v) || v.length < 2) continue;
      overrides[kind] = { minW: v[0] as number, minD: v[1] as number };
    }
    out.typeOverrides = overrides;
  }

  return out;
}
