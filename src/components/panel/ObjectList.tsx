'use client';

import { useMemo } from 'react';

import { CATALOG_ORDER } from '@/lib/catalog';
import type { ObjectKind, PlacedObject } from '@/lib/types';
import { useLayoutStore } from '@/store/useLayoutStore';

import {
  ColorChip,
  EmptyHint,
  IconButton,
  LockGlyph,
  Section,
  cx,
  fmt,
  useSpec,
} from './ui';

function ObjectRow({
  object,
  selected,
}: {
  object: PlacedObject;
  selected: boolean;
}) {
  const spec = useSpec(object.type);
  const select = useLayoutStore((s) => s.select);
  const toggleLock = useLayoutStore((s) => s.toggleLock);

  return (
    <li className="flex items-center gap-1">
      <button
        type="button"
        aria-pressed={selected}
        onClick={(e) => select(object.id, e.shiftKey)}
        className={cx(
          'flex min-h-8 flex-1 items-center gap-2 rounded-md border px-1.5 text-left transition-colors',
          selected
            ? 'border-slate-400 bg-slate-200'
            : 'border-transparent hover:bg-slate-100',
        )}
      >
        <ColorChip spec={spec} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs leading-tight text-slate-700">
            {object.label || spec.label}
          </span>
          <span className="block truncate text-[10px] leading-tight text-slate-400">
            {spec.label} &middot; {fmt(object.w)} &times; {fmt(object.d)} m
          </span>
        </span>
      </button>
      <IconButton
        label={object.locked ? `Unlock ${object.label}` : `Lock ${object.label}`}
        active={object.locked}
        onClick={(e) => {
          e.stopPropagation();
          toggleLock(object.id);
        }}
      >
        <LockGlyph locked={object.locked} />
      </IconButton>
    </li>
  );
}

function Group({
  kind,
  items,
  selectedIds,
}: {
  kind: ObjectKind;
  items: PlacedObject[];
  selectedIds: string[];
}) {
  const spec = useSpec(kind);
  return (
    <li>
      <p className="mt-1.5 mb-0.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        <span className="truncate">{spec.label}</span>
        <span className="tabular-nums">({items.length})</span>
      </p>
      <ul className="space-y-0.5">
        {items.map((o) => (
          <ObjectRow
            key={o.id}
            object={o}
            selected={selectedIds.includes(o.id)}
          />
        ))}
      </ul>
    </li>
  );
}

export default function ObjectList() {
  const objects = useLayoutStore((s) => s.objects);
  const selectedIds = useLayoutStore((s) => s.selectedIds);

  const groups = useMemo(() => {
    const byKind = new Map<ObjectKind, PlacedObject[]>();
    for (const o of objects) {
      const bucket = byKind.get(o.type);
      if (bucket) bucket.push(o);
      else byKind.set(o.type, [o]);
    }
    return CATALOG_ORDER.filter((k) => byKind.has(k)).map((kind) => ({
      kind,
      items: byKind.get(kind) as PlacedObject[],
    }));
  }, [objects]);

  return (
    <Section title="Objects" badge={objects.length}>
      {objects.length === 0 ? (
        <EmptyHint>No objects yet. Add one from the catalog.</EmptyHint>
      ) : (
        <ul>
          {groups.map((g) => (
            <Group
              key={g.kind}
              kind={g.kind}
              items={g.items}
              selectedIds={selectedIds}
            />
          ))}
        </ul>
      )}
    </Section>
  );
}
