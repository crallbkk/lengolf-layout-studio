import { describe, expect, it } from 'vitest';

import { computeWarnings, hardWarningIds, softWarningIds } from '../collision';
import { FIXED_OBSTACLES, RE_ENTRANT_CORNER_M } from '../floorplan';
import type { ObjectKind, PlacedObject, Settings } from '../types';

const settings: Settings = {
  gridSnapMm: 100,
  snapEnabled: true,
  angleSnapDeg: 15,
  angleSnapEnabled: true,
  clearanceM: 0.9,
  showGrid: true,
  showClearance: false,
};

let n = 0;
function obj(
  type: ObjectKind,
  cx: number,
  cy: number,
  w: number,
  d: number,
  extra: Partial<PlacedObject> = {},
): PlacedObject {
  n += 1;
  return {
    id: `o${n}`,
    type,
    label: `${type}-${n}`,
    cx,
    cy,
    w,
    d,
    rotation: 0,
    locked: false,
    notes: '',
    ...extra,
  };
}

const ids = (w: ReturnType<typeof computeWarnings>) => w.map((x) => x.id);

describe('overlap detection', () => {
  it('reports a hard warning for genuinely overlapping objects', () => {
    const a = obj('social-bay', 5, 9, 4.5, 6.3);
    const b = obj('social-bay', 6, 9, 4.5, 6.3);
    const w = computeWarnings([a, b], settings);
    const hard = w.filter((x) => x.severity === 'hard');
    expect(hard.some((x) => x.id.startsWith('overlap:'))).toBe(true);
    expect(hardWarningIds(w).has(a.id)).toBe(true);
    expect(hardWarningIds(w).has(b.id)).toBe(true);
  });

  it('does not report an overlap for objects that merely touch', () => {
    const a = obj('social-bay', 3, 9, 4, 6);
    const b = obj('social-bay', 7, 9, 4, 6);
    const w = computeWarnings([a, b], settings);
    expect(w.filter((x) => x.id.startsWith('overlap:'))).toHaveLength(0);
  });

  it('survives float noise at a shared divider', () => {
    // Centres derived the way the seed derives them, so the shared face lands
    // on values that are equal only to within float error.
    const a = obj('social-bay', (15085 + 4500 / 2) / 1000, 10.227, 4.5, 6.3);
    const b = obj('ai-bay', (19585 + 3700 / 2) / 1000, 10.227, 3.7, 6.3);
    const w = computeWarnings([a, b], settings);
    expect(w.filter((x) => x.id.startsWith('overlap:'))).toHaveLength(0);
  });

  it('reports the penetration depth in the message', () => {
    const a = obj('social-bay', 5, 9, 4, 6);
    const b = obj('social-bay', 8.5, 9, 4, 6);
    // Spans 3..7 and 6.5..10.5 -> 0.50 m of overlap.
    const w = computeWarnings([a, b], settings);
    const overlap = w.find((x) => x.id.startsWith('overlap:'));
    expect(overlap?.message).toContain('0.50 m');
  });
});

describe('clearance rule', () => {
  it('treats a shared divider as intentional, not a clearance violation', () => {
    const a = obj('social-bay', 3, 9, 4, 6);
    const b = obj('social-bay', 7, 9, 4, 6);
    const w = computeWarnings([a, b], settings);
    expect(w.filter((x) => x.id.startsWith('clearance:'))).toHaveLength(0);
  });

  it('warns softly when two bays are closer than the clearance', () => {
    const a = obj('social-bay', 4, 9, 4, 6);
    const b = obj('social-bay', 8.5, 9, 4, 6);
    // 0.5 m gap, clearance 0.9 m.
    const w = computeWarnings([a, b], { ...settings, clearanceM: 0.9 });
    const soft = w.filter((x) => x.id.startsWith('clearance:'));
    expect(soft).toHaveLength(1);
    expect(soft[0].severity).toBe('soft');
    expect(softWarningIds(w).has(a.id)).toBe(true);
  });

  it('respects an edited clearance rule', () => {
    const a = obj('social-bay', 4, 9, 4, 6);
    const b = obj('social-bay', 8.5, 9, 4, 6);
    const relaxed = computeWarnings([a, b], { ...settings, clearanceM: 0.4 });
    expect(relaxed.filter((x) => x.id.startsWith('clearance:'))).toHaveLength(0);
  });

  it('exempts fitted joinery from the clearance rule', () => {
    // A bar hard against lockers is intentional, not a warning.
    const a = obj('bar', 4, 9, 4, 2);
    const b = obj('lockers', 6.2, 9, 0.4, 6);
    const w = computeWarnings([a, b], settings);
    expect(w.filter((x) => x.id.startsWith('clearance:'))).toHaveLength(0);
  });

  it('does not apply clearance between a bay and an ordinary zone', () => {
    // The aisle between a bay row and the bar is normal circulation. Flagging it
    // is what buried the concept layout in 29 warnings.
    const bay = obj('social-bay', 4, 9, 4, 6);
    const bar = obj('bar', 8.4, 9, 4, 2);
    const w = computeWarnings([bay, bar], settings);
    expect(w.filter((x) => x.id.startsWith('clearance:'))).toHaveLength(0);
  });
});

describe('footprint containment', () => {
  it('flags an object hanging outside the shell', () => {
    const a = obj('social-bay', -2, 5, 4, 6);
    const w = computeWarnings([a], settings);
    expect(ids(w)).toContain(`outside:${a.id}`);
    expect(w.find((x) => x.id === `outside:${a.id}`)?.severity).toBe('hard');
  });

  it('accepts an object comfortably inside the main hall', () => {
    const a = obj('social-bay', 8, 9, 4, 6);
    const w = computeWarnings([a], settings);
    expect(ids(w)).not.toContain(`outside:${a.id}`);
  });

  it('flags an object that crosses the 24.37 notch into dead space', () => {
    // Sits below the rear wall (y > 13.377) but left of x = 24.37: outside.
    const a = obj('social-bay', 12, 15, 4, 3);
    const w = computeWarnings([a], settings);
    expect(ids(w)).toContain(`outside:${a.id}`);
  });

  it('accepts the store bay, which legitimately sits beyond the rear wall', () => {
    // Flush into the rear-right pocket on three sides — the exact concept value.
    const a = obj('store', 26.605, 15.148, 4.47, 3.542);
    const w = computeWarnings([a], settings);
    expect(ids(w)).not.toContain(`outside:${a.id}`);
  });

  it('accepts an object sitting exactly flush against a wall', () => {
    // Top edge exactly on the y = 0 glazing line.
    const a = obj('generic', 5, 1, 4, 2);
    const w = computeWarnings([a], settings);
    expect(ids(w)).not.toContain(`outside:${a.id}`);
  });

  it('catches a rotated object whose corners are in but whose edge cuts a wall', () => {
    // Rotated so that it pokes through the angled shop-front glazing.
    const a = obj('generic', 11.6, 1.2, 3, 1, { rotation: 20 });
    const w = computeWarnings([a], settings);
    expect(ids(w)).toContain(`outside:${a.id}`);
  });
});

describe('fixed obstacles', () => {
  it('softly flags a clash with the riser/shaft', () => {
    const shaft = FIXED_OBSTACLES[0];
    const a = obj(
      'generic',
      shaft.x + shaft.w / 2,
      shaft.y + shaft.d / 2,
      1,
      0.6,
    );
    const w = computeWarnings([a], settings);
    const clash = w.find((x) => x.id.startsWith('obstacle:'));
    // Back-of-house rooms legitimately enclose risers, so this is a
    // "check the drawing" flag rather than an impossibility.
    expect(clash?.severity).toBe('soft');
  });

  it('does not flag an object clear of the shaft', () => {
    const a = obj('generic', 5, 9, 2, 2);
    const w = computeWarnings([a], settings);
    expect(w.some((x) => x.id.startsWith('obstacle:'))).toBe(false);
  });
});

describe('the 24,370 structural pier', () => {
  it('softly flags a bay straddling the corner', () => {
    const a = obj(
      'vip-bay',
      RE_ENTRANT_CORNER_M.x + 1,
      RE_ENTRANT_CORNER_M.y - 3,
      5.56,
      6.78,
    );
    const w = computeWarnings([a], settings);
    const pier = w.find((x) => x.id === `pier:${a.id}`);
    expect(pier?.severity).toBe('soft');
    expect(pier?.message).toContain('24,370');
  });

  it('does not raise the pier warning for non-bay objects', () => {
    const a = obj(
      'store',
      RE_ENTRANT_CORNER_M.x + 1,
      RE_ENTRANT_CORNER_M.y - 1,
      3,
      3,
    );
    const w = computeWarnings([a], settings);
    expect(w.some((x) => x.id.startsWith('pier:'))).toBe(false);
  });

  it('does not raise the pier warning for a bay far from the corner', () => {
    const a = obj('social-bay', 6, 9, 4.5, 6.3);
    const w = computeWarnings([a], settings);
    expect(w.some((x) => x.id.startsWith('pier:'))).toBe(false);
  });
});

describe('the shipped concept layout', () => {
  it('produces no hard warnings', async () => {
    const { conceptLayout } = await import('../seed');
    const w = computeWarnings(conceptLayout(), settings);
    const hard = w.filter((x) => x.severity === 'hard');
    expect(hard.map((x) => x.message)).toEqual([]);
  });

  /**
   * A signal-to-noise guard, not a style preference. The first version of the
   * clearance rule produced 29 soft warnings here — every one of them an
   * ordinary aisle — which is how a warning panel becomes wallpaper. If a change
   * pushes this back into double digits, the rule has over-generalised again.
   */
  it('keeps first-run soft warnings down to genuinely reviewable items', async () => {
    const { conceptLayout } = await import('../seed');
    const w = computeWarnings(conceptLayout(), settings);
    const soft = w.filter((x) => x.severity === 'soft');
    expect(soft.length).toBeLessThanOrEqual(5);
    // No bay-to-bay clearance noise: the row shares dividers by design.
    expect(soft.filter((x) => x.id.startsWith('clearance:'))).toHaveLength(0);
  });
});
