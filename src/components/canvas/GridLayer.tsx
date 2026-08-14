'use client';

import { useMemo, memo } from 'react';

import { COLUMN_GRID_X_M, COLUMN_GRID_Y_M, SHELL_OUTLINE } from '@/lib/floorplan';
import { bounds } from '@/lib/geometry';

/**
 * Reference grids. Two densities:
 *  - a very faint 1 m background lattice for eyeballing distances;
 *  - the structural column grid (dashed, slightly stronger) from the landlord's
 *    drawing, which is the one people actually plan against.
 *
 * Non-interactive so it never intercepts a background pan.
 */

const PAD_M = 2.5;

interface GridLayerProps {
  /** Metres per pixel, used only to fade the metre grid out when zoomed far out. */
  metresPerPixel: number;
}

function GridLayer({ metresPerPixel }: GridLayerProps) {
  const extent = useMemo(() => {
    const b = bounds(SHELL_OUTLINE);
    return {
      minX: Math.min(b.minX, ...COLUMN_GRID_X_M) - PAD_M,
      maxX: Math.max(b.maxX, ...COLUMN_GRID_X_M) + PAD_M,
      minY: Math.min(b.minY, ...COLUMN_GRID_Y_M) - PAD_M,
      maxY: Math.max(b.maxY, ...COLUMN_GRID_Y_M) + PAD_M,
    };
  }, []);

  const metreLines = useMemo(() => {
    const xs: number[] = [];
    const ys: number[] = [];
    for (let x = Math.ceil(extent.minX); x <= extent.maxX; x += 1) xs.push(x);
    for (let y = Math.ceil(extent.minY); y <= extent.maxY; y += 1) ys.push(y);
    return { xs, ys };
  }, [extent]);

  // Below ~4 px per metre the lattice turns into grey mud; hide it instead.
  const showMetreGrid = metresPerPixel > 0 && 1 / metresPerPixel >= 4;

  return (
    <g style={{ pointerEvents: 'none' }}>
      {showMetreGrid && (
        <g stroke="#000000" strokeOpacity={0.05} strokeWidth={1}>
          {metreLines.xs.map((x) => (
            <line
              key={`mx${x}`}
              x1={x}
              y1={extent.minY}
              x2={x}
              y2={extent.maxY}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {metreLines.ys.map((y) => (
            <line
              key={`my${y}`}
              x1={extent.minX}
              y1={y}
              x2={extent.maxX}
              y2={y}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>
      )}

      <g
        stroke="#7a6f5d"
        strokeOpacity={0.42}
        strokeWidth={1}
        strokeDasharray="10 7"
      >
        {COLUMN_GRID_X_M.map((x) => (
          <line
            key={`cx${x}`}
            x1={x}
            y1={extent.minY}
            x2={x}
            y2={extent.maxY}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {COLUMN_GRID_Y_M.map((y) => (
          <line
            key={`cy${y}`}
            x1={extent.minX}
            y1={y}
            x2={extent.maxX}
            y2={y}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </g>
    </g>
  );
}

/**
 * Static relative to a drag: these layers depend only on the viewport (and the
 * measure state), so without memo they rebuilt their whole element tree on
 * every pointer frame of a move — the shell path, ~55 grid lines and the scale
 * bar, all re-created to render identically.
 */
export default memo(GridLayer);
