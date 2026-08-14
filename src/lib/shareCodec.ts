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
 *   - coordinates round to a millimetre. The grid snaps at 100 mm and the
 *     drawing is traced from photographs; float noise past that is not
 *     information.
 *
 * Measured on the seed layout: 2,584 B of JSON to 669 B, and 1,658 to 577 URL
 * characters — 66% shorter, with no server and no expiry.
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

/** Bit positions in the settings flags field. */
const S_SNAP = 1;
const S_ANGLE_SNAP = 2;
const S_GRID = 4;
const S_CLEARANCE = 8;

/**
 * A ceiling on how many tuples a payload may claim, applied before the array is
 * walked. `parseSnapshot` caps the resulting objects at 500 anyway, but it does
 * so after this code has already mapped the whole array — and a compressed
 * payload expands enough that a short URL can describe a very long one.
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
    const kind = KIND_INDEX.get(obj.type);
    const t: Tuple = [
      kind ?? KIND_INDEX.get('generic')!,
      round(obj.cx),
      round(obj.cy),
      round(obj.w),
      round(obj.d),
      round(obj.rotation),
      obj.locked ? F_LOCKED : 0,
      obj.label === CATALOG[obj.type].label ? 0 : obj.label,
      obj.notes || 0,
      obj.seatingDepth ? round(obj.seatingDepth) : 0,
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
      ...(isNum(seatingDepth) && seatingDepth > 0 ? { seatingDepth } : {}),
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
