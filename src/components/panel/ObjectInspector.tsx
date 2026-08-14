'use client';

import { useMemo } from 'react';

import { CATALOG, CATALOG_ORDER, isBay } from '@/lib/catalog';
import type { ObjectKind, PlacedObject } from '@/lib/types';
import { useLayoutStore } from '@/store/useLayoutStore';

import {
  Button,
  ColorChip,
  EmptyHint,
  LockGlyph,
  NumberField,
  Section,
  SelectField,
  TextAreaField,
  TextField,
  Toggle,
  cx,
  fmt,
  useSpec,
} from './ui';

const ROTATIONS = [0, 90, 180, 270];

/** Type labels are never overridden, only the minimums are. */
const TYPE_OPTIONS: ReadonlyArray<{ value: ObjectKind; label: string }> =
  CATALOG_ORDER.map((k) => ({ value: k, label: CATALOG[k].label }));

function SingleInspector({ object }: { object: PlacedObject }) {
  const spec = useSpec(object.type);
  const beginChange = useLayoutStore((s) => s.beginChange);
  const updateObject = useLayoutStore((s) => s.updateObject);
  const removeObject = useLayoutStore((s) => s.removeObject);
  const duplicateObject = useLayoutStore((s) => s.duplicateObject);
  const toggleLock = useLayoutStore((s) => s.toggleLock);

  const locked = object.locked;

  const patch = (p: Partial<PlacedObject>, transient: boolean) =>
    updateObject(object.id, p, { transient });

  const widthWarning =
    object.w < spec.minW
      ? `Below the ${fmt(spec.minW)} m minimum for ${spec.label}`
      : null;
  const depthWarning =
    object.d < spec.minD
      ? `Below the ${fmt(spec.minD)} m minimum for ${spec.label}`
      : null;

  const showSeating = isBay(object.type) && object.seatingDepth !== undefined;
  const seatingMax = Math.max(0.05, Math.round((object.d - 0.05) * 100) / 100);

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <ColorChip spec={spec} className="size-3.5" />
        <span className="flex-1 truncate text-xs font-medium text-slate-700">
          {spec.label}
        </span>
        <span className="text-[10px] tabular-nums text-slate-400">
          {fmt(object.w)} &times; {fmt(object.d)} m
        </span>
      </div>

      {locked && (
        <p className="flex items-center gap-1.5 rounded-md bg-slate-200 px-2 py-1.5 text-[10px] leading-tight text-slate-600">
          <LockGlyph locked />
          Locked. Unlock below to edit this object.
        </p>
      )}

      <div className={cx('space-y-2.5', locked && 'opacity-60')}>
        <TextField
          label="Label"
          value={object.label}
          disabled={locked}
          onEditBegin={beginChange}
          onCommit={(v, transient) => patch({ label: v }, transient)}
        />

        <SelectField<ObjectKind>
          label="Type"
          value={object.type}
          disabled={locked}
          options={TYPE_OPTIONS}
          onChange={(next) => {
            if (next === object.type) return;
            beginChange();
            /**
             * Re-derive seatingDepth from the new type, in both directions.
             * Patching only `type` stranded it: a bay changed to a bar kept
             * drawing its seating split line (ObjectShape keys off the value,
             * not the type) with the field now hidden, so there was no way to
             * remove it; and a rectangle changed to a bay got no strip and no
             * field to add one, permanently unlike every catalog-added bay.
             */
            const seating = CATALOG[next].defaultSeatingDepth;
            updateObject(object.id, {
              type: next,
              seatingDepth:
                seating === undefined ? undefined : Math.min(seating, object.d),
            });
          }}
        />

        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="Width"
            value={object.w}
            unit="m"
            min={0.05}
            step={0.05}
            disabled={locked}
            warning={widthWarning}
            onEditBegin={beginChange}
            onCommit={(n, transient) => patch({ w: n }, transient)}
          />
          <NumberField
            label="Depth"
            value={object.d}
            unit="m"
            min={0.05}
            step={0.05}
            disabled={locked}
            warning={depthWarning}
            onEditBegin={beginChange}
            onCommit={(n, transient) => patch({ d: n }, transient)}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="Centre X"
            value={object.cx}
            unit="m"
            step={0.05}
            disabled={locked}
            onEditBegin={beginChange}
            onCommit={(n, transient) => patch({ cx: n }, transient)}
          />
          <NumberField
            label="Centre Y"
            value={object.cy}
            unit="m"
            step={0.05}
            disabled={locked}
            onEditBegin={beginChange}
            onCommit={(n, transient) => patch({ cy: n }, transient)}
          />
        </div>

        <div>
          <NumberField
            label="Rotation"
            value={object.rotation}
            unit="deg"
            step={1}
            decimals={1}
            disabled={locked}
            onEditBegin={beginChange}
            onCommit={(n, transient) => patch({ rotation: n }, transient)}
          />
          <div className="mt-1 flex gap-1">
            {ROTATIONS.map((deg) => (
              <Button
                key={deg}
                className="flex-1"
                tone={object.rotation === deg ? 'primary' : 'default'}
                disabled={locked}
                ariaLabel={`Set rotation to ${deg} degrees`}
                onClick={() => {
                  if (object.rotation === deg) return;
                  beginChange();
                  updateObject(object.id, { rotation: deg });
                }}
              >
                {deg}&deg;
              </Button>
            ))}
          </div>
        </div>

        {showSeating && (
          <NumberField
            label="Seating depth"
            value={object.seatingDepth ?? 0}
            unit="m"
            min={0.05}
            max={seatingMax}
            step={0.05}
            disabled={locked}
            onEditBegin={beginChange}
            onCommit={(n, transient) =>
              patch({ seatingDepth: Math.min(n, seatingMax) }, transient)
            }
          />
        )}

        <TextAreaField
          label="Notes"
          value={object.notes}
          rows={2}
          disabled={locked}
          placeholder="Optional"
          onEditBegin={beginChange}
          onCommit={(v, transient) => patch({ notes: v }, transient)}
        />
      </div>

      <div className="border-t border-slate-200 pt-2">
        <Toggle
          label="Locked"
          checked={locked}
          onChange={() => toggleLock(object.id)}
        />
        <div className="mt-1 flex gap-1">
          <Button
            className="flex-1"
            disabled={locked}
            onClick={() => duplicateObject(object.id)}
          >
            Duplicate
          </Button>
          <Button
            className="flex-1"
            tone="danger"
            disabled={locked}
            onClick={() => removeObject(object.id)}
          >
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}

function MultiInspector({ objects }: { objects: PlacedObject[] }) {
  const beginChange = useLayoutStore((s) => s.beginChange);
  const updateObject = useLayoutStore((s) => s.updateObject);
  const removeSelected = useLayoutStore((s) => s.removeSelected);

  const breakdown = useMemo(() => {
    const counts = new Map<ObjectKind, number>();
    for (const o of objects) counts.set(o.type, (counts.get(o.type) ?? 0) + 1);
    return [...counts.entries()];
  }, [objects]);

  const lockedCount = objects.filter((o) => o.locked).length;

  const setLockAll = (locked: boolean) => {
    const targets = objects.filter((o) => o.locked !== locked);
    if (targets.length === 0) return;
    beginChange();
    for (const o of targets) updateObject(o.id, { locked });
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-slate-700">
        {objects.length} objects selected
      </p>
      <ul className="space-y-0.5">
        {breakdown.map(([kind, n]) => (
          <BreakdownRow key={kind} kind={kind} count={n} />
        ))}
      </ul>
      {lockedCount > 0 && (
        <p className="text-[10px] text-slate-500">
          {lockedCount} locked. Locked objects are not deleted.
        </p>
      )}
      <div className="flex gap-1">
        <Button className="flex-1" onClick={() => setLockAll(true)}>
          Lock all
        </Button>
        <Button className="flex-1" onClick={() => setLockAll(false)}>
          Unlock all
        </Button>
        <Button
          className="flex-1"
          tone="danger"
          disabled={lockedCount === objects.length}
          onClick={() => removeSelected()}
        >
          Delete
        </Button>
      </div>
    </div>
  );
}

function BreakdownRow({ kind, count }: { kind: ObjectKind; count: number }) {
  const spec = useSpec(kind);
  return (
    <li className="flex items-center gap-2 text-[11px] text-slate-600">
      <ColorChip spec={spec} />
      <span className="flex-1 truncate">{spec.label}</span>
      <span className="tabular-nums text-slate-400">&times;{count}</span>
    </li>
  );
}

export default function ObjectInspector() {
  const objects = useLayoutStore((s) => s.objects);
  const selectedIds = useLayoutStore((s) => s.selectedIds);

  const selected = useMemo(
    () => objects.filter((o) => selectedIds.includes(o.id)),
    [objects, selectedIds],
  );

  return (
    <Section
      title="Properties"
      badge={selected.length > 1 ? selected.length : undefined}
    >
      {selected.length === 0 && (
        <EmptyHint>
          Nothing selected. Click an object on the plan, or add one from the
          catalog below.
        </EmptyHint>
      )}
      {/* Keyed by id so no field draft can leak across a selection change. */}
      {selected.length === 1 && (
        <SingleInspector key={selected[0].id} object={selected[0]} />
      )}
      {selected.length > 1 && <MultiInspector objects={selected} />}
    </Section>
  );
}
