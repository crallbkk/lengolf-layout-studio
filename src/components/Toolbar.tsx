'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { FIT_EVENT } from '@/components/canvas/FloorPlanCanvas';
import { useLayoutStore } from '@/store/useLayoutStore';
import { useViewStore } from '@/store/useViewStore';

const BTN =
  'inline-flex items-center gap-1.5 rounded-md border border-black/15 px-2.5 py-1 text-xs font-medium ' +
  'hover:bg-black/[0.05] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent ' +
  'dark:border-white/20 dark:hover:bg-white/[0.08]';

const BTN_ON =
  'inline-flex items-center gap-1.5 rounded-md border border-sky-600 bg-sky-600 px-2.5 py-1 text-xs font-medium text-white ' +
  'hover:bg-sky-700 dark:border-sky-500 dark:bg-sky-600';

/** Grid step for display. Sub-metre steps read better in mm. */
function gridStepLabel(mm: number): string {
  if (!Number.isFinite(mm) || mm <= 0) return 'off';
  return mm >= 1000 ? `${(mm / 1000).toFixed(2)} m` : `${Math.round(mm)} mm`;
}

/**
 * Last-resort clipboard path for insecure origins, where
 * `navigator.clipboard.writeText` rejects. Selects the text in a throwaway
 * input and asks the document to copy it. Returns false if even that is denied,
 * in which case the caller surfaces the URL for manual copying.
 */
function copyViaTempInput(text: string): boolean {
  if (typeof document === 'undefined') return false;
  const input = document.createElement('input');
  input.value = text;
  input.readOnly = true;
  input.style.position = 'fixed';
  input.style.top = '0';
  input.style.left = '0';
  input.style.opacity = '0';
  document.body.appendChild(input);
  let ok = false;
  try {
    input.focus();
    input.select();
    input.setSelectionRange(0, text.length);
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  document.body.removeChild(input);
  return ok;
}

type CopyState = 'idle' | 'copied' | 'manual' | 'error';

export default function Toolbar() {
  const undo = useLayoutStore((s) => s.undo);
  const redo = useLayoutStore((s) => s.redo);
  const canUndo = useLayoutStore((s) => s.canUndo());
  const canRedo = useLayoutStore((s) => s.canRedo());

  const measuring = useLayoutStore((s) => s.measure.active);
  const measurePointCount = useLayoutStore((s) => s.measure.points.length);
  const setMeasureActive = useLayoutStore((s) => s.setMeasureActive);
  const clearMeasure = useLayoutStore((s) => s.clearMeasure);

  const snapEnabled = useLayoutStore((s) => s.settings.snapEnabled);
  const gridSnapMm = useLayoutStore((s) => s.settings.gridSnapMm);
  const updateSettings = useLayoutStore((s) => s.updateSettings);

  const shareUrl = useLayoutStore((s) => s.shareUrl);
  const hydrated = useLayoutStore((s) => s.hydrated);

  const viewMode = useViewStore((s) => s.mode);
  const setViewMode = useViewStore((s) => s.setMode);
  const is3d = viewMode === '3d';

  const [copyState, setCopyState] = useState<CopyState>('idle');
  const [manualUrl, setManualUrl] = useState<string | null>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (resetTimer.current !== null) clearTimeout(resetTimer.current);
    },
    [],
  );

  const flash = useCallback((state: CopyState) => {
    setCopyState(state);
    if (resetTimer.current !== null) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setCopyState('idle'), 2500);
  }, []);

  const handleShare = useCallback(async () => {
    let url: string;
    try {
      url = shareUrl();
    } catch {
      flash('error');
      return;
    }

    try {
      if (!navigator.clipboard) throw new Error('no clipboard api');
      await navigator.clipboard.writeText(url);
      setManualUrl(null);
      flash('copied');
      return;
    } catch {
      /* insecure origin, denied permission, or no API — fall through */
    }

    if (copyViaTempInput(url)) {
      setManualUrl(null);
      flash('copied');
      return;
    }

    // Never leave the user with no feedback: show the link so it can be copied
    // by hand. This state is sticky (no auto-reset) until the next attempt.
    if (resetTimer.current !== null) clearTimeout(resetTimer.current);
    setManualUrl(url);
    setCopyState('manual');
  }, [flash, shareUrl]);

  return (
    <header className="flex w-full flex-wrap items-center gap-x-3 gap-y-2 border-b border-black/10 px-3 py-2 dark:border-white/15">
      <h1 className="mr-1 text-sm font-semibold tracking-tight">
        LENGOLF <span className="opacity-50">·</span> One Bangkok Unit 1225{' '}
        <span className="font-normal opacity-60">— Layout Studio</span>
      </h1>

      {/* Plan and model are two views of one layout, so this is a view switch
          rather than a mode: nothing about the edit state changes with it. */}
      <div
        role="radiogroup"
        aria-label="View"
        className="flex overflow-hidden rounded-md border border-black/15 dark:border-white/20"
      >
        {(['2d', '3d'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={viewMode === m}
            onClick={() => setViewMode(m)}
            title={m === '2d' ? 'Plan view' : '3D model view'}
            className={
              viewMode === m
                ? 'bg-slate-800 px-2.5 py-1 text-xs font-medium text-white'
                : 'px-2.5 py-1 text-xs font-medium hover:bg-black/[0.05] dark:hover:bg-white/[0.08]'
            }
          >
            {m === '2d' ? 'Plan' : '3D'}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className={BTN}
          onClick={undo}
          disabled={!canUndo}
          aria-label="Undo the last change"
          title="Undo"
        >
          <span aria-hidden="true">↶</span> Undo
        </button>
        <button
          type="button"
          className={BTN}
          onClick={redo}
          disabled={!canRedo}
          aria-label="Redo the last undone change"
          title="Redo"
        >
          <span aria-hidden="true">↷</span> Redo
        </button>
      </div>

      {/* Fit, measure and snap all act on the plan canvas, which is not mounted
          in 3D. Hiding them beats leaving dead controls on screen. */}
      {is3d ? null : (
        <>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className="rounded border border-black/15 px-2 py-1 text-xs hover:bg-black/5"
          onClick={() => window.dispatchEvent(new Event(FIT_EVENT))}
          aria-label="Zoom to fit the whole plan"
          title="Fit plan to view (F)"
        >
          <span aria-hidden="true">⤢</span> Fit
        </button>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className={measuring ? BTN_ON : BTN}
          onClick={() => setMeasureActive(!measuring)}
          aria-pressed={measuring}
          aria-label={measuring ? 'Turn the measure tool off' : 'Turn the measure tool on'}
          title="Measure tool"
        >
          <span aria-hidden="true">⟷</span> Measure
        </button>
        {measuring ? (
          <button
            type="button"
            className={BTN}
            onClick={clearMeasure}
            disabled={measurePointCount === 0}
            aria-label="Clear the current measurement"
            title="Clear measurement"
          >
            Clear
          </button>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          className={snapEnabled ? BTN_ON : BTN}
          onClick={() => updateSettings({ snapEnabled: !snapEnabled })}
          aria-pressed={snapEnabled}
          aria-label={snapEnabled ? 'Turn grid snapping off' : 'Turn grid snapping on'}
          title="Snap to grid"
        >
          <span aria-hidden="true">⊞</span> Snap
        </button>
        <span className="text-xs tabular-nums opacity-60">
          {gridStepLabel(gridSnapMm)} grid
        </span>
      </div>
        </>
      )}

      <div className="ml-auto flex items-center gap-2">
        <span
          className="text-[11px] opacity-55"
          title="Changes are saved to this browser's local storage, not to a server."
        >
          {hydrated ? 'Saved locally' : 'Loading…'}
        </span>

        <button
          type="button"
          className={BTN}
          onClick={handleShare}
          aria-label="Copy a shareable link to this layout"
          title="Share link"
        >
          <span aria-hidden="true">🔗</span> Share link
        </button>

        <span aria-live="polite" className="min-w-16 text-xs">
          {copyState === 'copied' ? (
            <span className="text-emerald-700 dark:text-emerald-400">
              <span aria-hidden="true">✓</span> Copied
            </span>
          ) : copyState === 'error' ? (
            <span className="text-red-700 dark:text-red-400">Could not build link</span>
          ) : copyState === 'manual' ? (
            <span className="text-amber-700 dark:text-amber-400">Copy manually:</span>
          ) : null}
        </span>
      </div>

      {manualUrl !== null ? (
        <input
          type="text"
          readOnly
          value={manualUrl}
          aria-label="Shareable link — select and copy this manually"
          onFocus={(e) => e.currentTarget.select()}
          ref={(el) => {
            el?.select();
          }}
          className="w-full rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs dark:border-amber-900 dark:bg-amber-950/40"
        />
      ) : null}
    </header>
  );
}
