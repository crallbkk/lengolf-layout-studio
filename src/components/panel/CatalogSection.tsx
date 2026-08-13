'use client';

import { useState } from 'react';

import { CATALOG, CATALOG_ORDER } from '@/lib/catalog';
import type { ObjectKind } from '@/lib/types';
import { useLayoutStore } from '@/store/useLayoutStore';

import { Button, ColorChip, NumberField, Section, fmt, useSpec } from './ui';

function CatalogRow({ kind }: { kind: ObjectKind }) {
  const spec = useSpec(kind);
  const addObject = useLayoutStore((s) => s.addObject);
  const setTypeMinimums = useLayoutStore((s) => s.setTypeMinimums);
  const resetTypeMinimums = useLayoutStore((s) => s.resetTypeMinimums);
  const [open, setOpen] = useState(false);

  const base = CATALOG[kind];
  const modified = spec.minW !== base.minW || spec.minD !== base.minD;

  return (
    <li className="border-b border-slate-100 last:border-b-0">
      <div className="flex items-center gap-1.5 py-1">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={`${spec.label} minimums`}
          className="flex min-h-8 flex-1 items-center gap-2 rounded-md px-1 text-left hover:bg-slate-100"
        >
          <ColorChip spec={spec} />
          <span className="flex-1 truncate text-xs text-slate-700">
            {spec.label}
            {modified && (
              <span
                title="Minimums overridden"
                className="ml-1 align-middle text-[10px] font-semibold text-amber-600"
              >
                &bull;
              </span>
            )}
          </span>
          <span className="shrink-0 text-[10px] tabular-nums text-slate-400">
            {fmt(spec.defaultW)} &times; {fmt(spec.defaultD)}
          </span>
        </button>
        <Button onClick={() => addObject(kind)} ariaLabel={`Add ${spec.label}`}>
          Add
        </Button>
      </div>

      {open && (
        <div className="mb-2 rounded-md bg-slate-100 p-2">
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label="Min width"
              value={spec.minW}
              unit="m"
              min={0.01}
              step={0.05}
              onCommit={(n) => setTypeMinimums(kind, n, spec.minD)}
            />
            <NumberField
              label="Min depth"
              value={spec.minD}
              unit="m"
              min={0.01}
              step={0.05}
              onCommit={(n) => setTypeMinimums(kind, spec.minW, n)}
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <p className="text-[10px] leading-tight text-slate-500">
              Soft minimum. Smaller objects are allowed, just flagged.
            </p>
            <Button
              onClick={() => resetTypeMinimums(kind)}
              disabled={!modified}
              ariaLabel={`Reset ${spec.label} minimums`}
            >
              Reset
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

export default function CatalogSection() {
  const overrideCount = useLayoutStore(
    (s) => Object.keys(s.typeOverrides).length,
  );

  return (
    <Section
      title="Catalog"
      badge={overrideCount > 0 ? `${overrideCount} edited` : undefined}
    >
      <ul className="-mt-1">
        {CATALOG_ORDER.map((kind) => (
          <CatalogRow key={kind} kind={kind} />
        ))}
      </ul>
    </Section>
  );
}
