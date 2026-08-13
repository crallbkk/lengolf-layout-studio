'use client';

import type { PointerEvent as ReactPointerEvent } from 'react';

import type { PlacedObject } from '@/lib/types';
import { px, type Viewport } from '@/lib/viewport';

/**
 * Resize + rotate affordances for a single, unlocked selection.
 *
 * The handles live in the object's ROTATED frame — the whole group carries the
 * same `translate(centre) rotate(deg)` transform as the shape — so the "east"
 * handle really is the object's east edge whatever its heading. Sizes come from
 * px() so the grips stay the same on screen at any zoom.
 */

export type ResizeHandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
export type HandleId = ResizeHandleId | 'rotate';

/** Unit offsets in the object's local frame: -1 / 0 / +1 per axis. */
export const HANDLE_AXES: Record<ResizeHandleId, { hx: -1 | 0 | 1; hy: -1 | 0 | 1 }> = {
  nw: { hx: -1, hy: -1 },
  n: { hx: 0, hy: -1 },
  ne: { hx: 1, hy: -1 },
  e: { hx: 1, hy: 0 },
  se: { hx: 1, hy: 1 },
  s: { hx: 0, hy: 1 },
  sw: { hx: -1, hy: 1 },
  w: { hx: -1, hy: 0 },
};

const RESIZE_ORDER: ResizeHandleId[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

const CURSORS: Record<ResizeHandleId, string> = {
  nw: 'nwse-resize',
  n: 'ns-resize',
  ne: 'nesw-resize',
  e: 'ew-resize',
  se: 'nwse-resize',
  s: 'ns-resize',
  sw: 'nesw-resize',
  w: 'ew-resize',
};

interface SelectionHandlesProps {
  object: PlacedObject;
  viewport: Viewport;
  pixelWidth: number;
  /** Does NOT stop propagation — the canvas root owns pointer capture. */
  onHandlePointerDown: (
    handle: HandleId,
    e: ReactPointerEvent<SVGRectElement | SVGCircleElement>,
  ) => void;
}

export default function SelectionHandles({
  object,
  viewport,
  pixelWidth,
  onHandlePointerDown,
}: SelectionHandlesProps) {
  const hw = object.w / 2;
  const hd = object.d / 2;

  const half = px(4.5, viewport, pixelWidth);
  const hit = px(11, viewport, pixelWidth);
  const stalk = px(26, viewport, pixelWidth);
  const rotR = px(6, viewport, pixelWidth);

  return (
    <g transform={`translate(${object.cx} ${object.cy}) rotate(${object.rotation})`}>
      {/* Rotation stalk. */}
      <line
        x1={0}
        y1={-hd}
        x2={0}
        y2={-hd - stalk}
        stroke="#111827"
        strokeWidth={1.25}
        vectorEffect="non-scaling-stroke"
        style={{ pointerEvents: 'none' }}
      />
      <circle
        cx={0}
        cy={-hd - stalk}
        r={hit}
        fill="transparent"
        stroke="none"
        style={{ cursor: 'grab' }}
        onPointerDown={(e) => onHandlePointerDown('rotate', e)}
      />
      <circle
        cx={0}
        cy={-hd - stalk}
        r={rotR}
        fill="#ffffff"
        stroke="#111827"
        strokeWidth={1.6}
        vectorEffect="non-scaling-stroke"
        style={{ pointerEvents: 'none' }}
      />

      {RESIZE_ORDER.map((id) => {
        const { hx, hy } = HANDLE_AXES[id];
        const x = hx * hw;
        const y = hy * hd;
        return (
          <g key={id}>
            <rect
              x={x - hit}
              y={y - hit}
              width={hit * 2}
              height={hit * 2}
              fill="transparent"
              stroke="none"
              style={{ cursor: CURSORS[id] }}
              onPointerDown={(e) => onHandlePointerDown(id, e)}
            />
            <rect
              x={x - half}
              y={y - half}
              width={half * 2}
              height={half * 2}
              fill="#ffffff"
              stroke="#111827"
              strokeWidth={1.6}
              vectorEffect="non-scaling-stroke"
              style={{ pointerEvents: 'none' }}
            />
          </g>
        );
      })}
    </g>
  );
}
