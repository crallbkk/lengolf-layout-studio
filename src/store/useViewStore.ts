'use client';

import { create } from 'zustand';

import { STRUCTURE_DEFAULTS, type Structure } from '@/lib/volume';
import type { PaletteMode } from '@/components/three/palette';

/**
 * View state for the 3D mode.
 *
 * Deliberately NOT part of LayoutSnapshot. The layout store's snapshot is the
 * undo unit and the share-link payload; dragging a ceiling slider is neither an
 * edit to the layout nor something that should cost forty undo steps. It also
 * keeps the snapshot schema — and its defensive parser — untouched.
 */

const STORAGE_KEY = 'lengolf-floorplan:view3d:v1';

export type ViewMode = '2d' | '3d';
export type CameraMode = 'orbit' | 'walk';

export interface ViewState {
  mode: ViewMode;
  cameraMode: CameraMode;
  structure: Structure;
  showCeiling: boolean;
  showBeams: boolean;
  showFigures: boolean;
  showLabels: boolean;
  palette: PaletteMode;
  hydrated: boolean;

  setMode(mode: ViewMode): void;
  setCameraMode(mode: CameraMode): void;
  setStructure(patch: Partial<Structure>): void;
  setPalette(mode: PaletteMode): void;
  resetStructure(): void;
  toggle(key: 'showCeiling' | 'showBeams' | 'showFigures' | 'showLabels'): void;
  hydrateView(): void;
}

const DEFAULTS = {
  cameraMode: 'orbit' as CameraMode,
  structure: { ...STRUCTURE_DEFAULTS } as Structure,
  showCeiling: false,
  showBeams: true,
  showFigures: true,
  showLabels: true,
  /**
   * Schematic by default. A model that always looks finished is how "mood
   * approved" quietly becomes "layout approved", which this project is under
   * standing instructions to avoid.
   */
  palette: 'schematic' as PaletteMode,
};

function persist(s: ViewState) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        cameraMode: s.cameraMode,
        structure: s.structure,
        showCeiling: s.showCeiling,
        showBeams: s.showBeams,
        showFigures: s.showFigures,
        showLabels: s.showLabels,
        palette: s.palette,
      }),
    );
  } catch {
    /* quota or private mode — the view settings just will not survive reload */
  }
}

const num = (v: unknown, fallback: number, min: number, max: number) =>
  typeof v === 'number' && Number.isFinite(v)
    ? Math.min(max, Math.max(min, v))
    : fallback;

export const useViewStore = create<ViewState>((set, get) => ({
  mode: '2d',
  ...DEFAULTS,
  hydrated: false,

  setMode(mode) {
    set({ mode });
  },

  setCameraMode(cameraMode) {
    set({ cameraMode });
    persist(get());
  },

  setPalette(mode) {
    set({ palette: mode });
    persist(get());
  },

  setStructure(patch) {
    set((s) => ({ structure: { ...s.structure, ...patch } }));
    persist(get());
  },

  resetStructure() {
    set({ structure: { ...STRUCTURE_DEFAULTS } });
    persist(get());
  },

  toggle(key) {
    set((s) => ({ [key]: !s[key] }) as Pick<ViewState, typeof key>);
    persist(get());
  },

  hydrateView() {
    if (get().hydrated) return;
    let loaded: Partial<ViewState> = {};
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const r = JSON.parse(raw) as Record<string, unknown>;
        const st = (r.structure ?? {}) as Record<string, unknown>;
        const slabSoffitM = num(
          st.slabSoffitM,
          STRUCTURE_DEFAULTS.slabSoffitM,
          2.2,
          8,
        );
        loaded = {
          cameraMode: r.cameraMode === 'walk' ? 'walk' : 'orbit',
          showCeiling: r.showCeiling === true,
          showBeams: r.showBeams !== false,
          showFigures: r.showFigures !== false,
          showLabels: r.showLabels !== false,
          palette: r.palette === 'finished' ? 'finished' : 'schematic',
          structure: {
            slabSoffitM,
            /**
             * A beam cannot hang above the slab it hangs from. The sliders keep
             * this invariant, but each field was clamped independently on
             * hydration, so a stale or hand-edited entry could violate it — and
             * the failure is in the dangerous direction: beam depth clamps to
             * zero so the beams vanish from the render, while the clearance
             * check still reports the beam soffit as the overhead, giving a bay
             * MORE headroom than the slab physically allows.
             */
            beamSoffitM: Math.min(
              num(st.beamSoffitM, STRUCTURE_DEFAULTS.beamSoffitM, 2, 8),
              slabSoffitM,
            ),
            beamWidthM: num(st.beamWidthM, STRUCTURE_DEFAULTS.beamWidthM, 0.2, 2),
            floorBuildUpM: num(st.floorBuildUpM, STRUCTURE_DEFAULTS.floorBuildUpM, 0, 0.5),
            bayPlatformM: num(st.bayPlatformM, STRUCTURE_DEFAULTS.bayPlatformM, 0, 0.6),
          },
        };
      }
    } catch {
      /* corrupt local state — fall back to defaults */
    }
    set({ ...loaded, hydrated: true });
  },
}));
