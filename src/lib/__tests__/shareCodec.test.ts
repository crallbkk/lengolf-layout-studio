import { describe, expect, it } from 'vitest';
import { compressToEncodedURIComponent } from 'lz-string';

import { CATALOG, CATALOG_ORDER } from '../catalog';
import { DEFAULT_SETTINGS } from '../defaults';
import { conceptLayout, SEED_VERSION } from '../seed';
import { decodeShare, encodeShare, SHARE_KINDS } from '../shareCodec';
import type { LayoutSnapshot, PlacedObject } from '../types';

const snap = (over: Partial<LayoutSnapshot> = {}): LayoutSnapshot => ({
  objects: conceptLayout(),
  typeOverrides: {},
  settings: { ...DEFAULT_SETTINGS },
  seedVersion: SEED_VERSION,
  ...over,
});

/** decodeShare returns raw shape; these tests read it as such. */
const objectsOf = (raw: unknown) =>
  (raw as { objects: Record<string, unknown>[] }).objects;

describe('SHARE_KINDS', () => {
  it('covers every kind in the catalog', () => {
    // Fails when a kind is added to the catalog but not to the wire order, so
    // a new type cannot silently encode as `generic`.
    for (const kind of CATALOG_ORDER) {
      expect(SHARE_KINDS, `${kind} missing from SHARE_KINDS`).toContain(kind);
    }
    expect(SHARE_KINDS.length).toBe(Object.keys(CATALOG).length);
  });

  it('has no duplicates', () => {
    expect(new Set(SHARE_KINDS).size).toBe(SHARE_KINDS.length);
  });

  it('pins the wire order', () => {
    // The indices ARE the format. Reordering this list repoints every link
    // ever sent, silently, so the order is asserted rather than merely
    // documented — a reorder has to break this test on purpose.
    expect([...SHARE_KINDS]).toEqual([
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
    ]);
  });
});

describe('round trip', () => {
  it('preserves every object field that survives mm rounding', () => {
    const original = snap();
    const back = objectsOf(decodeShare(encodeShare(original)));

    expect(back).toHaveLength(original.objects.length);
    original.objects.forEach((o, i) => {
      const b = back[i];
      expect(b.type).toBe(o.type);
      expect(b.label).toBe(o.label);
      // Exact, not approximate: the format rounds off float noise only, so a
      // layout that comes back changed is a bug, not a tolerance.
      expect(b.cx).toBe(o.cx);
      expect(b.cy).toBe(o.cy);
      expect(b.w).toBe(o.w);
      expect(b.d).toBe(o.d);
      expect(b.rotation).toBe(o.rotation);
      expect(b.locked).toBe(o.locked);
      expect(b.notes).toBe(o.notes);
      if (o.seatingDepth) expect(b.seatingDepth).toBe(o.seatingDepth);
    });
  });

  it('carries locked, notes and a custom label together', () => {
    const o: PlacedObject = {
      id: 'x',
      type: 'vip-bay',
      label: 'Renamed bay',
      cx: 1.234,
      cy: 5.678,
      w: 3,
      d: 4,
      rotation: 90,
      locked: true,
      notes: 'check the riser',
      seatingDepth: 1.25,
    };
    const [b] = objectsOf(decodeShare(encodeShare(snap({ objects: [o] }))));
    expect(b).toMatchObject({
      type: 'vip-bay',
      label: 'Renamed bay',
      locked: true,
      notes: 'check the riser',
      seatingDepth: 1.25,
    });
  });

  it('keeps notes when the label is defaulted away', () => {
    // The trailing-zero trim must not eat an interior field: label encodes as 0
    // here (it matches the catalog) while notes after it is a real string.
    const o: PlacedObject = {
      id: 'x',
      type: 'bar',
      label: CATALOG['bar'].label,
      cx: 0,
      cy: 0,
      w: 2,
      d: 2,
      rotation: 0,
      locked: false,
      notes: 'kept',
    };
    const [b] = objectsOf(decodeShare(encodeShare(snap({ objects: [o] }))));
    expect(b.label).toBe(CATALOG['bar'].label);
    expect(b.notes).toBe('kept');
  });

  it('omits default settings but round-trips changed ones', () => {
    const defaults = decodeShare(encodeShare(snap())) as Record<string, unknown>;
    expect(defaults.settings).toBeUndefined();

    const changed = snap({
      settings: {
        ...DEFAULT_SETTINGS,
        gridSnapMm: 250,
        snapEnabled: false,
        showClearance: true,
        clearanceM: 1.4,
      },
    });
    const back = decodeShare(encodeShare(changed)) as {
      settings: Record<string, unknown>;
    };
    expect(back.settings).toMatchObject({
      gridSnapMm: 250,
      snapEnabled: false,
      angleSnapEnabled: true,
      showGrid: true,
      showClearance: true,
      clearanceM: 1.4,
    });
  });

  it('round-trips type overrides', () => {
    const back = decodeShare(
      encodeShare(snap({ typeOverrides: { 'ai-bay': { minW: 3.1, minD: 5.2 } } })),
    ) as { typeOverrides: Record<string, unknown> };
    expect(back.typeOverrides['ai-bay']).toEqual({ minW: 3.1, minD: 5.2 });
  });

  it('round-trips the seed version', () => {
    const back = decodeShare(encodeShare(snap())) as { seedVersion: number };
    expect(back.seedVersion).toBe(SEED_VERSION);
  });

  it('survives an empty layout', () => {
    const back = decodeShare(encodeShare(snap({ objects: [] })));
    expect(objectsOf(back)).toEqual([]);
  });
});

describe('backward compatibility', () => {
  it('still decodes a v1 verbatim-snapshot link', () => {
    // Exactly what the previous shareUrl() produced.
    const v1 = compressToEncodedURIComponent(JSON.stringify(snap()));
    const back = objectsOf(decodeShare(v1));
    expect(back).toHaveLength(17);
    expect(back[0].type).toBe(conceptLayout()[0].type);
    expect(back[0].id).toBe(conceptLayout()[0].id);
  });
});

describe('hostile and malformed input', () => {
  it('returns null rather than throwing', () => {
    for (const bad of ['', 'not-compressed', '@@@@', 'AAAAAAAA']) {
      expect(() => decodeShare(bad)).not.toThrow();
    }
    expect(decodeShare('')).toBeNull();
  });

  it('rejects a payload that is not an object or has no objects', () => {
    expect(decodeShare(compressToEncodedURIComponent('42'))).toBeNull();
    expect(decodeShare(compressToEncodedURIComponent('"hi"'))).toBeNull();
    expect(decodeShare(compressToEncodedURIComponent('{}'))).toBeNull();
    expect(
      decodeShare(compressToEncodedURIComponent(JSON.stringify({ v: 2 }))),
    ).toBeNull();
  });

  it('skips malformed tuples instead of failing the whole link', () => {
    const payload = JSON.stringify({
      v: 2,
      o: [
        [0, 1, 1, 2, 2, 0, 0], // good
        [999, 1, 1, 2, 2, 0, 0], // unknown kind index
        [0, 1, 1], // too short
        'nonsense',
        null,
        [1, 3, 3, 2, 2, 0, 0], // good
      ],
    });
    const back = objectsOf(decodeShare(compressToEncodedURIComponent(payload)));
    expect(back).toHaveLength(2);
    expect(back[0].type).toBe('social-bay');
    expect(back[1].type).toBe('ai-bay');
  });

  it('caps how many tuples it will expand', () => {
    const payload = JSON.stringify({
      v: 2,
      o: Array.from({ length: 5000 }, () => [0, 1, 1, 2, 2, 0, 0]),
    });
    const back = objectsOf(decodeShare(compressToEncodedURIComponent(payload)));
    expect(back.length).toBeLessThanOrEqual(600);
  });

  it('does not trust label or notes to be strings', () => {
    const payload = JSON.stringify({
      v: 2,
      o: [[0, 1, 1, 2, 2, 0, 0, { evil: true }, ['x']]],
    });
    const [b] = objectsOf(decodeShare(compressToEncodedURIComponent(payload)));
    expect(b.label).toBe(CATALOG['social-bay'].label);
    expect(b.notes).toBe('');
  });
});

describe('size', () => {
  it('is well under half the old encoding for the seed layout', () => {
    const s = snap();
    const v1 = compressToEncodedURIComponent(JSON.stringify(s));
    const v2 = encodeShare(s);
    expect(v2.length).toBeLessThan(v1.length * 0.5);
    // Guards against a future field quietly re-inflating the link.
    expect(v2.length).toBeLessThan(700);
  });
});
