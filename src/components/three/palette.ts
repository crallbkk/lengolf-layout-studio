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
  /** Wood-look tile, used only where the concept calls for it. */
  woodTile: string;
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
  /** Ball-return run between the screen and the hitting mat. */
  turfDark: string;

  /** Furniture. */
  upholstery: string;
  /** Bay benches specifically — a lighter tone than the bar seating. */
  bench: string;
  timber: string;
  brass: string;
  barCounter: string;
  barFront: string;

  /** Environment. */
  background: string;
  hemiSky: string;
  hemiGround: string;
  ambient: number;
  hemi: number;
  key: number;
  fill: number;
  /** True when object colours should come from the catalog instead. */
  useCatalogColours: boolean;
}

/**
 * Brand reference, from the deck.
 *
 * Nothing here survives into the finished render unchanged. The greens are
 * brand colours for print and screen; in a lit 3D room they read as black, so
 * the venue's own materials — measured off the Mercury Ville photographs —
 * take precedence. Kept here as the reference they are.
 */
const OFF_WHITE = '#f1ede6';

export const PALETTES: Record<PaletteMode, Palette> = {
  schematic: {
    floor: '#e8e6e1',
    woodTile: '#e8e6e1',
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
    turfDark: '#3f7a44',

    upholstery: '#1f4d3a',
    bench: '#2f6b5c',
    timber: '#a9762f',
    brass: '#c8a96e',
    barCounter: '#cfcdc6',
    barFront: '#b7b4ac',

    background: '#dee5e8',
    hemiSky: '#ffffff',
    hemiGround: '#8d8b85',
    ambient: 0.5,
    hemi: 1.15,
    key: 0.75,
    fill: 0.35,
    useCatalogColours: true,
  },

  finished: {
    /**
     * Retuned against the Mercury Ville photographs rather than the written
     * palette alone, because the written version reads darker than the venue
     * actually is. The floor there is light oak plank through the whole bar and
     * lounge — not pale stone — and a light floor is most of why the real room
     * feels warm rather than black.
     */
    /**
     * Grey tile is the floor. Wood-look tile is only the lounge and event
     * areas, and light oak only the bay platforms and table tops — an earlier
     * pass ran oak wall to wall, which is the same mistake as turfing
     * everything, one material doing a job three materials share.
     */
    floor: '#c8c6c1',
    woodTile: '#c9a274',
    bayFloor: '#c9a274',
    // Only the soffit is actually dark. Everything else is raw concrete.
    soffit: '#20252a',
    beam: '#2b3136',
    // "Grey polished concrete — bar counter, columns", from the slide. These
    // were charcoal, and columns are the largest vertical surfaces in the room:
    // painting them near-black is most of why the render read as a dark cave
    // when the material board says the shell is RAW CONCRETE.
    column: '#8f8f8b',
    blockwork: '#8a8781',
    glazingFrame: '#2a2e30',
    // Red sprinkler runs, the signature of the Chidlom ceiling.
    services: '#b3352c',

    // Charcoal acoustic felt: bay linings, sound control.
    bayPanel: '#333a37',
    // Light oak: table tops, bay platforms.
    bayPlatform: '#c9a274',
    screenEmissive: '#eef5ee',
    screenIntensity: 1.4,
    // Warm linear LED cove above each bay opening, and the vertical strips
    // between bays, are what make a run of bays read as separate rooms.
    cove: '#e0b972',
    coveIntensity: 2.2,
    // "Turf — hitting mats and putting ONLY." Never wall to wall; see the mat
    // in Objects3D, which is what that rule actually constrains.
    turf: '#43a047',
    turfDark: '#1d5228',

    /**
     * Teal-green velvet, not the brand's deep green. Every seat at Mercury
     * Ville — bar stools, tub chairs, the banquette — is this lighter, bluer
     * green; DEEP_GREEN renders as black in a dark room and made the benches
     * vanish entirely.
     */
    /**
     * Between the two sources on purpose. The material board calls this deep
     * green velvet and shows it almost black; the Mercury Ville photographs
     * show every seat reading as a lighter teal-green under warm light. The
     * board's swatch renders as a black hole in a lit room, so this sits where
     * the venue actually looks.
     */
    upholstery: '#1f5347',
    /**
     * The bay benches are their own colour. The material board's "deep green
     * velvet" covers banquettes, armchairs and bar stools — the bar seating —
     * but the tufted benches in the Mercury Ville bays are a much lighter
     * teal-green, and rendering them in bar green is why they kept
     * disappearing into the bay lining behind them.
     */
    bench: '#2d7a66',
    // Light oak, for table tops.
    timber: '#c9a274',
    brass: '#d3ad64',
    // Grey polished concrete counter, ribbed deep green panel front.
    barCounter: '#8f8f8b',
    barFront: '#1d4b40',

    background: '#1b2226',
    // Warm bounce off an oak floor, dark above. This is what the photographs
    // show: a black ceiling over a bright warm floor, not a dark room.
    hemiSky: '#e2e9ec',
    hemiGround: '#b8b4ad',
    /**
     * "Low, warm, pooled, deep shadow" describes the CEILING and the walls, not
     * the whole venue. Taking it literally — ambient 0.24, no emitters — made
     * the room render as a dark smear. Mercury Ville is dark overhead and well
     * lit at table height, so the ambient carries the floor and the coves and
     * screens do the pooling.
     */
    ambient: 0.95,
    hemi: 1.0,
    key: 0.55,
    fill: 0.32,
    useCatalogColours: false,
  },
};

export { OFF_WHITE };
