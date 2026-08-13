# LENGOLF Layout Studio — One Bangkok Unit 1225

An internal, browser-based tool for trialling golf-simulator bay arrangements inside the
fixed irregular unit at One Bangkok. Drag, rotate and resize bays and zones on an accurate
floor plan, get live overlap and clearance warnings, measure distances, and watch the area
budget update as you go.

No accounts, no server, no export. Open it, rearrange, send someone the link.

## Running it

```bash
npm install
```

```bash
npm run dev
```

Then open <http://localhost:3000>.

Other scripts:

```bash
npm run test
```

```bash
npm run typecheck
```

```bash
npm run build
```

## Access control

The deployed site is behind a single shared password, enforced in `src/proxy.ts`
(`proxy.ts` is the Next 16 replacement for `middleware.ts`). Vercel's own password
protection is a paid feature; this does the same job on the free tier.

Set these in Vercel → Project → Settings → Environment Variables:

| Variable | Required | Notes |
| --- | --- | --- |
| `APP_PASSWORD` | yes | The shared password. |
| `APP_USER` | no | Username, defaults to `lengolf`. |

Two behaviours worth knowing:

- **Local dev is open.** With `APP_PASSWORD` unset and `NODE_ENV !== 'production'`,
  the gate is skipped so `npm run dev` needs no setup. Set `APP_PASSWORD` in
  `.env.local` if you want to exercise it locally.
- **Production fails closed.** If `APP_PASSWORD` is unset in production the site
  returns `503`, not an open site. Silently serving the floor plan to the world is
  the one outcome worth breaking the deployment over.

It uses HTTP Basic auth rather than a styled login page, on purpose. A cookie-based
login page has to exempt `/_next/static` from the gate — otherwise the login page
can't load its own CSS and JS — and the unit's traced geometry and dimensions are
compiled into those JS chunks. Basic auth is replayed by the browser on every
request, so the bundle is covered too. Verified: an unauthenticated request for a
`/_next/static/chunks/*.js` file returns `401`.

The trade-offs: a native browser dialog instead of a designed form, and signing out
means closing the browser. It is also one shared secret with no per-user identity or
audit trail — fine for a small internal team, not a substitute for real auth if this
ever holds anything more sensitive.

## How it works

Everything is client-side. The layout lives in `localStorage`, and **Share link** encodes the
whole layout into the URL hash (LZ-compressed JSON), so a teammate opening that link sees the
exact arrangement. A layout in the hash always wins over local state — that is the point of
sending the link.

### The floor plan

The outer shell, columns, wall types and structural grid are extracted from the traced
One Bangkok R1 plan (`lengolf-area.svg`) into `src/lib/floorplan.ts`. That module is the single
source of geometric truth and is not meant to be hand-edited.

- **Units are metres everywhere** in the app (the source SVG is millimetres).
- **The y-axis points down**, matching SVG. Model space and screen space therefore agree, and
  a positive rotation is clockwise on screen. There is no axis flip anywhere in the codebase,
  which removes an entire category of sign bugs.
- The canvas is an SVG whose `viewBox` is expressed **directly in metres**, so world
  coordinates can be read straight off the DOM via `getScreenCTM()`. Screen-constant things
  (handles, labels, the scale bar) are sized through the `px()` helper in `src/lib/viewport.ts`.

### Objects

Every placeable thing — bay, bar, store, generic rectangle — is one primitive: an oriented
rectangle with a centre, width, depth and rotation. Keeping a single primitive is what makes
the transform and collision layers small enough to be tested properly.

Bays additionally carry a `seatingDepth`, drawn as an internal split line marking the
seating/safety strip in front of the hitting enclosure (the concept's 6.30 m = 1.70 + 4.60).
It is presentational and does not affect collision.

Type minimums (e.g. Social bay 4.50 × 6.30) are editable per type in the side panel. Going
under a minimum is **allowed** and merely raises an inline soft warning — the tool is for
exploring, not for enforcing.

### Collision and clearance

`src/lib/collision.ts` runs on every pointer move during a drag. Object-to-object tests use the
Separating Axis Theorem, which returns a *signed* separation: negative is penetration depth,
positive is the real gap in metres. One number answers both "do these overlap?" and "is the
clearance satisfied?", so the two checks can never disagree.

| Severity | Raised when |
| --- | --- |
| **Hard** (red) | Two objects genuinely overlap |
| **Hard** (red) | An object extends outside the unit footprint |
| **Soft** (amber) | Two **bays** leave an unusable sliver gap, under the clearance rule |
| **Soft** (amber) | A bay sits closer to a wall than the clearance rule |
| **Soft** (amber) | An object overlaps the fixed riser/shaft |
| **Soft** (amber) | A bay straddles the 24,370 corner — check the structural pier |

Three deliberate decisions are worth knowing about, because they are what stop the panel from
filling with noise the team would learn to ignore:

1. **Touching is intentional, slivers are the problem.** Bays in a row share dividers and sit
   flush to the rear wall; that is the design, not a violation. So the clearance rule fires on
   a gap that is *greater than zero but under the rule* — space too narrow to walk through and
   too wide to be a shared face. A hard-against-the-wall bay is silent.
2. **The clearance rule applies to bays only — bay-to-bay and bay-to-wall.** An earlier,
   broader version applied it between a bay and *any* zone, and the shipped concept layout
   immediately produced **29** soft warnings — every one of them just an ordinary aisle (0.58 m
   to the event floor, 0.78 m to the bar). That is precisely how a warning panel becomes
   wallpaper. Narrowing it to bays, which are the things with a swing arc to protect, takes the
   concept layout to 2 warnings, both worth a human look. `requiresClearance` in
   `catalog.ts` is per-type, so another type can be opted in if the team wants it.
3. **A riser clash is soft, not hard.** Back-of-house rooms legitimately enclose risers — the
   concept pantry does exactly that — so it is a "check the builder's drawing" flag rather
   than an impossibility.

All tolerances use a 1 mm epsilon: far above float noise, far below anything that matters on a
floor plan.

### Live stats

Occupied area is a **naive sum of each object's width × depth**, so overlapping objects are
double-counted. Rather than hide that, `stats.ts` computes the true pairwise overlap area
(Sutherland–Hodgman polygon clipping) and the stats bar shows a caution with the figure
whenever it is non-zero. Free area is allowed to go negative — an over-committed layout is
real information.

The capacity estimate is a rough per-type multiplier, labelled as approximate. Do not plan
staffing off it.

## Keyboard

| Key | Action |
| --- | --- |
| Drag background | Pan |
| Wheel | Zoom about the cursor |
| `Alt` while dragging | Temporarily disable grid snapping |
| `Shift` while rotating | Invert the angle-snap setting |
| `Shift`-click | Add to / remove from the selection |
| Arrow keys | Nudge by one grid step (`Shift` = 10×) |
| `Ctrl/Cmd` + `Z` / `Shift`+`Z` | Undo / redo |
| `Ctrl/Cmd` + `D` | Duplicate selection |
| `Ctrl/Cmd` + `A` | Select all |
| `L` | Lock / unlock selection |
| `F` | Fit the plan to the view (also the **Fit** toolbar button) |
| `Delete` / `Backspace` | Delete selection |
| `Esc` | Clear measure points → leave measure mode → clear selection |

`Ctrl/Cmd`+`D` and `L` apply to the whole selection as a **single** undo step, and duplicating
a multi-selection leaves the new copies selected so the group can be dragged straight off.

## Geometric approximations — read this before trusting a dimension

The plan is **traced from the One Bangkok R1 drawing and is for concept design only.** Known
deviations, all preserved deliberately rather than "corrected", because the tool must match the
reference drawing rather than an idealised version of it:

1. **Area is 358.05 m², not the 355 m² printed on the plan.** The traced polygon really does
   enclose 358.05 m² (verified three ways: chord-only 357.96, exact circular segment 358.05,
   tessellated 358.05). The ~0.9% gap is tracing tolerance in the source. The app uses the
   traced figure as the arithmetic source of truth so that occupied + free always reconciles,
   and shows the 355 m² lease figure alongside it as a reference. **Neither number is a
   substitute for the landlord's leasable-area certificate.**
2. **The shop-front corner arc has a 21.7° tangent kink.** The `A 1788 1788` arc sweeps 40°,
   but the straight run that follows it leaves at 61.7°. The source trace is not
   tangent-continuous there. Preserved as-is.
3. **The arc centre is 0.068 mm off a clean (10500, 1788).** Derived properly from the SVG
   endpoint-to-centre parameterisation; not snapped.
4. **Three columns are slightly off the structural grid** (`col-2` and `col-3` in
   `floorplan.ts`, by up to 244 mm). This looks like trace slop, but the columns were not
   snapped to the grid — the drawing is the reference.
5. **Grid lines 1-6 (x = 30.385) and 1-D (y = 17.394) fall outside the shell.** They are real
   grid lines with bubble labels, so they are kept; just do not assume grid ⊆ footprint.
6. **The riser/shaft** at (27.700, 3.344), 1085 × 900 mm, is modelled as a fixed obstacle. Its
   exact extent and whether it is a riser, a shaft or a column enclosure should be confirmed
   against the builder's drawing.
7. **Wall thicknesses are not modelled.** All walls are zero-thickness lines on the traced
   centreline/inner face. Budget for real construction thickness before committing.

## Architecture

```
src/
  lib/
    floorplan.ts    Extracted geometry — the source of truth. Do not hand-edit.
    types.ts        PlacedObject, Settings, Warning, TypeSpec
    geometry.ts     Rotation, local/world frames, SAT, point-in-polygon, snapping
    collision.ts    The warning engine
    catalog.ts      Per-type defaults, colours, minimums, capacity
    stats.ts        Areas, counts, true overlap area (pure)
    seed.ts         The OPTION 2 concept layout, loaded on first run
    viewport.ts     Metre-space viewBox, zoom/pan, pointer -> world
  store/
    useLayoutStore.ts   Zustand: objects, settings, selection, undo/redo, persistence
  components/
    canvas/         SVG plan, layers, gestures, measure tool
    panel/          Catalog, inspector, object list, settings
    StatsBar / WarningsPanel / Toolbar
```

Undo/redo works on snapshots. Discrete edits push history themselves; continuous gestures call
`beginChange()` once on pointer-down and then update transiently, so a whole drag collapses
into a single undo step.

## Tests

```bash
npm run test
```

Covers the geometry primitives (rotation direction, world↔local round-trips, SAT separation
against rotated boxes that axis-aligned tests get wrong), footprint containment including the
24,370 notch, the clearance and tolerance rules, and a guard that the shipped concept layout
produces no hard warnings.

## Not in v1

Export, authentication, real-time multi-user sync (sharing is via URL, not a live session),
wall thickness, door swings, and furniture-level detail.
