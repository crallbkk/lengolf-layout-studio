'use client';

import { create } from 'zustand';
import { nanoid } from 'nanoid';
import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent,
} from 'lz-string';

import { CATALOG } from '@/lib/catalog';
import { SHELL_OUTLINE } from '@/lib/floorplan';
import { pointInPolygon } from '@/lib/geometry';
import { conceptLayout } from '@/lib/seed';
import { viewCenter } from '@/lib/viewCenter';
import type {
  LayoutSnapshot,
  MeasureState,
  ObjectKind,
  PlacedObject,
  Settings,
  TypeSpec,
  Vec2,
} from '@/lib/types';

const STORAGE_KEY = 'lengolf-floorplan:v1';
const HISTORY_LIMIT = 100;

/**
 * Bounds for anything arriving from localStorage or a shared URL. Both are
 * untrusted input channels, and a hash layout is persisted the moment it is
 * adopted, so a bad snapshot has to be neutralised at the door rather than
 * merely survived once.
 */
const MAX_OBJECTS = 500;
const MAX_TEXT_LEN = 500;
/** The unit is ~30 x 17 m; this is generous headroom, not a plan bound. */
const MAX_COORD_M = 1000;
const MIN_DIM_M = 0.1;
const MAX_DIM_M = 500;

export const DEFAULT_SETTINGS: Settings = {
  gridSnapMm: 100,
  snapEnabled: true,
  angleSnapDeg: 15,
  angleSnapEnabled: true,
  clearanceM: 0.9,
  showGrid: true,
  showClearance: false,
};

type TypeOverrides = LayoutSnapshot['typeOverrides'];

interface LayoutStore {
  /* ---- persisted / undoable ---- */
  objects: PlacedObject[];
  typeOverrides: TypeOverrides;
  settings: Settings;

  /* ---- ephemeral ---- */
  selectedIds: string[];
  measure: MeasureState;
  past: LayoutSnapshot[];
  future: LayoutSnapshot[];
  hydrated: boolean;

  /* ---- history ----
   * Discrete edits push history themselves. Continuous gestures (drag, resize,
   * rotate) must call beginChange() ONCE on pointerdown, then call
   * updateObject(..., { transient: true }) for every move, so the whole gesture
   * collapses into a single undo step. */
  beginChange(): void;
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;

  /* ---- objects ---- */
  addObject(kind: ObjectKind, at?: Vec2): string;
  updateObject(
    id: string,
    patch: Partial<PlacedObject>,
    opts?: { transient?: boolean },
  ): void;
  /**
   * Flush transient gesture writes to storage in one go. Transient updates
   * deliberately skip persisting, so a gesture ends with the store correct but
   * unsaved; settling it object-by-object cost a full JSON.stringify of the
   * whole layout per object, which on releasing a 20-object multi-drag was 20
   * serializations in a single pointerup.
   */
  commitTransient(): void;
  removeObject(id: string): void;
  removeSelected(): void;
  duplicateObject(id: string): string | null;
  /** Duplicates the whole selection as ONE undo step, selecting the copies. */
  duplicateSelected(): void;
  toggleLock(id: string): void;
  /** Locks/unlocks the whole selection as ONE undo step. */
  toggleLockSelected(): void;

  /* ---- selection ---- */
  select(id: string | null, additive?: boolean): void;
  selectAll(): void;
  clearSelection(): void;

  /* ---- type catalog + settings ---- */
  specFor(kind: ObjectKind): TypeSpec;
  setTypeMinimums(
    kind: ObjectKind,
    minW: number,
    minD: number,
    opts?: { transient?: boolean },
  ): void;
  resetTypeMinimums(kind: ObjectKind): void;
  updateSettings(
    patch: Partial<Settings>,
    opts?: { transient?: boolean },
  ): void;

  /* ---- measure ---- */
  setMeasureActive(active: boolean): void;
  addMeasurePoint(p: Vec2): void;
  setMeasureCursor(p: Vec2 | null): void;
  undoMeasurePoint(): void;
  clearMeasure(): void;

  /* ---- persistence ---- */
  hydrate(): void;
  resetToConcept(): void;
  clearAll(): void;
  shareUrl(): string;
}

/** Middle of the main hall — used when we have no better idea. */
const FALLBACK_DROP: Vec2 = { x: 14.8, y: 8.0 };

/**
 * Where a newly added object should land: the middle of what the user is
 * currently looking at, so it is always visible and immediately draggable.
 * Falls back to the plan centre when the view is parked outside the footprint,
 * so adding never drops an object straight into an "outside the unit" warning.
 */
function dropPoint(): Vec2 {
  const c = viewCenter.current;
  if (!c || !pointInPolygon(c, SHELL_OUTLINE)) return FALLBACK_DROP;
  return c;
}

const snapshot = (s: LayoutStore): LayoutSnapshot => ({
  objects: s.objects.map((o) => ({ ...o })),
  typeOverrides: JSON.parse(JSON.stringify(s.typeOverrides)),
  settings: { ...s.settings },
});

function persist(s: LayoutStore) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot(s)));
  } catch {
    /* quota or private mode — non-fatal, the layout just will not survive reload */
  }
}

/**
 * Defensive read. Anything coming from localStorage or a shared URL is
 * untrusted input: a stale schema or a truncated hash must not white-screen the
 * app, so every field is validated and bad records are dropped.
 */
function parseSnapshot(raw: unknown): LayoutSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.objects)) return null;

  const num = (v: unknown, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback;

  /** Clamped read. Every numeric field goes through this, never plain `num`. */
  const clamp = (v: unknown, fallback: number, lo: number, hi: number) =>
    Math.min(hi, Math.max(lo, num(v, fallback)));

  const text = (v: unknown, fallback: string) =>
    typeof v === 'string' ? v.slice(0, MAX_TEXT_LEN) : fallback;

  const objects: PlacedObject[] = [];
  for (const item of r.objects) {
    // A hostile or corrupt snapshot must not be able to wedge the app. The
    // warning pass is O(n^2) and runs on every frame, so an unbounded object
    // count freezes the tab — and because a hash layout is persisted on
    // arrival, the freeze would survive a reload with a clean URL.
    if (objects.length >= MAX_OBJECTS) break;
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const type = o.type as ObjectKind;
    if (!type || !(type in CATALOG)) continue;
    const w = clamp(o.w, CATALOG[type].defaultW, MIN_DIM_M, MAX_DIM_M);
    const d = clamp(o.d, CATALOG[type].defaultD, MIN_DIM_M, MAX_DIM_M);
    objects.push({
      id: typeof o.id === 'string' && o.id ? o.id.slice(0, 64) : nanoid(8),
      type,
      label: text(o.label, CATALOG[type].label),
      cx: clamp(o.cx, 0, -MAX_COORD_M, MAX_COORD_M),
      cy: clamp(o.cy, 0, -MAX_COORD_M, MAX_COORD_M),
      w,
      d,
      // Normalised rather than clamped: 720 is a legitimate way to say 0.
      rotation: ((num(o.rotation, 0) % 360) + 360) % 360,
      locked: o.locked === true,
      notes: text(o.notes, ''),
      ...(typeof o.seatingDepth === 'number' && Number.isFinite(o.seatingDepth)
        ? { seatingDepth: Math.min(Math.max(o.seatingDepth, 0), d) }
        : {}),
    });
  }

  const overrides: TypeOverrides = {};
  if (r.typeOverrides && typeof r.typeOverrides === 'object') {
    for (const [k, v] of Object.entries(r.typeOverrides)) {
      if (!(k in CATALOG) || !v || typeof v !== 'object') continue;
      const ov = v as Record<string, unknown>;
      const kind = k as ObjectKind;
      // Same floor setTypeMinimums enforces. A negative minimum would silently
      // disable every "below minimum" warning for that type.
      overrides[kind] = {
        minW: clamp(ov.minW, CATALOG[kind].minW, MIN_DIM_M, MAX_DIM_M),
        minD: clamp(ov.minD, CATALOG[kind].minD, MIN_DIM_M, MAX_DIM_M),
      };
    }
  }

  /**
   * Settings are clamped to the same bounds the UI enforces. The parser was
   * strictly more permissive than any legitimate writer, and a persisted
   * `gridSnapMm: 0` left arrow-key nudging silently dead while dragging still
   * worked — a half-broken state with no way to notice or undo it.
   */
  const s = (r.settings ?? {}) as Record<string, unknown>;
  const settings: Settings = {
    gridSnapMm: clamp(s.gridSnapMm, DEFAULT_SETTINGS.gridSnapMm, 1, 5000),
    snapEnabled: s.snapEnabled !== false,
    angleSnapDeg: clamp(s.angleSnapDeg, DEFAULT_SETTINGS.angleSnapDeg, 1, 180),
    angleSnapEnabled: s.angleSnapEnabled !== false,
    clearanceM: clamp(s.clearanceM, DEFAULT_SETTINGS.clearanceM, 0, 20),
    showGrid: s.showGrid !== false,
    showClearance: s.showClearance === true,
  };

  return { objects, typeOverrides: overrides, settings };
}

export const useLayoutStore = create<LayoutStore>((set, get) => ({
  objects: [],
  typeOverrides: {},
  settings: { ...DEFAULT_SETTINGS },
  selectedIds: [],
  measure: { active: false, points: [], cursor: null },
  past: [],
  future: [],
  hydrated: false,

  /* ---------------- history ---------------- */

  beginChange() {
    const s = get();
    const past = [...s.past, snapshot(s)];
    if (past.length > HISTORY_LIMIT) past.shift();
    set({ past, future: [] });
  },

  undo() {
    const s = get();
    if (s.past.length === 0) return;
    const previous = s.past[s.past.length - 1];
    set({
      past: s.past.slice(0, -1),
      future: [...s.future, snapshot(s)],
      objects: previous.objects,
      typeOverrides: previous.typeOverrides,
      settings: previous.settings,
      selectedIds: s.selectedIds.filter((id) =>
        previous.objects.some((o) => o.id === id),
      ),
    });
    persist(get());
  },

  redo() {
    const s = get();
    if (s.future.length === 0) return;
    const next = s.future[s.future.length - 1];
    set({
      future: s.future.slice(0, -1),
      past: [...s.past, snapshot(s)],
      objects: next.objects,
      typeOverrides: next.typeOverrides,
      settings: next.settings,
      selectedIds: s.selectedIds.filter((id) =>
        next.objects.some((o) => o.id === id),
      ),
    });
    persist(get());
  },

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,

  /* ---------------- objects ---------------- */

  addObject(kind, at) {
    get().beginChange();
    const spec = get().specFor(kind);
    const count =
      get().objects.filter((o) => o.type === kind).length + 1;
    const id = nanoid(8);
    const drop = at ?? dropPoint();
    const obj: PlacedObject = {
      id,
      type: kind,
      label: `${spec.label} ${count}`,
      cx: drop.x,
      cy: drop.y,
      w: spec.defaultW,
      d: spec.defaultD,
      rotation: 0,
      locked: false,
      notes: '',
      ...(spec.defaultSeatingDepth !== undefined
        ? { seatingDepth: spec.defaultSeatingDepth }
        : {}),
    };
    set((s) => ({ objects: [...s.objects, obj], selectedIds: [id] }));
    persist(get());
    return id;
  },

  updateObject(id, patch, opts) {
    const target = get().objects.find((o) => o.id === id);
    // Locked objects are immovable, but the lock itself must stay togglable.
    if (!target) return;
    if (target.locked && !('locked' in patch)) return;

    set((s) => ({
      objects: s.objects.map((o) => (o.id === id ? { ...o, ...patch } : o)),
    }));
    if (!opts?.transient) persist(get());
  },

  commitTransient() {
    persist(get());
  },

  removeObject(id) {
    const target = get().objects.find((o) => o.id === id);
    if (!target || target.locked) return;
    get().beginChange();
    set((s) => ({
      objects: s.objects.filter((o) => o.id !== id),
      selectedIds: s.selectedIds.filter((s2) => s2 !== id),
    }));
    persist(get());
  },

  removeSelected() {
    const s = get();
    const removable = s.objects.filter(
      (o) => s.selectedIds.includes(o.id) && !o.locked,
    );
    if (removable.length === 0) return;
    s.beginChange();
    const ids = new Set(removable.map((o) => o.id));
    set((st) => ({
      objects: st.objects.filter((o) => !ids.has(o.id)),
      // Keep the locked survivors selected. The panel tells the user "locked
      // objects are not deleted", so clearing the whole selection loses track
      // of exactly the objects the guard just protected.
      selectedIds: st.selectedIds.filter((id) => !ids.has(id)),
    }));
    persist(get());
  },

  duplicateObject(id) {
    const src = get().objects.find((o) => o.id === id);
    if (!src) return null;
    get().beginChange();
    const newId = nanoid(8);
    set((s) => ({
      objects: [
        ...s.objects,
        {
          ...src,
          id: newId,
          label: `${src.label} copy`,
          cx: src.cx + 0.5,
          cy: src.cy + 0.5,
          locked: false,
        },
      ],
      selectedIds: [newId],
    }));
    persist(get());
    return newId;
  },

  duplicateSelected() {
    const s = get();
    const sources = s.objects.filter((o) => s.selectedIds.includes(o.id));
    if (sources.length === 0) return;
    s.beginChange();
    const copies = sources.map((o) => ({
      ...o,
      id: nanoid(8),
      label: `${o.label} copy`,
      cx: o.cx + 0.5,
      cy: o.cy + 0.5,
      locked: false,
    }));
    set((st) => ({
      objects: [...st.objects, ...copies],
      // Select the copies as a group so they can be dragged away immediately,
      // which is the entire point of duplicating a multi-selection.
      selectedIds: copies.map((c) => c.id),
    }));
    persist(get());
  },

  toggleLock(id) {
    get().beginChange();
    set((s) => ({
      objects: s.objects.map((o) =>
        o.id === id ? { ...o, locked: !o.locked } : o,
      ),
    }));
    persist(get());
  },

  toggleLockSelected() {
    const s = get();
    if (s.selectedIds.length === 0) return;
    const ids = new Set(s.selectedIds);
    // Mixed selections resolve to "lock everything" rather than flipping each
    // object independently, which would leave the group in a scrambled state.
    const target = !s.objects.every((o) => !ids.has(o.id) || o.locked);
    s.beginChange();
    set((st) => ({
      objects: st.objects.map((o) =>
        ids.has(o.id) ? { ...o, locked: target } : o,
      ),
    }));
    persist(get());
  },

  /* ---------------- selection ---------------- */

  select(id, additive = false) {
    if (id === null) {
      set({ selectedIds: [] });
      return;
    }
    set((s) => {
      if (!additive) return { selectedIds: [id] };
      return s.selectedIds.includes(id)
        ? { selectedIds: s.selectedIds.filter((x) => x !== id) }
        : { selectedIds: [...s.selectedIds, id] };
    });
  },

  selectAll() {
    set((s) => ({ selectedIds: s.objects.map((o) => o.id) }));
  },

  clearSelection() {
    set({ selectedIds: [] });
  },

  /* ---------------- catalog + settings ---------------- */

  specFor(kind) {
    const base = CATALOG[kind];
    const ov = get().typeOverrides[kind];
    return ov ? { ...base, minW: ov.minW, minD: ov.minD } : base;
  },

  setTypeMinimums(kind, minW, minD, opts) {
    // Mirrors updateObject's contract: a transient write is one keystroke in a
    // field, so it neither pushes history nor pays a full serialisation. The
    // caller pushes history once when the edit begins.
    if (!opts?.transient) get().beginChange();
    set((s) => ({
      typeOverrides: {
        ...s.typeOverrides,
        [kind]: {
          minW: Math.max(0.1, minW),
          minD: Math.max(0.1, minD),
        },
      },
    }));
    if (!opts?.transient) persist(get());
  },

  resetTypeMinimums(kind) {
    get().beginChange();
    set((s) => {
      const next = { ...s.typeOverrides };
      delete next[kind];
      return { typeOverrides: next };
    });
    persist(get());
  },

  updateSettings(patch, opts) {
    if (!opts?.transient) get().beginChange();
    set((s) => ({ settings: { ...s.settings, ...patch } }));
    if (!opts?.transient) persist(get());
  },

  /* ---------------- measure ---------------- */

  setMeasureActive(active) {
    set((s) => ({
      measure: active
        ? { ...s.measure, active: true }
        : { active: false, points: [], cursor: null },
      selectedIds: active ? [] : s.selectedIds,
    }));
  },

  addMeasurePoint(p) {
    set((s) => ({ measure: { ...s.measure, points: [...s.measure.points, p] } }));
  },

  setMeasureCursor(p) {
    set((s) => ({ measure: { ...s.measure, cursor: p } }));
  },

  undoMeasurePoint() {
    set((s) => ({
      measure: { ...s.measure, points: s.measure.points.slice(0, -1) },
    }));
  },

  clearMeasure() {
    set((s) => ({ measure: { ...s.measure, points: [], cursor: null } }));
  },

  /* ---------------- persistence ---------------- */

  hydrate() {
    if (get().hydrated) return;

    // A shared link always wins over local state — that is the whole point of
    // sending someone the link.
    let loaded: LayoutSnapshot | null = null;
    let fromHash = false;
    try {
      const hash = window.location.hash;
      const match = /[#&]p=([^&]+)/.exec(hash);
      if (match) {
        const json = decompressFromEncodedURIComponent(match[1]);
        if (json) {
          loaded = parseSnapshot(JSON.parse(json));
          fromHash = loaded !== null;
        }
      }
    } catch {
      /* malformed link — fall through to local state */
    }

    if (!loaded) {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) loaded = parseSnapshot(JSON.parse(raw));
      } catch {
        /* corrupt local state — fall through to the concept layout */
      }
    }

    if (loaded) {
      set({
        objects: loaded.objects,
        typeOverrides: loaded.typeOverrides,
        settings: loaded.settings,
        hydrated: true,
      });
      /**
       * Persist immediately, including when the layout came from a shared link.
       * Opening someone's link is an act of adopting that layout — it becomes
       * your working copy. Without this, the toolbar's "saved locally" would be
       * a lie until the first edit, and a reload without the hash would silently
       * drop back to a stale layout.
       */
      persist(get());

      /**
       * Strip the #p= payload once adopted, or the link becomes a trap: the
       * hash outranks localStorage on every load, so refreshing an hour into
       * editing a shared layout would re-adopt the ORIGINAL snapshot and
       * persist it over the work — silently, and unrecoverably, since history
       * is in-memory only. Bookmarking the link made it recur.
       */
      if (fromHash) {
        try {
          window.history.replaceState(
            null,
            '',
            window.location.pathname + window.location.search,
          );
        } catch {
          /* replaceState can throw in exotic embeddings; the layout is already
             adopted and persisted, so carrying on is correct. */
        }
      }
    } else {
      set({ objects: conceptLayout(), hydrated: true });
      persist(get());
    }
  },

  resetToConcept() {
    get().beginChange();
    set({
      objects: conceptLayout(),
      typeOverrides: {},
      settings: { ...DEFAULT_SETTINGS },
      selectedIds: [],
    });
    persist(get());
  },

  clearAll() {
    get().beginChange();
    set({ objects: [], selectedIds: [] });
    persist(get());
  },

  shareUrl() {
    const payload = compressToEncodedURIComponent(
      JSON.stringify(snapshot(get())),
    );
    const { origin, pathname } = window.location;
    return `${origin}${pathname}#p=${payload}`;
  },
}));
