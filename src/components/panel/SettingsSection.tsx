'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { useLayoutStore } from '@/store/useLayoutStore';

import { Button, NumberField, Section, Segmented, Toggle } from './ui';

const GRID_PRESETS = [
  { value: 50, label: '50' },
  { value: 100, label: '100' },
  { value: 150, label: '150' },
  { value: 250, label: '250' },
];

const ANGLE_PRESETS = [
  { value: 15, label: '15' },
  { value: 45, label: '45' },
  { value: 90, label: '90' },
];

/**
 * Two-step destructive action. The first press arms the button; it disarms
 * itself after a few seconds so a stray click can never destroy the layout.
 */
function ConfirmButton({
  label,
  confirmLabel = 'Confirm?',
  onConfirm,
}: {
  label: string;
  confirmLabel?: string;
  onConfirm: () => void;
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => clear, [clear]);

  return (
    <Button
      className="flex-1"
      tone={armed ? 'danger' : 'default'}
      ariaLabel={armed ? `${label}: confirm` : label}
      onClick={() => {
        if (armed) {
          clear();
          setArmed(false);
          onConfirm();
          return;
        }
        setArmed(true);
        clear();
        timer.current = setTimeout(() => {
          timer.current = null;
          setArmed(false);
        }, 4000);
      }}
    >
      {armed ? confirmLabel : label}
    </Button>
  );
}

export default function SettingsSection() {
  const gridSnapMm = useLayoutStore((s) => s.settings.gridSnapMm);
  const snapEnabled = useLayoutStore((s) => s.settings.snapEnabled);
  const angleSnapDeg = useLayoutStore((s) => s.settings.angleSnapDeg);
  const angleSnapEnabled = useLayoutStore((s) => s.settings.angleSnapEnabled);
  const clearanceM = useLayoutStore((s) => s.settings.clearanceM);
  const showGrid = useLayoutStore((s) => s.settings.showGrid);
  const showClearance = useLayoutStore((s) => s.settings.showClearance);

  const updateSettings = useLayoutStore((s) => s.updateSettings);
  const beginChange = useLayoutStore((s) => s.beginChange);
  const resetToConcept = useLayoutStore((s) => s.resetToConcept);
  const clearAll = useLayoutStore((s) => s.clearAll);

  return (
    <Section title="Settings" defaultOpen={false}>
      <div className="space-y-3">
        {/* ---- translation snap ---- */}
        <div>
          <Toggle
            label="Snap to grid"
            checked={snapEnabled}
            onChange={(v) => updateSettings({ snapEnabled: v })}
          />
          <div className="mt-1 flex items-center gap-1.5">
            <Segmented
              label="Grid snap"
              value={gridSnapMm}
              options={GRID_PRESETS}
              disabled={!snapEnabled}
              onChange={(v) => updateSettings({ gridSnapMm: v })}
            />
            <NumberField
              label="Grid snap (custom, mm)"
              hideLabel
              className="w-24 shrink-0"
              value={gridSnapMm}
              unit="mm"
              min={1}
              max={5000}
              step={10}
              decimals={0}
              disabled={!snapEnabled}
              onCommit={(n, transient) => updateSettings({ gridSnapMm: n }, { transient })}
              onEditBegin={beginChange}
            />
          </div>
        </div>

        {/* ---- angle snap ---- */}
        <div>
          <Toggle
            label="Snap rotation"
            checked={angleSnapEnabled}
            onChange={(v) => updateSettings({ angleSnapEnabled: v })}
          />
          <div className="mt-1">
            <Segmented
              label="Angle snap in degrees"
              value={angleSnapDeg}
              options={ANGLE_PRESETS}
              disabled={!angleSnapEnabled}
              onChange={(v) => updateSettings({ angleSnapDeg: v })}
            />
          </div>
        </div>

        {/* ---- clearance ---- */}
        <div>
          <NumberField
            label="Clearance rule"
            value={clearanceM}
            unit="m"
            min={0}
            step={0.05}
            onCommit={(n, transient) => updateSettings({ clearanceM: n }, { transient })}
            onEditBegin={beginChange}
          />
          <p className="mt-0.5 text-[10px] leading-tight text-slate-500">
            Minimum clear gap kept between bays, and between a bay and a wall.
            Fitted joinery is exempt.
          </p>
        </div>

        {/* ---- display ---- */}
        <div className="border-t border-slate-200 pt-1">
          <Toggle
            label="Show grid"
            checked={showGrid}
            onChange={(v) => updateSettings({ showGrid: v })}
          />
          <Toggle
            label="Show clearance zones"
            checked={showClearance}
            onChange={(v) => updateSettings({ showClearance: v })}
          />
        </div>

        {/* ---- destructive ---- */}
        <div className="flex gap-1 border-t border-slate-200 pt-2">
          <ConfirmButton
            label="Reset to concept"
            onConfirm={() => resetToConcept()}
          />
          <ConfirmButton label="Clear all" onConfirm={() => clearAll()} />
        </div>
      </div>
    </Section>
  );
}
