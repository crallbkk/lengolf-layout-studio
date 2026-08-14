'use client';

import { memo } from 'react';

import { metresPerPixel, px, type Viewport } from '@/lib/viewport';

/**
 * Bottom-left scale bar, screen-constant. Picks the largest "nice" length that
 * still renders under ~200 px, preferring the first that clears ~80 px, so the
 * bar stays a similar physical size across the whole zoom range.
 */

/**
 * 1/2/5/10/20 m are the working set. 0.2 and 0.5 are only reachable at the
 * deepest zoom (MIN_VIEW_WIDTH_M is 2 m), where 1 m would otherwise render at
 * ~600 px and span half the canvas.
 */
const NICE_LENGTHS_M = [0.2, 0.5, 1, 2, 5, 10, 20];
const MIN_BAR_PX = 80;
const MAX_BAR_PX = 200;
const SEGMENTS = 4;

interface ScaleBarProps {
  viewport: Viewport;
  pixelWidth: number;
}

function ScaleBar({ viewport, pixelWidth }: ScaleBarProps) {
  const mpp = metresPerPixel(viewport, pixelWidth);
  if (!Number.isFinite(mpp) || mpp <= 0) return null;

  let lengthM = NICE_LENGTHS_M[NICE_LENGTHS_M.length - 1];
  for (const candidate of NICE_LENGTHS_M) {
    const widthPx = candidate / mpp;
    if (widthPx >= MIN_BAR_PX) {
      lengthM = candidate;
      break;
    }
    if (widthPx <= MAX_BAR_PX) lengthM = candidate;
  }

  const marginX = px(20, viewport, pixelWidth);
  const marginY = px(20, viewport, pixelWidth);
  const barH = px(7, viewport, pixelWidth);
  const font = px(11, viewport, pixelWidth);

  const x0 = viewport.minX + marginX;
  const y0 = viewport.minY + viewport.height - marginY - barH;
  const seg = lengthM / SEGMENTS;

  return (
    <g style={{ pointerEvents: 'none' }} fontFamily="system-ui, sans-serif">
      <rect
        x={x0 - font * 0.6}
        y={y0 - font * 1.9}
        width={lengthM + font * 2.6}
        height={barH + font * 2.6}
        rx={font * 0.4}
        fill="#ffffff"
        fillOpacity={0.78}
      />

      {Array.from({ length: SEGMENTS }, (_, i) => (
        <rect
          key={i}
          x={x0 + seg * i}
          y={y0}
          width={seg}
          height={barH}
          fill={i % 2 === 0 ? '#111827' : '#ffffff'}
          stroke="#111827"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      ))}

      <text
        x={x0}
        y={y0 - font * 0.5}
        textAnchor="middle"
        fontSize={font}
        fill="#374151"
      >
        0
      </text>
      <text
        x={x0 + lengthM}
        y={y0 - font * 0.5}
        textAnchor="middle"
        fontSize={font}
        fill="#374151"
      >
        {`${lengthM} m`}
      </text>
    </g>
  );
}

/**
 * Static relative to a drag: these layers depend only on the viewport (and the
 * measure state), so without memo they rebuilt their whole element tree on
 * every pointer frame of a move — the shell path, ~55 grid lines and the scale
 * bar, all re-created to render identically.
 */
export default memo(ScaleBar);
