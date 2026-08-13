'use client';

import { useMemo, type ReactNode } from 'react';

import { computeWarnings } from '@/lib/collision';
import { computeStats } from '@/lib/stats';
import { useLayoutStore } from '@/store/useLayoutStore';

/**
 * Deterministic formatting (toFixed, not toLocaleString) so the server and the
 * client always agree — a locale-formatted number is a hydration mismatch
 * waiting to happen.
 */
const fmt = (n: number, dp = 1) => n.toFixed(dp);

function Tile({
  label,
  width = 'w-40',
  tone = 'neutral',
  children,
  note,
}: {
  label: string;
  /** Fixed width: tiles must never resize as the numbers change. */
  width?: string;
  tone?: 'neutral' | 'good' | 'warn' | 'bad';
  children: ReactNode;
  note?: ReactNode;
}) {
  const toneRing =
    tone === 'bad'
      ? 'border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40'
      : tone === 'warn'
        ? 'border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40'
        : tone === 'good'
          ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40'
          : 'border-black/10 bg-black/[0.02] dark:border-white/15 dark:bg-white/[0.03]';

  return (
    <div
      className={`${width} shrink-0 rounded-md border px-3 py-2 ${toneRing}`}
    >
      <div className="truncate text-[10px] font-medium uppercase tracking-wide opacity-60">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-semibold tabular-nums leading-tight">
        {children}
      </div>
      {note ? (
        <div className="mt-0.5 text-[10px] leading-snug tabular-nums opacity-60">
          {note}
        </div>
      ) : null}
    </div>
  );
}

export default function StatsBar() {
  const objects = useLayoutStore((s) => s.objects);
  const settings = useLayoutStore((s) => s.settings);

  const warnings = useMemo(
    () => computeWarnings(objects, settings),
    [objects, settings],
  );
  const stats = useMemo(() => computeStats(objects, warnings), [objects, warnings]);

  const overCommitted = stats.freeM2 < 0;
  const doubleCounted = stats.overlapAreaM2 > 0.01;
  const totalWarnings = stats.hardWarnings + stats.softWarnings;

  return (
    <section
      aria-label="Layout statistics"
      className="flex w-full items-stretch gap-2 overflow-x-auto border-y border-black/10 px-3 py-2 dark:border-white/15"
    >
      <Tile
        label="Unit area"
        width="w-44"
        note={`traced polygon · ${fmt(stats.leaseAreaM2, 0)} m² lease`}
      >
        {fmt(stats.totalAreaM2, 2)} m²
      </Tile>

      <Tile
        label="Occupied"
        width="w-44"
        tone={doubleCounted ? 'warn' : 'neutral'}
        note={
          doubleCounted ? (
            <span className="text-amber-700 dark:text-amber-400">
              ⚠ {fmt(stats.overlapAreaM2, 2)} m² of objects overlap — this figure
              double-counts it
            </span>
          ) : null
        }
      >
        {fmt(stats.occupiedM2, 2)} m²
      </Tile>

      <Tile
        label="Free"
        tone={overCommitted ? 'bad' : 'neutral'}
        note={overCommitted ? 'over-committed' : null}
      >
        <span className={overCommitted ? 'text-red-700 dark:text-red-400' : undefined}>
          {fmt(stats.freeM2, 2)} m²
        </span>
      </Tile>

      <Tile label="Utilisation" width="w-32">
        {fmt(stats.utilisationPct, 1)} %
      </Tile>

      <Tile label="Bays" width="w-44" note="Social · AI · VIP">
        <span className="tabular-nums">
          {stats.socialBays} · {stats.aiBays} · {stats.vipBays}
        </span>
        <span className="ml-2 text-xs font-normal opacity-60">
          {stats.socialBays + stats.aiBays + stats.vipBays} total
        </span>
      </Tile>

      <Tile
        label="Warnings"
        width="w-44"
        tone={stats.hardWarnings > 0 ? 'bad' : stats.softWarnings > 0 ? 'warn' : 'good'}
        note={
          totalWarnings === 0 ? 'nothing to review' : `${totalWarnings} in total`
        }
      >
        {totalWarnings === 0 ? (
          <span className="text-emerald-700 dark:text-emerald-400">
            <span aria-hidden="true">✓</span> None
          </span>
        ) : (
          <span>
            <span className="text-red-700 dark:text-red-400">
              {stats.hardWarnings} hard
            </span>
            <span className="opacity-40"> / </span>
            <span className="text-amber-700 dark:text-amber-400">
              {stats.softWarnings} soft
            </span>
          </span>
        )}
      </Tile>

      <Tile label="Capacity" width="w-40" note="approximate — planning figure only">
        ≈ {stats.capacityEstimate} players
      </Tile>
    </section>
  );
}
