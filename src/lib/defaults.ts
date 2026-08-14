import type { Settings } from './types';

/**
 * Lives here rather than in the store so the share codec can compare against it
 * without importing the store — the store imports the codec, and the cycle
 * would leave one of the two holding `undefined` at module-eval time depending
 * on which side the bundler entered first.
 */
export const DEFAULT_SETTINGS: Settings = {
  gridSnapMm: 100,
  snapEnabled: true,
  angleSnapDeg: 15,
  angleSnapEnabled: true,
  clearanceM: 0.9,
  showGrid: true,
  showClearance: false,
};
