'use client';

import dynamic from 'next/dynamic';
import { useCallback, useRef, useState } from 'react';

import type { ClearanceResult } from '@/lib/volume';
import { SWING_CLEARANCE_M } from '@/lib/volume';
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
];

const CHIP =
  'rounded-md border border-slate-300 bg-white/90 px-2 py-1 text-[11px] font-medium text-slate-700 ' +
  'shadow-sm backdrop-blur transition-colors hover:bg-slate-100';
const CHIP_ON =
  'rounded-md border border-slate-800 bg-slate-800 px-2 py-1 text-[11px] font-medium text-white shadow-sm';

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
  const toggle = useViewStore((s) => s.toggle);

  const containerRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<CameraView>(CAMERA_VIEWS.overview);
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

  const failing = clearances.filter((c) => !c.ok);
  const tightest = clearances.reduce<ClearanceResult | null>(
    (min, c) => (min === null || c.clearM < min.clearM ? c : min),
    null,
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
        showLabels={showLabels}
        view={view}
        viewNonce={viewNonce}
        onSelect={handleSelect}
        onBackgroundClick={handleBackgroundClick}
        onClearances={handleClearances}
      />

      {/* Viewpoints and camera mode. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-center gap-1.5 p-2">
        <div className="pointer-events-auto flex items-center gap-1.5">
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
            onClick={() => setCameraMode('walk')}
            aria-pressed={cameraMode === 'walk'}
          >
            Walk
          </button>
        </div>
        <div className="pointer-events-auto ml-2 flex items-center gap-1.5">
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
        <button type="button" className={`${CHIP} pointer-events-auto ml-2`} onClick={savePng}>
          Save PNG
        </button>
        <p className="pointer-events-none ml-auto rounded-md bg-white/80 px-2 py-1 text-[10px] leading-tight text-slate-500 backdrop-blur">
          {cameraMode === 'walk'
            ? 'Drag to look · W A S D to walk · Shift to run'
            : 'Drag to orbit · scroll to zoom · right-drag to pan'}
        </p>
      </div>

      {/* Structure. The two numbers everything else hangs off. */}
      <div className="pointer-events-auto absolute bottom-2 left-2 w-72 rounded-lg border border-slate-300 bg-white/92 p-3 text-xs shadow-sm backdrop-blur">
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Structure
          </h3>
          <button
            type="button"
            onClick={resetStructure}
            className="text-[10px] text-slate-500 underline hover:text-slate-800"
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
          <Chip on={showLabels} onClick={() => toggle('showLabels')}>
            Labels
          </Chip>
        </div>
      </div>

      {/* Swing clearance — the question this view exists to answer. */}
      {clearances.length > 0 ? (
        <div className="pointer-events-none absolute right-2 bottom-2 w-64 rounded-lg border border-slate-300 bg-white/92 p-3 text-xs shadow-sm backdrop-blur">
          <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Swing clearance
          </h3>
          <p className="mb-2 text-[10px] leading-snug text-slate-500">
            Lowest soffit over each bay&rsquo;s play band, above the platform. A
            full driver swing wants {SWING_CLEARANCE_M.toFixed(2)} m.
          </p>
          <ul className="space-y-0.5">
            {clearances.map((c) => (
              <li
                key={c.objectId}
                className={`flex items-baseline justify-between gap-2 tabular-nums ${
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
            {failing.length > 0
              ? `${failing.length} of ${clearances.length} bays short of a full swing.`
              : tightest
                ? `Tightest bay ${tightest.clearM.toFixed(2)} m — all clear.`
                : null}
          </p>
        </div>
      ) : null}
    </div>
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
    <label className="mb-2 block">
      <span className="flex items-baseline justify-between text-[11px] text-slate-600">
        {label}
        <span className="tabular-nums font-medium text-slate-800">
          {value.toFixed(2)} m
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-0.5 w-full accent-slate-800"
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
          ? 'rounded border border-slate-800 bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-white'
          : 'rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-100'
      }
    >
      {children}
    </button>
  );
}
