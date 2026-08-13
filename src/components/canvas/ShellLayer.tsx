'use client';

import {
  COLUMNS,
  FIXED_OBSTACLES,
  SHELL_PATH_MM,
  WALL_SEGMENTS,
} from '@/lib/floorplan';
import { px, type Viewport } from '@/lib/viewport';

/**
 * The permanent, non-editable fabric of the unit: footprint fill, the traced
 * outer wall (including the real 1.788 m arc), classified wall runs, structural
 * columns and the fixed riser.
 *
 * Everything here is inert — `pointerEvents: 'none'` — so a drag that starts
 * over a wall or a column still reaches the canvas background and pans.
 */

const WALL_STYLE: Record<
  (typeof WALL_SEGMENTS)[number]['kind'],
  { stroke: string; width: number; dash?: string }
> = {
  glazing: { stroke: '#38a8e0', width: 5 },
  solid: { stroke: '#3a3a3a', width: 3.5 },
  shopfront: { stroke: '#3f9d3f', width: 3.5, dash: '9 6' },
};

interface ShellLayerProps {
  viewport: Viewport;
  pixelWidth: number;
}

export default function ShellLayer({ viewport, pixelWidth }: ShellLayerProps) {
  const obstacleFont = px(9, viewport, pixelWidth);

  return (
    <g style={{ pointerEvents: 'none' }}>
      <defs>
        {/* Hatch spacing is in metres, so the hatch reads as a real material. */}
        <pattern
          id="fp-obstacle-hatch"
          patternUnits="userSpaceOnUse"
          width={0.18}
          height={0.18}
          patternTransform="rotate(45)"
        >
          <rect width={0.18} height={0.18} fill="#d8d4cc" />
          <line
            x1={0}
            y1={0}
            x2={0}
            y2={0.18}
            stroke="#8d887e"
            strokeWidth={0.045}
          />
        </pattern>
      </defs>

      {/* True outer wall, arc and all. The source path is in millimetres. */}
      <path
        d={SHELL_PATH_MM}
        transform="scale(0.001)"
        fill="#faf7f1"
        stroke="#c9c2b6"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />

      {/* Classified straight wall runs. The arc itself is covered by the path. */}
      <g strokeLinecap="square">
        {WALL_SEGMENTS.map((s) => {
          const style = WALL_STYLE[s.kind];
          return (
            <line
              key={s.id}
              x1={s.a.x}
              y1={s.a.y}
              x2={s.b.x}
              y2={s.b.y}
              stroke={style.stroke}
              strokeWidth={style.width}
              strokeDasharray={style.dash}
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
      </g>

      {/* Structural columns. */}
      <g fill="#9a958c" stroke="#5f5b54">
        {COLUMNS.map((c) =>
          c.shape === 'circle' ? (
            <circle
              key={c.id}
              cx={c.center.x}
              cy={c.center.y}
              r={c.size / 2}
              strokeWidth={1.25}
              vectorEffect="non-scaling-stroke"
            />
          ) : (
            <rect
              key={c.id}
              x={c.center.x - c.size / 2}
              y={c.center.y - c.size / 2}
              width={c.size}
              height={c.size}
              strokeWidth={1.25}
              vectorEffect="non-scaling-stroke"
            />
          ),
        )}
      </g>

      {/* Fixed built obstacles — hatched, with a quiet label. */}
      <g>
        {FIXED_OBSTACLES.map((o) => (
          <g key={o.id}>
            <rect
              x={o.x}
              y={o.y}
              width={o.w}
              height={o.d}
              fill="url(#fp-obstacle-hatch)"
              stroke="#6f6a61"
              strokeWidth={1.25}
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={o.x + o.w / 2}
              y={o.y + o.d + obstacleFont * 1.25}
              textAnchor="middle"
              fontSize={obstacleFont}
              fill="#6f6a61"
              fontFamily="system-ui, sans-serif"
            >
              {o.label}
            </text>
          </g>
        ))}
      </g>
    </g>
  );
}
