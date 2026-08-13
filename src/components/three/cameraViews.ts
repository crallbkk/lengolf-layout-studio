import { shellBounds } from '@/lib/volume';

/**
 * Named viewpoints.
 *
 * Kept in their own module, free of any three.js import, so the panel can
 * reference them without pulling the whole renderer into the bundle ahead of
 * the dynamic import that is supposed to defer it.
 *
 * The three interior views match the shot list the concept renders are built
 * from, which is the point: frame a view here, screenshot it, and the render
 * that comes back is of the layout as drawn rather than one the image model
 * invented.
 */

export interface CameraView {
  position: [number, number, number];
  target: [number, number, number];
}

const B = shellBounds();

/** Standing eye height, used by every interior viewpoint. */
const EYE = 1.65;

const view = (
  position: [number, number, number],
  target: [number, number, number],
): CameraView => ({ position, target });

export const CAMERA_VIEWS = {
  overview: view([B.cx - 6, 19, B.maxY + 14], [B.cx, 0, B.cy]),
  /** Just inside the shopfront on the west edge, looking down the room. */
  entrance: view([1.4, EYE, 7.2], [18, 1.3, 10.5]),
  /** Across the room rather than along it, so all six bays read end to end. */
  bayRun: view([3.2, EYE, 2.6], [22, 1.2, 12.4]),
  /** Looking north at the curved plaza glazing. */
  glazing: view([9.2, EYE, 9.8], [7.5, 1.5, 0]),
};

export type CameraViewKey = keyof typeof CAMERA_VIEWS;
