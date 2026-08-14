'use client';

import dynamic from 'next/dynamic';
import { useCallback, useRef, useState, type ReactNode } from 'react';

import BottomSheet from '@/components/mobile/BottomSheet';
import WalkStick from '@/components/three/WalkStick';
import { useIsMobile } from '@/hooks/useMediaQuery';
import type { ClearanceResult } from '@/lib/volume';
import { SWING_CLEARANCE_M, type Structure } from '@/lib/volume';
import { useLayoutStore } from '@/store/useLayoutStore';
import { useViewStore } from '@/store/useViewStore';
import {
  CAMERA_VIEWS,
  type CameraView,
  type CameraViewKey,
} from '@/components/three/cameraViews';

/**
 * The 3D panel: canvas plus the controls that make it a study tool rather than
 * a picture — the two soffit heights, and a live read of what they do to the
 * swing clearance in every bay.
 *
 * On desktop those two readouts float over opposite bottom corners. On a phone
 * a w-72 and a w-64 panel do not fit side by side at all: they overlapped each
 * other and buried the model they exist to explain. Below md they collapse into
 * one bottom bar showing each panel's headline figure, which opens the full
 * panel in a sheet.
 */

// WebGL has no server-side equivalent, so the whole scene is client-only.
const Scene3D = dynamic(() => import('@/components/three/Scene3D'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-[var(--muted)]">
      Building the model…
    </div>
  ),
});

const PRESETS: Array<{ key: CameraViewKey; label: string; walk: boolean }> = [
  { key: 'overview', label: 'Overview', walk: false },
  { key: 'entrance', label: 'Entrance', walk: true },
  { key: 'bayRun', label: 'Bay run', walk: true },
  { key: 'glazing', label: 'Plaza glazing', walk: true },
  { key: 'vip', label: 'VIP', walk: true },
];

/** The `max-md:` sizing keeps the desktop chip row byte-identical to before:
 *  shrink-0 and nowrap are only wanted in the mobile scroller. */
const CHIP =
  'rounded-md border border-slate-300 bg-white/90 px-2 py-1 text-[11px] font-medium text-slate-700 ' +
  'shadow-sm backdrop-blur transition-colors hover:bg-slate-100 ' +
  'max-md:min-h-11 max-md:shrink-0 max-md:whitespace-nowrap max-md:px-3';
const CHIP_ON =
  'rounded-md border border-slate-800 bg-slate-800 px-2 py-1 text-[11px] font-medium text-white shadow-sm ' +
  'max-md:min-h-11 max-md:shrink-0 max-md:whitespace-nowrap max-md:px-3';

export default function View3D() {
  const objects = useLayoutStore((s) => s.objects);
  const selectedIds = useLayoutStore((s) => s.selectedIds);
  const select = useLayoutStore((s) => s.select);

  const cameraMode = useViewStore((s) => s.cameraMode);
  const setCameraMode = useViewStore((s) => s.setCameraMode);
  const structure = useViewStore((s) => s.structure);
  const setStructure = useViewStore((s) => s.setStructure);
  const resetStructure = useViewStore((s) => s.resetStructure);
  const showCeiling = useViewStore((s) => s.showCeiling);
  const showBeams = useViewStore((s) => s.showBeams);
  const showFigures = useViewStore((s) => s.showFigures);
  const showLabels = useViewStore((s) => s.showLabels);
  const paletteMode = useViewStore((s) => s.palette);
  const setPalette = useViewStore((s) => s.setPalette);
  const toggle = useViewStore((s) => s.toggle);

  const isMobile = useIsMobile();

  /**
   * Labels are off by default on a phone and on by default everywhere else.
   *
   * Seventeen `<Html>` labels is seventeen live DOM nodes composited over the
   * canvas every frame, and at 375px wide they cover most of what they annotate.
   * The default belongs on the small screen, not in the persisted setting:
   * `useViewStore` is out of scope here, and writing a phone's preference into
   * a store that syncs to localStorage would follow the user back to a desktop.
   * Local state keeps the `Labels` chip honest — it still reflects and controls
   * exactly what is on screen.
   */
  const [mobileLabels, setMobileLabels] = useState(false);
  const effectiveShowLabels = isMobile ? mobileLabels : showLabels;

  const containerRef = useRef<HTMLDivElement>(null);
  // Same reason as enterWalk: if walk mode was persisted from a previous
  // session, opening 3D must not start from the exterior overview camera.
  const [view, setView] = useState<CameraView>(() =>
    useViewStore.getState().cameraMode === 'walk'
      ? CAMERA_VIEWS.entrance
      : CAMERA_VIEWS.overview,
  );
  const [viewNonce, setViewNonce] = useState(0);
  const [clearances, setClearances] = useState<ClearanceResult[]>([]);

  const handleSelect = useCallback(
    (id: string, additive: boolean) => select(id, additive),
    [select],
  );
  const handleBackgroundClick = useCallback(() => select(null), [select]);
  const handleClearances = useCallback((r: ClearanceResult[]) => setClearances(r), []);

  /**
   * Export the current frame. Reaching into the DOM for the canvas rather than
   * threading a ref out of the dynamically imported scene keeps the boundary
   * between panel and renderer at one prop-shaped surface; there is exactly one
   * canvas in this subtree.
   */
  const savePng = () => {
    const canvas = containerRef.current?.querySelector('canvas');
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lengolf-1225-view.png';
    a.click();
  };

  const applyPreset = (key: CameraViewKey, walk: boolean) => {
    setCameraMode(walk ? 'walk' : 'orbit');
    setView(CAMERA_VIEWS[key]);
    setViewNonce((n) => n + 1);
  };

  /**
   * Walk always starts from an interior viewpoint.
   *
   * The chip used to flip the mode without touching the view, so WalkControls
   * mounted and applied whatever `view` held — by default the `overview`
   * camera, which sits 14 m beyond the south wall at 19 m up. Flattened to eye
   * height that spawned the walker outside the building, facing its exterior,
   * with a wall to get through before seeing anything.
   */
  const enterWalk = () => applyPreset('entrance', true);

  const failing = clearances.filter((c) => !c.ok);
  const tightest = clearances.reduce<ClearanceResult | null>(
    (min, c) => (min === null || c.clearM < min.clearM ? c : min),
    null,
  );

  const clearanceHeadline =
    clearances.length === 0
      ? 'no bays'
      : failing.length > 0
        ? `${failing.length} of ${clearances.length} short`
        : tightest
          ? `tightest ${tightest.clearM.toFixed(2)} m`
          : 'all clear';

  const structureBody = (
    <StructureBody
      structure={structure}
      setStructure={setStructure}
      resetStructure={resetStructure}
      showBeams={showBeams}
      showCeiling={showCeiling}
      showFigures={showFigures}
      showLabels={effectiveShowLabels}
      onToggleLabels={() =>
        isMobile ? setMobileLabels((v) => !v) : toggle('showLabels')
      }
      toggle={toggle}
    />
  );

  const clearanceBody = (
    <ClearanceBody
      clearances={clearances}
      failing={failing.length}
      tightest={tightest}
    />
  );

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <Scene3D
        objects={objects}
        selectedIds={selectedIds}
        structure={structure}
        cameraMode={cameraMode}
        showCeiling={showCeiling}
        showBeams={showBeams}
        showFigures={showFigures}
        showLabels={effectiveShowLabels}
        paletteMode={paletteMode}
        view={view}
        viewNonce={viewNonce}
        onSelect={handleSelect}
        onBackgroundClick={handleBackgroundClick}
        onClearances={handleClearances}
      />

      {/* Viewpoints and camera mode.

          Below md the row scrolls sideways instead of wrapping. Wrapping put
          four rows of chips over the top third of the model; scrolling keeps it
          to one. The scroller stays pointer-events-none so the gaps between
          chips remain draggable canvas — a touch that lands on a chip still
          scrolls the row, because scroll chaining follows the hit element's
          ancestors regardless of their own hit-testing. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 p-2">
        <div className="flex flex-wrap items-center gap-1.5 max-md:flex-nowrap max-md:overflow-x-auto max-md:pb-1">
          {/* The `order` overrides apply below md only, so the DOM order — and
              therefore the desktop row — is untouched. On a phone the row
              scrolls, and what scrolls off the right is effectively hidden:
              Orbit/Walk and Schematic/Materials are the two switches that
              change what you are looking at, so they come before the five
              viewpoint presets, which only move you within it. */}
          <div className="pointer-events-auto flex items-center gap-1.5 max-md:shrink-0 max-md:order-1">
            <button
              type="button"
              className={cameraMode === 'orbit' ? CHIP_ON : CHIP}
              onClick={() => setCameraMode('orbit')}
              aria-pressed={cameraMode === 'orbit'}
            >
              Orbit
            </button>
            <button
              type="button"
              className={cameraMode === 'walk' ? CHIP_ON : CHIP}
              onClick={() => enterWalk()}
              aria-pressed={cameraMode === 'walk'}
            >
              Walk
            </button>
          </div>
          <div className="pointer-events-auto ml-2 flex items-center gap-1.5 max-md:shrink-0 max-md:order-3">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                className={CHIP}
                onClick={() => applyPreset(p.key, p.walk)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="pointer-events-auto ml-2 flex items-center gap-1.5 max-md:shrink-0 max-md:order-2">
            <button
              type="button"
              className={paletteMode === 'schematic' ? CHIP_ON : CHIP}
              onClick={() => setPalette('schematic')}
              aria-pressed={paletteMode === 'schematic'}
              title="Study colours, flat light"
            >
              Schematic
            </button>
            <button
              type="button"
              className={paletteMode === 'finished' ? CHIP_ON : CHIP}
              onClick={() => setPalette('finished')}
              aria-pressed={paletteMode === 'finished'}
              title="LENGOLF materials, warm low light"
            >
              Materials
            </button>
          </div>
          <button
            type="button"
            className={`${CHIP} pointer-events-auto ml-2 max-md:order-4`}
            onClick={savePng}
          >
            Save PNG
          </button>
          <p className="pointer-events-none ml-auto rounded-md bg-white/80 px-2 py-1 text-[10px] leading-tight text-slate-500 backdrop-blur max-md:hidden">
            {cameraMode === 'walk'
              ? 'Drag to look · W A S D to walk · Shift to run'
              : 'Drag to orbit · scroll to zoom · right-drag to pan'}
          </p>
        </div>
      </div>

      {/* The touch equivalent of the desktop hint, on its own line so it cannot
          widen the scrolling chip row. */}
      <p className="pointer-events-none absolute inset-x-0 top-16 mx-auto w-fit rounded-md bg-white/80 px-2 py-1 text-[10px] leading-tight text-slate-500 backdrop-blur md:hidden">
        {cameraMode === 'walk'
          ? 'Drag to look · stick to walk'
          : 'Drag to orbit · pinch to zoom'}
      </p>

      {cameraMode === 'walk' ? <WalkStick /> : null}

      {/* Structure. The two numbers everything else hangs off. */}
      <div className="pointer-events-auto absolute bottom-2 left-2 w-72 rounded-lg border border-slate-300 bg-white/92 p-3 text-xs shadow-sm backdrop-blur max-md:hidden">
        {structureBody}
      </div>

      {/* Swing clearance — the question this view exists to answer. */}
      {clearances.length > 0 ? (
        <div className="pointer-events-none absolute right-2 bottom-2 w-64 rounded-lg border border-slate-300 bg-white/92 p-3 text-xs shadow-sm backdrop-blur max-md:hidden">
          {clearanceBody}
        </div>
      ) : null}

      {/* Gated in JS, not just by `md:hidden`. Left to CSS, the sheets stayed
          mounted at desktop width with a live window Escape listener, swallowing
          the key on a viewport where nothing of theirs was visible. */}
      {isMobile ? (
        <MobileHud
          slabSoffitM={structure.slabSoffitM}
          clearanceHeadline={clearanceHeadline}
          failing={failing.length}
          structureBody={structureBody}
          clearanceBody={clearanceBody}
        />
      ) : null}
    </div>
  );
}

/**
 * The phone's replacement for the two floating panels: a bar of headline figures
 * that opens the full panel in a sheet.
 *
 * Which sheet is open lives here so that it dies with the bar — see the same
 * reasoning in MobilePanels.
 */
function MobileHud({
  slabSoffitM,
  clearanceHeadline,
  failing,
  structureBody,
  clearanceBody,
}: {
  slabSoffitM: number;
  clearanceHeadline: string;
  failing: number;
  structureBody: ReactNode;
  clearanceBody: ReactNode;
}) {
  const [sheet, setSheet] = useState<'none' | 'structure' | 'clearance'>('none');
  const close = () => setSheet('none');

  return (
    <>
      <div
        className="pointer-events-auto absolute inset-x-0 bottom-0 flex items-stretch gap-2 border-t border-slate-300 bg-white/92 px-2 pt-2 backdrop-blur md:hidden"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.5rem)' }}
      >
        <HudButton
          caption="Structure"
          value={`${slabSoffitM.toFixed(2)} m slab`}
          onClick={() => setSheet('structure')}
        />
        <HudButton
          caption="Swing clearance"
          value={clearanceHeadline}
          tone={failing > 0 ? 'warn' : 'neutral'}
          onClick={() => setSheet('clearance')}
        />
      </div>

      <BottomSheet open={sheet === 'structure'} onClose={close} title="Structure">
        <div className="px-3 pb-3 text-xs">{structureBody}</div>
      </BottomSheet>

      <BottomSheet open={sheet === 'clearance'} onClose={close} title="Swing clearance">
        <div className="px-3 pb-3 text-xs">{clearanceBody}</div>
      </BottomSheet>
    </>
  );
}

function HudButton({
  caption,
  value,
  tone = 'neutral',
  onClick,
}: {
  caption: string;
  value: string;
  tone?: 'neutral' | 'warn';
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${caption} — ${value}. Open the panel.`}
      className="flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center rounded-lg border border-slate-300 bg-white px-2 py-1 active:bg-slate-100"
    >
      <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
        {caption}
      </span>
      <span
        className={`truncate text-sm font-semibold tabular-nums leading-tight ${
          tone === 'warn' ? 'text-orange-700' : 'text-slate-800'
        }`}
      >
        {value}
      </span>
    </button>
  );
}

/**
 * Shared by the desktop floating panel and the mobile sheet, so there is one
 * copy of the controls and they cannot drift apart.
 */
function StructureBody({
  structure,
  setStructure,
  resetStructure,
  showBeams,
  showCeiling,
  showFigures,
  showLabels,
  onToggleLabels,
  toggle,
}: {
  structure: Structure;
  setStructure: (patch: Partial<Structure>) => void;
  resetStructure: () => void;
  showBeams: boolean;
  showCeiling: boolean;
  showFigures: boolean;
  showLabels: boolean;
  onToggleLabels: () => void;
  toggle: (key: 'showCeiling' | 'showBeams' | 'showFigures' | 'showLabels') => void;
}) {
  return (
    <>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 max-md:hidden">
          Structure
        </h3>
        <button
          type="button"
          onClick={resetStructure}
          className="text-[10px] text-slate-500 underline hover:text-slate-800 max-md:ml-auto max-md:min-h-11 max-md:text-xs"
        >
          reset
        </button>
      </div>

      <Slider
        label="Slab soffit"
        value={structure.slabSoffitM}
        min={2.4}
        max={5.5}
        step={0.05}
        onChange={(v) =>
          setStructure({
            slabSoffitM: v,
            // The beam soffit can never sit above the slab it hangs from.
            beamSoffitM: Math.min(structure.beamSoffitM, v),
          })
        }
      />
      <Slider
        label="Beam soffit"
        value={structure.beamSoffitM}
        min={2.2}
        max={structure.slabSoffitM}
        step={0.05}
        onChange={(v) => setStructure({ beamSoffitM: v })}
      />
      <Slider
        label="Bay platform"
        value={structure.bayPlatformM}
        min={0}
        max={0.4}
        step={0.01}
        onChange={(v) => setStructure({ bayPlatformM: v })}
      />

      <p className="mt-2 border-t border-slate-200 pt-2 text-[10px] leading-snug text-amber-700">
        Heights are estimated from the site photographs, not from a drawing.
        Clear height is unconfirmed by the landlord.
      </p>

      <div className="mt-2 flex flex-wrap gap-1.5 border-t border-slate-200 pt-2">
        <Chip on={showBeams} onClick={() => toggle('showBeams')}>
          Beams
        </Chip>
        <Chip on={showCeiling} onClick={() => toggle('showCeiling')}>
          Slab
        </Chip>
        <Chip on={showFigures} onClick={() => toggle('showFigures')}>
          Figures
        </Chip>
        <Chip on={showLabels} onClick={onToggleLabels}>
          Labels
        </Chip>
      </div>
    </>
  );
}

function ClearanceBody({
  clearances,
  failing,
  tightest,
}: {
  clearances: ClearanceResult[];
  failing: number;
  tightest: ClearanceResult | null;
}) {
  if (clearances.length === 0) {
    return (
      <p className="text-[11px] leading-snug text-slate-500">
        No bays placed yet, so there is nothing to check.
      </p>
    );
  }

  return (
    <>
      <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 max-md:hidden">
        Swing clearance
      </h3>
      <p className="mb-2 text-[10px] leading-snug text-slate-500">
        Lowest soffit over each bay&rsquo;s play band, above the platform. A full
        driver swing wants {SWING_CLEARANCE_M.toFixed(2)} m.
      </p>
      <ul className="space-y-0.5">
        {clearances.map((c) => (
          <li
            key={c.objectId}
            className={`flex items-baseline justify-between gap-2 tabular-nums max-md:py-1 max-md:text-sm ${
              c.ok ? 'text-slate-600' : 'font-semibold text-orange-700'
            }`}
          >
            <span className="truncate">
              {c.label}
              {c.underBeam ? (
                <span className="ml-1 text-[10px] font-normal opacity-70">
                  under beam
                </span>
              ) : null}
            </span>
            <span>{c.clearM.toFixed(2)} m</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 border-t border-slate-200 pt-1.5 text-[10px] text-slate-500">
        {failing > 0
          ? `${failing} of ${clearances.length} bays short of a full swing.`
          : tightest
            ? `Tightest bay ${tightest.clearM.toFixed(2)} m — all clear.`
            : null}
      </p>
    </>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="mb-2 block max-md:mb-4">
      <span className="flex items-baseline justify-between text-[11px] text-slate-600 max-md:text-sm">
        {label}
        <span className="tabular-nums font-medium text-slate-800">
          {value.toFixed(2)} m
        </span>
      </span>
      {/* A 4px range track is a miss on touch; h-11 gives the thumb a
          finger-sized strip to be grabbed anywhere along. */}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-0.5 w-full accent-slate-800 max-md:h-11"
      />
    </label>
  );
}

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={
        on
          ? 'rounded border border-slate-800 bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-white max-md:min-h-11 max-md:px-3 max-md:text-xs'
          : 'rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-100 max-md:min-h-11 max-md:px-3 max-md:text-xs'
      }
    >
      {children}
    </button>
  );
}
