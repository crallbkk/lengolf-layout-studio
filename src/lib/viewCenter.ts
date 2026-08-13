import type { Vec2 } from './floorplan';

/**
 * Where the user is currently looking, in metres.
 *
 * A plain mutable ref rather than store state, on purpose: the canvas updates
 * this on every pan and zoom frame, and routing that through the store would
 * re-run every selector in the app on each frame for a value only `addObject`
 * ever reads — and it reads it imperatively, not by subscription.
 *
 * `null` until the canvas has mounted and measured.
 */
export const viewCenter: { current: Vec2 | null } = { current: null };
