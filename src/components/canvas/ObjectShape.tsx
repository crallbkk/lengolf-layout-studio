'use client';

import { memo, type PointerEvent as ReactPointerEvent } from 'react';

import { useLayoutStore } from '@/store/useLayoutStore';
import type { PlacedObject, TypeSpec } from '@/lib/types';
import { px, metresPerPixel, type Viewport } from '@/lib/viewport';

/**
 * One placed rectangle.
 *
 * The transform is deliberately `translate(centre) rotate(deg)` with the rect
 * drawn at (-w/2, -d/2, w, d). That is the *same* composition as
 * geometry.corners(): local corners at (+/-w/2, +/-d/2), rotated by `rotation`,
 * then offset by (cx, cy). Collision maths and pixels can therefore never
 * disagree about where an object is.
 */

const HARD_STROKE = '#dc2626';
const SOFT_STROKE = '#d97706';
const SELECTED_STROKE = '#111827';

export interface ObjectShapeProps {
  object: PlacedObject;
  spec: TypeSpec;
  selected: boolean;
  hard: boolean;
  soft: boolean;
  onPointerDown: (e: ReactPointerEvent<SVGGElement>) => void;
  viewport: Viewport;
  pixelWidth: number;
}

function ObjectShape({
  object,
  spec,
  selected,
  hard,
  soft,
  onPointerDown,
  viewport,
  pixelWidth,
}: ObjectShapeProps) {
  const { cx, cy, w, d, rotation } = object;
  const hw = w / 2;
  const hd = d / 2;

  const mpp = metresPerPixel(viewport, pixelWidth);
  const widthPx = w / mpp;
  const depthPx = d / mpp;

  const labelSize = px(12, viewport, pixelWidth);
  const subSize = px(10, viewport, pixelWidth);

  // Under these sizes the text is unreadable and only adds noise.
  const showLabel = widthPx >= 34 && depthPx >= 18;
  const showSub = showLabel && widthPx >= 66 && depthPx >= 40;

  const stroke = hard ? HARD_STROKE : soft ? SOFT_STROKE : spec.stroke;
  const strokeWidth = hard ? 3 : selected ? 2.5 : soft ? 2 : 1.5;
  const dash = soft && !hard ? '7 4' : undefined;

  // A bay's seating strip cannot be deeper than the bay itself once the user
  // has dragged the depth down; clamp for display rather than mutating state.
  const seating =
    object.seatingDepth !== undefined && object.seatingDepth > 0
      ? Math.min(object.seatingDepth, d)
      : null;

  const lockSize = px(15, viewport, pixelWidth);
  const lockPad = px(4, viewport, pixelWidth);
  const lockCx = -hw + lockPad + lockSize / 2;
  const lockCy = -hd + lockPad + lockSize / 2;
  // Hide the padlock when it would swamp the object it belongs to.
  const showLock = widthPx >= 30 && depthPx >= 26;

  const handleLockPointerDown = (e: ReactPointerEvent<SVGGElement>) => {
    e.stopPropagation();
    e.preventDefault();
    useLayoutStore.getState().toggleLock(object.id);
  };

  return (
    <g
      data-object-id={object.id}
      transform={`translate(${cx} ${cy}) rotate(${rotation})`}
      onPointerDown={onPointerDown}
      style={{ cursor: object.locked ? 'default' : 'move' }}
    >
      <rect
        x={-hw}
        y={-hd}
        width={w}
        height={d}
        rx={px(2, viewport, pixelWidth)}
        fill={spec.fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeDasharray={dash}
        vectorEffect="non-scaling-stroke"
      />

      {hard && (
        <rect
          x={-hw}
          y={-hd}
          width={w}
          height={d}
          fill={HARD_STROKE}
          fillOpacity={0.16}
          stroke="none"
          style={{ pointerEvents: 'none' }}
        />
      )}

      {selected && !hard && !soft && (
        <rect
          x={-hw}
          y={-hd}
          width={w}
          height={d}
          fill="none"
          stroke={SELECTED_STROKE}
          strokeWidth={1}
          strokeOpacity={0.55}
          vectorEffect="non-scaling-stroke"
          style={{ pointerEvents: 'none' }}
        />
      )}

      {/* Seating / safety strip vs hitting enclosure. */}
      {seating !== null && (
        <line
          x1={-hw}
          y1={-hd + seating}
          x2={hw}
          y2={-hd + seating}
          stroke={spec.stroke}
          strokeOpacity={0.75}
          strokeWidth={1.25}
          strokeDasharray="6 4"
          vectorEffect="non-scaling-stroke"
          style={{ pointerEvents: 'none' }}
        />
      )}

      {showLabel && (
        <g style={{ pointerEvents: 'none' }} fill={spec.text}>
          <text
            x={0}
            y={showSub ? -subSize * 0.2 : labelSize * 0.35}
            textAnchor="middle"
            fontSize={labelSize}
            fontWeight={600}
            fontFamily="system-ui, sans-serif"
          >
            {object.label}
          </text>
          {showSub && (
            <text
              x={0}
              y={labelSize * 1.05}
              textAnchor="middle"
              fontSize={subSize}
              fillOpacity={0.75}
              fontFamily="system-ui, sans-serif"
            >
              {`${w.toFixed(2)} × ${d.toFixed(2)} m`}
            </text>
          )}
        </g>
      )}

      {/* Padlock: always present so the control is discoverable, dimmed when
          the object is unlocked. Its own handler swallows the event so the
          click never starts a drag. */}
      {showLock && (
        <g
          transform={`translate(${lockCx} ${lockCy})`}
          onPointerDown={handleLockPointerDown}
          style={{ cursor: 'pointer' }}
          opacity={object.locked ? 1 : 0.32}
        >
          {/* Generous invisible hit target. */}
          <rect
            x={-lockSize * 0.7}
            y={-lockSize * 0.7}
            width={lockSize * 1.4}
            height={lockSize * 1.4}
            fill="transparent"
            stroke="none"
          />
          <path
            d={
              object.locked
                ? `M ${-lockSize * 0.22} ${-lockSize * 0.06} L ${-lockSize * 0.22} ${-lockSize * 0.24} A ${lockSize * 0.22} ${lockSize * 0.22} 0 0 1 ${lockSize * 0.22} ${-lockSize * 0.24} L ${lockSize * 0.22} ${-lockSize * 0.06}`
                : `M ${-lockSize * 0.22} ${-lockSize * 0.06} L ${-lockSize * 0.22} ${-lockSize * 0.24} A ${lockSize * 0.22} ${lockSize * 0.22} 0 0 1 ${lockSize * 0.22} ${-lockSize * 0.24}`
            }
            fill="none"
            stroke={object.locked ? '#1f2937' : spec.text}
            strokeWidth={1.6}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          <rect
            x={-lockSize * 0.34}
            y={-lockSize * 0.06}
            width={lockSize * 0.68}
            height={lockSize * 0.5}
            rx={lockSize * 0.09}
            fill={object.locked ? '#1f2937' : '#ffffff'}
            stroke={object.locked ? '#1f2937' : spec.text}
            strokeWidth={1.4}
            vectorEffect="non-scaling-stroke"
          />
        </g>
      )}
    </g>
  );
}

export default memo(ObjectShape);
