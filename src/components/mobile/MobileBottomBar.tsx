'use client';

import { useMemo } from 'react';

import { computeWarningsCached } from '@/lib/collision';
import { computeStats } from '@/lib/stats';
import { useLayoutStore } from '@/store/useLayoutStore';

/**
 * The phone's replacement for the side column.
 *
 * Everything the desktop shows at a glance — what is placed, how full the unit
 * is, what is wrong with it — collapses to three summary chips. The point is
 * that the summary is legible without opening anything: a user who only needs
 * to know whether the layout is still clean never has to cover the canvas.
 *
 * `computeWarningsCached` is memoised on the same (objects, settings) pair the
 * canvas and the stats sheet use, so reading it a third time here is free.
 */

export type MobileSheet = 'none' | 'objects' | 'stats' | 'warnings';

const CHIP =
  'flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg ' +
  'border border-black/10 bg-[var(--panel)] px-2 py-1 active:bg-black/5';

const CAPTION = 'text-[10px] font-medium uppercase tracking-wide opacity-55';

export default function MobileBottomBar({
  onOpen,
}: {
  onOpen: (sheet: MobileSheet) => void;
}) {
  const objects = useLayoutStore((s) => s.objects);
  const settings = useLayoutStore((s) => s.settings);

  const warnings = useMemo(
    () => computeWarningsCached(objects, settings),
    [objects, settings],
  );
  const stats = useMemo(() => computeStats(objects, warnings), [objects, warnings]);

  return (
    <nav
      aria-label="Layout panels"
      className="shrink-0 border-t border-[var(--border)] bg-[var(--background)] px-2 pt-2 md:hidden"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.5rem)' }}
    >
      {/* Explicit labels: the visible text of each chip is a bare number, which
          announces as "17" with no idea what 17 counts. */}
      <div className="flex items-stretch gap-2">
        <button
          type="button"
          className={CHIP}
          aria-label={`Objects — ${objects.length} placed. Open the layout controls.`}
          onClick={() => onOpen('objects')}
        >
          <span className={CAPTION}>Objects</span>
          <span className="text-sm font-semibold tabular-nums leading-none">
            {objects.length}
          </span>
        </button>

        <button
          type="button"
          className={CHIP}
          aria-label={`Floor area used — ${stats.utilisationPct.toFixed(0)} per cent. Open the statistics.`}
          onClick={() => onOpen('stats')}
        >
          <span className={CAPTION}>Used</span>
          <span className="text-sm font-semibold tabular-nums leading-none">
            {stats.utilisationPct.toFixed(0)}%
          </span>
        </button>

        <button
          type="button"
          className={CHIP}
          aria-label={`Warnings — ${stats.hardWarnings} hard, ${stats.softWarnings} soft. Open the warnings.`}
          onClick={() => onOpen('warnings')}
        >
          <span className={CAPTION}>Warnings</span>
          {stats.hardWarnings + stats.softWarnings === 0 ? (
            <span className="text-sm font-semibold leading-none text-emerald-700">
              <span aria-hidden="true">✓</span>
              <span className="sr-only">none</span>
            </span>
          ) : (
            <span className="text-sm font-semibold tabular-nums leading-none">
              {stats.hardWarnings > 0 ? (
                <span className="text-red-700">{stats.hardWarnings} hard</span>
              ) : (
                <span className="text-amber-700">{stats.softWarnings} soft</span>
              )}
            </span>
          )}
        </button>
      </div>
    </nav>
  );
}
