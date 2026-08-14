'use client';

import { useMemo, useState } from 'react';

import { computeWarningsCached } from '@/lib/collision';
import type { Warning } from '@/lib/types';
import { useLayoutStore } from '@/store/useLayoutStore';

/**
 * A pathological layout (everything overlapping everything) produces O(n²)
 * warnings. Rendering all of them would stall the browser mid-drag, so the list
 * is capped and the remainder is summarised.
 */
const MAX_RENDERED = 50;

/**
 * `headless` drops the title row and the collapse control, for when the panel
 * is already inside something titled and dismissable — the mobile bottom sheet.
 * Two nested disclosure controls invite you to collapse a panel inside a sheet
 * and be left looking at an empty sheet.
 */
export default function WarningsPanel({ headless = false }: { headless?: boolean }) {
  const objects = useLayoutStore((s) => s.objects);
  const settings = useLayoutStore((s) => s.settings);
  const select = useLayoutStore((s) => s.select);

  const [collapsed, setCollapsed] = useState(false);

  const warnings = useMemo(
    () => computeWarningsCached(objects, settings),
    [objects, settings],
  );

  /** Hard first, soft after; original order preserved within each group. */
  const ordered = useMemo(() => {
    const hard: Warning[] = [];
    const soft: Warning[] = [];
    for (const w of warnings) (w.severity === 'hard' ? hard : soft).push(w);
    return [...hard, ...soft];
  }, [warnings]);

  const labels = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of objects) m.set(o.id, o.label);
    return m;
  }, [objects]);

  const hardCount = ordered.filter((w) => w.severity === 'hard').length;
  const softCount = ordered.length - hardCount;
  const shown = ordered.slice(0, MAX_RENDERED);
  const hidden = ordered.length - shown.length;

  const selectImplicated = (warning: Warning) => {
    const ids = Array.from(new Set(warning.objectIds));
    if (ids.length === 0) {
      select(null);
      return;
    }
    // Replace the selection with the first id, then extend additively. Doing it
    // in this order means a click always yields exactly the implicated set,
    // never a toggle of whatever happened to be selected before.
    select(ids[0]);
    for (let i = 1; i < ids.length; i++) select(ids[i], true);
  };

  return (
    <section
      aria-label="Layout warnings"
      className={
        headless ? '' : 'rounded-md border border-black/10 dark:border-white/15'
      }
    >
      {headless ? null : (
      <h2 className="m-0">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          aria-label={`${collapsed ? 'Expand' : 'Collapse'} warnings — ${hardCount} hard, ${softCount} soft`}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-semibold hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
        >
          <span aria-hidden="true" className="text-xs opacity-60">
            {collapsed ? '▸' : '▾'}
          </span>
          <span>Warnings</span>
          <span className="ml-auto flex items-center gap-1.5 text-xs font-medium tabular-nums">
            {ordered.length === 0 ? (
              <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400">
                <span aria-hidden="true">✓</span> 0
              </span>
            ) : (
              <>
                {hardCount > 0 ? (
                  <span className="rounded-full border border-red-300 bg-red-50 px-2 py-0.5 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400">
                    {hardCount} hard
                  </span>
                ) : null}
                {softCount > 0 ? (
                  <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400">
                    {softCount} soft
                  </span>
                ) : null}
              </>
            )}
          </span>
        </button>
      </h2>
      )}

      {!headless && collapsed ? null : ordered.length === 0 ? (
        <p className="px-3 pb-3 pt-1 text-xs leading-relaxed text-emerald-700 dark:text-emerald-400">
          <span aria-hidden="true">✓</span> Everything fits. No overlaps, nothing
          outside the unit, and every clearance rule is satisfied.
        </p>
      ) : (
        // The scroll cap is for the desktop column, where this panel shares a
        // fixed height with the side panel above it. In the sheet the sheet
        // itself scrolls, and a nested cap would strand the last warnings.
        <ul className="m-0 list-none p-0 md:max-h-80 md:overflow-y-auto">
          {shown.map((w) => {
            const names = w.objectIds
              .map((id) => labels.get(id))
              .filter((n): n is string => Boolean(n));
            return (
              <li key={w.id} className="border-t border-black/10 dark:border-white/10">
                <button
                  type="button"
                  onClick={() => selectImplicated(w)}
                  aria-label={`Select ${names.join(' and ') || 'objects'} — ${w.message}`}
                  className="flex min-h-11 w-full items-start gap-2 px-3 py-2 text-left hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                >
                  <span
                    aria-hidden="true"
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      w.severity === 'hard' ? 'bg-red-600' : 'bg-amber-500'
                    }`}
                  />
                  <span className="min-w-0">
                    <span className="block text-xs leading-snug">{w.message}</span>
                    {names.length > 0 ? (
                      <span className="mt-0.5 block truncate text-[10px] opacity-60">
                        {names.join(' · ')}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
          {hidden > 0 ? (
            <li className="border-t border-black/10 px-3 py-2 text-[11px] opacity-60 dark:border-white/10">
              +{hidden} more not shown — fix the ones above first.
            </li>
          ) : null}
        </ul>
      )}
    </section>
  );
}
