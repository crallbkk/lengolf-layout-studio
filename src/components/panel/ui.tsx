'use client';

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type { ObjectKind, TypeSpec } from '@/lib/types';
import { useLayoutStore } from '@/store/useLayoutStore';

/* ------------------------------------------------------------------ utils */

export function cx(
  ...parts: Array<string | false | null | undefined>
): string {
  return parts.filter(Boolean).join(' ');
}

export function roundTo(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

export function fmt(n: number, decimals = 2): string {
  return Number.isFinite(n) ? n.toFixed(decimals) : (0).toFixed(decimals);
}

/**
 * Live spec for a type. `specFor` builds a NEW object whenever the type has an
 * override, so it must never be used directly as a zustand selector (zustand v5
 * would re-render forever). Subscribe to the override — a stable reference held
 * by the store — and derive the spec from it.
 */
export function useSpec(kind: ObjectKind): TypeSpec {
  const override = useLayoutStore((s) => s.typeOverrides[kind]);
  const specFor = useLayoutStore((s) => s.specFor);
  return useMemo(() => {
    void override; // re-derive when this type's minimums change
    return specFor(kind);
  }, [specFor, kind, override]);
}

/* ------------------------------------------------------------------ chrome */

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 12 12"
      width="12"
      height="12"
      aria-hidden="true"
      className={cx(
        'shrink-0 text-slate-400 transition-transform',
        open && 'rotate-90',
      )}
    >
      <path
        d="M4.5 2.5 L8 6 L4.5 9.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Section({
  title,
  children,
  defaultOpen = true,
  badge,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  badge?: string | number;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();

  return (
    <section className="border-b border-slate-200">
      <h2>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={bodyId}
          className="flex min-h-8 w-full items-center gap-1.5 px-3 py-2 text-left hover:bg-slate-100"
        >
          <Chevron open={open} />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            {title}
          </span>
          {badge !== undefined && (
            <span className="ml-auto rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-slate-600">
              {badge}
            </span>
          )}
        </button>
      </h2>
      <div id={bodyId} hidden={!open} className="px-3 pb-3">
        {open && children}
      </div>
    </section>
  );
}

export function ColorChip({
  spec,
  className,
}: {
  spec: TypeSpec;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cx('inline-block size-3 shrink-0 rounded-sm border', className)}
      style={{ backgroundColor: spec.fill, borderColor: spec.stroke }}
    />
  );
}

/* ----------------------------------------------------------------- buttons */

type Tone = 'default' | 'primary' | 'danger' | 'ghost';

const TONE: Record<Tone, string> = {
  default:
    'border-slate-300 bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900',
  primary:
    'border-slate-800 bg-slate-800 text-white hover:bg-slate-700 hover:border-slate-700',
  danger:
    'border-rose-300 bg-white text-rose-700 hover:bg-rose-50 hover:border-rose-400',
  ghost:
    'border-transparent bg-transparent text-slate-500 hover:bg-slate-200 hover:text-slate-800',
};

export function IconButton({
  label,
  onClick,
  children,
  tone = 'ghost',
  active = false,
  disabled = false,
  className,
}: {
  label: string;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  children: ReactNode;
  tone?: Tone;
  active?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        'inline-flex size-8 shrink-0 items-center justify-center rounded-md border text-xs transition-colors',
        TONE[tone],
        active && 'bg-slate-200 text-slate-900',
        disabled && 'cursor-not-allowed opacity-40 hover:bg-transparent',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Button({
  children,
  onClick,
  tone = 'default',
  disabled = false,
  ariaLabel,
  className,
}: {
  children: ReactNode;
  onClick: () => void;
  tone?: Tone;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cx(
        'inline-flex min-h-8 items-center justify-center gap-1 rounded-md border px-2.5 text-xs font-medium transition-colors',
        TONE[tone],
        disabled && 'cursor-not-allowed opacity-40',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
  disabled = false,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'flex min-h-8 w-full items-center gap-2 rounded-md px-1 text-left text-xs text-slate-700 hover:bg-slate-100',
        disabled && 'cursor-not-allowed opacity-40',
      )}
    >
      <span className="flex-1">
        {label}
        {hint && (
          <span className="block text-[10px] leading-tight text-slate-400">
            {hint}
          </span>
        )}
      </span>
      <span
        aria-hidden="true"
        className={cx(
          'relative h-5 w-9 shrink-0 rounded-full transition-colors',
          checked ? 'bg-slate-800' : 'bg-slate-300',
        )}
      >
        <span
          className={cx(
            'absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow-sm transition-transform',
            checked && 'translate-x-4',
          )}
        />
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ fields */

const CONTROL =
  'min-h-8 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 tabular-nums outline-none transition-colors focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400';

export function FieldLabel({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-slate-500"
    >
      {children}
    </label>
  );
}

export function WarningLine({ children }: { children: ReactNode }) {
  return (
    <p className="mt-0.5 text-[10px] leading-tight text-amber-700">{children}</p>
  );
}

export interface NumberFieldProps {
  /** Accessible name; also rendered as the visible label unless hideLabel. */
  label: string;
  value: number;
  /**
   * `transient` is true for keystroke/arrow edits (the field is mid-edit) and
   * false for the settling write on blur, mirroring the store's gesture
   * contract so a whole field edit collapses into one undo step.
   */
  onCommit: (value: number, transient: boolean) => void;
  /** Fired once per editing session, just before the first real write. */
  onEditBegin?: () => void;
  min?: number;
  max?: number;
  step?: number;
  decimals?: number;
  unit?: string;
  disabled?: boolean;
  hideLabel?: boolean;
  warning?: string | null;
  className?: string;
}

/**
 * Controlled-with-local-draft number input.
 *
 * The draft is the source of truth while the field has focus, so "4." and ""
 * are typeable; the store only ever sees finite, in-range numbers.
 */
export function NumberField({
  label,
  value,
  onCommit,
  onEditBegin,
  min,
  max,
  step = 0.05,
  decimals = 2,
  unit,
  disabled = false,
  hideLabel = false,
  warning,
  className,
}: NumberFieldProps) {
  const id = useId();
  const [draft, setDraft] = useState(() => fmt(value, decimals));
  const focused = useRef(false);
  const dirty = useRef(false);

  // Re-sync from the store only while the user is not typing in this field.
  useEffect(() => {
    if (!focused.current) setDraft(fmt(value, decimals));
  }, [value, decimals]);

  const parse = useCallback((raw: string): number | null => {
    const t = raw.trim();
    if (t === '' || t === '-' || t === '.' || t === '-.') return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }, []);

  const inRange = useCallback(
    (n: number) =>
      (min === undefined || n >= min) && (max === undefined || n <= max),
    [min, max],
  );

  const write = useCallback(
    (n: number, transient: boolean) => {
      if (transient && !dirty.current) {
        dirty.current = true;
        onEditBegin?.();
      }
      onCommit(n, transient);
    },
    [onCommit, onEditBegin],
  );

  const handleChange = (raw: string) => {
    setDraft(raw);
    const n = parse(raw);
    if (n === null || !inRange(n)) return;
    if (n === value) return;
    write(n, true);
  };

  const handleBlur = () => {
    focused.current = false;
    const n = parse(draft);
    const settled = n !== null && inRange(n) ? n : value;
    setDraft(fmt(settled, decimals));
    if (dirty.current) {
      dirty.current = false;
      onCommit(settled, false);
    }
  };

  const nudge = (direction: 1 | -1, shift: boolean) => {
    const base = parse(draft) ?? value;
    const delta = step * (shift ? 10 : 1);
    let next = roundTo(base + direction * delta, Math.max(decimals, 3));
    if (min !== undefined) next = Math.max(min, next);
    if (max !== undefined) next = Math.min(max, next);
    setDraft(fmt(next, decimals));
    write(next, true);
  };

  return (
    <div className={className}>
      {!hideLabel && <FieldLabel htmlFor={id}>{label}</FieldLabel>}
      <div className="relative">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          aria-label={hideLabel ? label : undefined}
          disabled={disabled}
          value={draft}
          onFocus={(e) => {
            focused.current = true;
            e.currentTarget.select();
          }}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault();
              nudge(e.key === 'ArrowUp' ? 1 : -1, e.shiftKey);
            } else if (e.key === 'Enter') {
              e.currentTarget.blur();
            }
          }}
          className={cx(CONTROL, unit && 'pr-7')}
        />
        {unit && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[10px] text-slate-400"
          >
            {unit}
          </span>
        )}
      </div>
      {warning && <WarningLine>{warning}</WarningLine>}
    </div>
  );
}

export function TextField({
  label,
  value,
  onCommit,
  onEditBegin,
  disabled = false,
  placeholder,
  className,
}: {
  label: string;
  value: string;
  onCommit: (value: string, transient: boolean) => void;
  onEditBegin?: () => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const id = useId();
  const dirty = useRef(false);

  return (
    <div className={className}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <input
        id={id}
        type="text"
        autoComplete="off"
        disabled={disabled}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          if (!dirty.current) {
            dirty.current = true;
            onEditBegin?.();
          }
          onCommit(e.target.value, true);
        }}
        onBlur={() => {
          if (!dirty.current) return;
          dirty.current = false;
          onCommit(value, false);
        }}
        className={CONTROL}
      />
    </div>
  );
}

export function TextAreaField({
  label,
  value,
  onCommit,
  onEditBegin,
  disabled = false,
  placeholder,
  rows = 2,
}: {
  label: string;
  value: string;
  onCommit: (value: string, transient: boolean) => void;
  onEditBegin?: () => void;
  disabled?: boolean;
  placeholder?: string;
  rows?: number;
}) {
  const id = useId();
  const dirty = useRef(false);

  return (
    <div>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <textarea
        id={id}
        rows={rows}
        disabled={disabled}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          if (!dirty.current) {
            dirty.current = true;
            onEditBegin?.();
          }
          onCommit(e.target.value, true);
        }}
        onBlur={() => {
          if (!dirty.current) return;
          dirty.current = false;
          onCommit(value, false);
        }}
        className={cx(CONTROL, 'resize-y leading-snug')}
      />
    </div>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as T)}
        className={cx(CONTROL, 'cursor-pointer')}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Radio-group segmented control. Values are compared numerically. */
export function Segmented({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: number;
  options: ReadonlyArray<{ value: number; label: string }>;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cx(
        'flex flex-1 overflow-hidden rounded-md border border-slate-300 bg-white',
        disabled && 'opacity-40',
      )}
    >
      {options.map((o, i) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`${label}: ${o.label}`}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={cx(
              'min-h-8 flex-1 px-1 text-[11px] font-medium tabular-nums transition-colors',
              i > 0 && 'border-l border-slate-300',
              active
                ? 'bg-slate-800 text-white'
                : 'text-slate-600 hover:bg-slate-100',
              disabled && 'cursor-not-allowed',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Padlock glyph; the shackle opens when `locked` is false. */
export function LockGlyph({ locked }: { locked: boolean }) {
  return (
    <svg viewBox="0 0 14 14" width="13" height="13" aria-hidden="true">
      <rect
        x="3"
        y="6.5"
        width="8"
        height="5.5"
        rx="1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path
        d={locked ? 'M5 6.5 V4.6 a2 2 0 0 1 4 0 V6.5' : 'M5 6.5 V4.6 a2 2 0 0 1 4 0'}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function EmptyHint({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md border border-dashed border-slate-300 px-3 py-4 text-center text-[11px] leading-relaxed text-slate-400">
      {children}
    </p>
  );
}
