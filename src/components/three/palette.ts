/**
 * Two ways to render the same model.
 *
 * `schematic` is the study drawing: catalog colours, flat even light, nothing
 * dressed up. `finished` is the venue as the concept describes it, using the
 * material palette from the deck's visual DNA.
 *
 * Keeping both, rather than replacing one with the other, is the point. The
 * project's standing rule is that mood approval must not quietly become layout
 * approval, and a model that only ever looks finished is exactly how that
 * happens. Schematic stays the default for the same reason.
 *
 * Source: the LENGOLF material board and the visual DNA table —
 * exposed charcoal soffit with red sprinkler runs, large-format pale stone in
 * circulation, light oak at the bays, charcoal acoustic panelling, deep green
 * velvet, oak tops on black frames, brass accents, low warm pooled light.
 */

export type PaletteMode = 'schematic' | 'finished';

export interface Palette {
  /** Shell. */
  floor: string;
  bayFloor: string;
  soffit: string;
  beam: string;
  column: string;
  blockwork: string;
  glazingFrame: string;
  services: string;

  /** Bays. */
  bayPanel: string;
  bayPlatform: string;
  screenEmissive: string;
  screenIntensity: number;
  cove: string;
  coveIntensity: number;
  turf: string;

  /** Furniture. */
  upholstery: string;
  timber: string;
  brass: string;
  barCounter: string;
  barFront: string;

  /** Environment. */
  background: string;
  ambient: number;
  hemi: number;
  key: number;
  fill: number;
  /** True when object colours should come from the catalog instead. */
  useCatalogColours: boolean;
}

/** Brand palette, from the deck. */
const FOREST = '#005a32';
const DEEP_GREEN = '#003d24';
const GOLD = '#c8a96e';
const WARM_BLACK = '#16211b';
const OFF_WHITE = '#f1ede6';

export const PALETTES: Record<PaletteMode, Palette> = {
  schematic: {
    floor: '#e8e6e1',
    bayFloor: '#e8e6e1',
    soffit: '#a9a69f',
    beam: '#a9a69f',
    column: '#b9b6ae',
    blockwork: '#d7d4cc',
    glazingFrame: '#3b3f42',
    services: '#9aa0a6',

    bayPanel: '#8a8f92',
    bayPlatform: '#d7d4cc',
    screenEmissive: '#dfeae4',
    screenIntensity: 0.55,
    cove: '#ffffff',
    coveIntensity: 0,
    turf: '#5f9e56',

    upholstery: '#1f4d3a',
    timber: '#a9762f',
    brass: '#c8a96e',
    barCounter: '#cfcdc6',
    barFront: '#b7b4ac',

    background: '#dee5e8',
    ambient: 0.5,
    hemi: 1.15,
    key: 0.75,
    fill: 0.35,
    useCatalogColours: true,
  },

  finished: {
    // Large-format pale stone in circulation, light oak plank at the bays.
    floor: '#cdc7bd',
    bayFloor: '#b08a5c',
    // Exposed soffit painted charcoal, services left visible.
    soffit: WARM_BLACK,
    beam: '#1d2722',
    column: '#2a3330',
    blockwork: '#242e2a',
    glazingFrame: '#1a1f1d',
    // The red sprinkler runs are a signature of the Chidlom ceiling.
    services: '#8c2f2a',

    bayPanel: '#242b28',
    bayPlatform: '#8a6a45',
    screenEmissive: '#eaf3ec',
    screenIntensity: 1.5,
    // Warm linear LED cove above each bay opening, and the vertical strips
    // between bays, are what make a run of bays read as separate rooms.
    cove: GOLD,
    coveIntensity: 2.4,
    turf: '#3f8a3a',

    upholstery: DEEP_GREEN,
    timber: '#9a6b3a',
    brass: GOLD,
    // Grey polished concrete counter, ribbed dark green panel front.
    barCounter: '#8e8b85',
    barFront: FOREST,

    background: '#0e1512',
    /**
     * Low and warm, but not black. The first pass took the concept's "low,
     * warm, pooled, deep shadow" literally and dropped ambient to 0.24 with no
     * light sources in the room, so the venue rendered as a dark smear. Pooled
     * light needs pools: the lift here is paid for by the bay coves and the
     * screens actually emitting, below.
     */
    ambient: 0.5,
    hemi: 0.62,
    key: 0.34,
    fill: 0.2,
    useCatalogColours: false,
  },
};

export { OFF_WHITE };
