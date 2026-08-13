import type { Vec2 } from './floorplan';

/**
 * The canvas is an SVG whose viewBox is expressed directly in METRES, so the
 * scene graph needs no transform of its own and world coordinates can be read
 * straight off the DOM.
 *
 * Invariant: the viewBox aspect ratio is kept identical to the container's
 * pixel aspect ratio. That makes `metresPerPixel` exactly width / pixelWidth,
 * with no letterboxing correction anywhere else in the codebase.
 */
export interface Viewport {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const MIN_VIEW_WIDTH_M = 2;
export const MAX_VIEW_WIDTH_M = 200;

export const viewBoxString = (v: Viewport) =>
  `${v.minX} ${v.minY} ${v.width} ${v.height}`;

export const metresPerPixel = (v: Viewport, pixelWidth: number) =>
  pixelWidth > 0 ? v.width / pixelWidth : 1;

/**
 * Screen-constant sizing helper: multiply a pixel size by this to get the world
 * size that renders at that many pixels regardless of zoom. Use it for handle
 * radii, font sizes and hit-target padding.
 */
export const px = (pixels: number, v: Viewport, pixelWidth: number) =>
  pixels * metresPerPixel(v, pixelWidth);

export function fitToBounds(
  b: Bounds,
  pixelWidth: number,
  pixelHeight: number,
  paddingM = 1.5,
): Viewport {
  const contentW = Math.max(0.001, b.maxX - b.minX + paddingM * 2);
  const contentH = Math.max(0.001, b.maxY - b.minY + paddingM * 2);
  const aspect = pixelWidth > 0 && pixelHeight > 0 ? pixelWidth / pixelHeight : 1;

  // Grow the smaller dimension so the viewBox matches the container aspect.
  let width = contentW;
  let height = contentH;
  if (contentW / contentH > aspect) {
    height = contentW / aspect;
  } else {
    width = contentH * aspect;
  }

  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  return { minX: cx - width / 2, minY: cy - height / 2, width, height };
}

/** Re-fit an existing viewport to a new container aspect, preserving centre. */
export function reaspect(
  v: Viewport,
  pixelWidth: number,
  pixelHeight: number,
): Viewport {
  if (pixelWidth <= 0 || pixelHeight <= 0) return v;
  const aspect = pixelWidth / pixelHeight;
  const cx = v.minX + v.width / 2;
  const cy = v.minY + v.height / 2;
  const height = v.width / aspect;
  return { minX: cx - v.width / 2, minY: cy - height / 2, width: v.width, height };
}

/** Zoom about a fixed world point, so the point under the cursor stays put. */
export function zoomAt(v: Viewport, anchor: Vec2, factor: number): Viewport {
  const width = Math.min(
    MAX_VIEW_WIDTH_M,
    Math.max(MIN_VIEW_WIDTH_M, v.width * factor),
  );
  const applied = width / v.width;
  const height = v.height * applied;
  return {
    minX: anchor.x - (anchor.x - v.minX) * applied,
    minY: anchor.y - (anchor.y - v.minY) * applied,
    width,
    height,
  };
}

export function panBy(v: Viewport, dxWorld: number, dyWorld: number): Viewport {
  return { ...v, minX: v.minX - dxWorld, minY: v.minY - dyWorld };
}

/**
 * Pointer event -> world metres, via the SVG's own CTM. This is authoritative:
 * it survives CSS transforms, device pixel ratio and page scroll without any
 * bookkeeping of our own.
 */
export function clientToWorld(
  clientX: number,
  clientY: number,
  svg: SVGSVGElement | null,
): Vec2 {
  if (!svg) return { x: 0, y: 0 };
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const p = pt.matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
}
