'use client';

import { dist } from '@/lib/geometry';
import type { MeasureState, Vec2 } from '@/lib/types';
import { px, type Viewport } from '@/lib/viewport';

/**
 * The tape measure. Purely presentational — the canvas root owns the clicks —
 * so this layer is `pointerEvents: 'none'` throughout.
 */

const ACCENT = '#0f766e';

interface PillProps {
  at: Vec2;
  text: string;
  fontSize: number;
  fill?: string;
}

/** Dark pill + white text, so a reading stays legible over any fill. */
function Pill({ at, text, fontSize, fill = '#111827' }: PillProps) {
  // SVG cannot measure text without the DOM; this estimate is close enough for
  // a background chip and avoids a layout read during render.
  const w = text.length * fontSize * 0.58 + fontSize * 0.8;
  const h = fontSize * 1.6;
  return (
    <g>
      <rect
        x={at.x - w / 2}
        y={at.y - h / 2}
        width={w}
        height={h}
        rx={h * 0.32}
        fill={fill}
        fillOpacity={0.92}
      />
      <text
        x={at.x}
        y={at.y + fontSize * 0.35}
        textAnchor="middle"
        fontSize={fontSize}
        fontWeight={600}
        fontFamily="system-ui, sans-serif"
        fill="#ffffff"
      >
        {text}
      </text>
    </g>
  );
}

interface MeasureLayerProps {
  measure: MeasureState;
  viewport: Viewport;
  pixelWidth: number;
}

export default function MeasureLayer({
  measure,
  viewport,
  pixelWidth,
}: MeasureLayerProps) {
  if (!measure.active || measure.points.length === 0) return null;

  const pts = measure.points;
  const font = px(11, viewport, pixelWidth);
  const dot = px(3.5, viewport, pixelWidth);
  const last = pts[pts.length - 1];

  let total = 0;
  for (let i = 1; i < pts.length; i++) total += dist(pts[i - 1], pts[i]);

  const live =
    measure.cursor !== null ? dist(last, measure.cursor) : null;

  return (
    <g style={{ pointerEvents: 'none' }}>
      {pts.length > 1 && (
        <polyline
          points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
          fill="none"
          stroke={ACCENT}
          strokeWidth={2.5}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      )}

      {/* Live rubber band from the last committed point to the cursor. */}
      {measure.cursor !== null && (
        <line
          x1={last.x}
          y1={last.y}
          x2={measure.cursor.x}
          y2={measure.cursor.y}
          stroke={ACCENT}
          strokeWidth={2}
          strokeDasharray="7 5"
          vectorEffect="non-scaling-stroke"
        />
      )}

      {pts.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={dot}
          fill="#ffffff"
          stroke={ACCENT}
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
      ))}

      {pts.slice(1).map((p, i) => {
        const a = pts[i];
        const mid = { x: (a.x + p.x) / 2, y: (a.y + p.y) / 2 };
        return (
          <Pill
            key={`seg${i}`}
            at={mid}
            text={`${dist(a, p).toFixed(2)} m`}
            fontSize={font}
          />
        );
      })}

      {live !== null && measure.cursor !== null && (
        <Pill
          at={{
            x: (last.x + measure.cursor.x) / 2,
            y: (last.y + measure.cursor.y) / 2,
          }}
          text={`${live.toFixed(2)} m`}
          fontSize={font}
          fill={ACCENT}
        />
      )}

      {pts.length >= 2 && (
        <Pill
          at={{ x: last.x, y: last.y - px(24, viewport, pixelWidth) }}
          text={`total ${total.toFixed(2)} m`}
          fontSize={font}
          fill="#7c2d12"
        />
      )}
    </g>
  );
}
