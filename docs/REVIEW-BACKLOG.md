# Review backlog

Open items from the codebase audit of 14 Aug 2026. Four independent reviewers
covered the math core, the canvas interaction layer, state/persistence, and the
3D subsystem. Everything below was **demonstrated with a concrete repro** by the
reviewer — these are not speculative concerns.

Fixed items are not listed here; they are in the git history with the reasoning
in the commit messages and in code comments at each site.

---

## 3D subsystem (partially fixed)

Fixed already: click-vs-drag selection, walk-mode spawn point, the beam that
overhung the shell, and the beam/slab hydration invariant.

### 1. Per-render geometry churn in `Objects3D.tsx` — perf
`src/components/three/Objects3D.tsx:127-129` (floor-finish rim) and `:397-402`
(selection cage).

`new THREE.BoxGeometry(...)` is constructed inline in an `args` array, so its
identity changes every React render. r3f's shallow `args` diff therefore always
fails and it tears down and rebuilds the `EdgesGeometry` — edge extraction means
a vertex merge plus hashing — on every render of that component. That is every
structure-slider tick multiplied by (2 floor finishes + every selected object).
The throwaway `BoxGeometry` is never disposed, since r3f only disposes JSX-child
instances; it is CPU garbage rather than a GPU leak, but the churn is real while
dragging a slider.

**Fix:** `useMemo` the `EdgesGeometry` keyed on `(w, h, d)` and dispose it in the
memo cleanup, or share one unit-box edges geometry and scale the `lineSegments`.

### 2. Per-frame allocations in the walk loop — perf
`src/components/three/WalkControls.tsx:136-158`.

`useFrame` allocates a `new THREE.Euler` every frame — even when idle, because
the quaternion is rewritten unconditionally — plus two `new THREE.Vector3` per
moving frame. At 60–120 fps that is steady GC pressure in the hottest loop in
the app.

**Fix:** hoist module-level scratch `Euler` / `Vector3` instances and reuse them.
(Movement is correctly `delta`-scaled, so frame-rate independence is fine.)

### 3. Beam-overlap test is AABB-conservative under rotation — documentation
`src/lib/volume.ts:247-269, 285`.

Rotation *is* handled correctly for the play band itself (verified numerically:
`swingZone` rotates the offset into world space and matches the 2D result to
1e-15). But `overheadAt` then collapses the rotated corners to an axis-aligned
bounding box before testing against the axis-aligned beam bands. For a bay at
30° the AABB is up to ~40% larger than the true band, so a beam that actually
misses can still flag `underBeam` and pull `clearM` down to the beam soffit.

The error direction is safe — false warning, never a false pass — and it is
irrelevant for the all-axis-aligned seed layout. The problem is that nothing
says so, in a file that is otherwise scrupulous about stating its assumptions.

**Fix:** one comment line, or an exact OBB test via `convexSeparation` from
`geometry.ts`.

### 4. Mode toggles discard the current vantage — UX
`Scene3D.tsx:135-149`, `WalkControls.tsx:51,118`.

Both control components re-apply the last preset whenever they remount, so
toggling Orbit↔Walk snaps the camera back to the last preset instead of keeping
where you were looking.

**Fix:** carry the camera pose across mode switches — only apply a preset when
the view nonce actually increments past the value seen at mount.

### 5. Walk mode has no collision — decide, then document
`WalkControls.tsx`. You can walk through walls, through bays, and out of the
building. Floor height is pinned, so there is no falling through. Possibly
acceptable for a study tool, but it is currently neither prevented nor stated,
unlike the other deliberate omissions (no pointer lock, no shadows).

### 6. Open slot under the slab where no beam runs — visual
`Shell3D.tsx:55-80` with `volume.ts:97-103`.

Solid wall panels stop at `beamSoffitM` on the grounds that the blockwork dies
into the downstand — but beams exist on only five grid lines. Along the east
wall, the store walls and others there is no downstand, leaving an open ~0.75 m
slot between the wall top and the slab. With the ceiling on you can see through
it in walk mode.

**Fix:** run those walls to `slabSoffitM`, or accept and comment it.

---

## Canvas

### 7. Move snaps the centre, resize snaps the size — mixed models
`FloorPlanCanvas.tsx:137` vs `:621-623`. Verified: an object with edges at 0 and
0.5 (100 mm grid) has its centre snapped to a 0.1 multiple by any move, putting
its edges at 0.35 / 0.85 — permanently 50 mm off-grid. An object resized flush
to a wall can never be made flush again after being moved.

**Fix:** pick one reference for both gestures. Snapping the moving edge's world
position is the conventional CAD answer.

### 8. Measure mode has no feedback before the first click — UX
`MeasureLayer.tsx:64` returns `null` until a point is committed, so between
activating the tool and clicking there is nothing but a crosshair cursor.
Meanwhile `FloorPlanCanvas.tsx:581-584` calls `setMeasureCursor` on every
pointermove — a store write and full canvas re-render per frame, rendering
nothing new.

**Fix:** show a cursor dot / coordinate pill before the first point, and skip
`setMeasureCursor` when the snapped value has not changed.

### 9. ScaleBar can exceed its stated 200 px cap
`ScaleBar.tsx:30-38`. The loop breaks on the first candidate ≥ 80 px, and
`MAX_BAR_PX` only gates the fallback, so the smallest candidate (0.2 m) is
exempt. At full zoom on a canvas ≥ 2000 CSS px wide the bar renders 200–340 px,
contradicting the header comment.

**Fix:** apply the cap to the break case, or add a 0.1 m candidate.

---

## Store / panel

### 10. Text fields are not persisted until blur
`ui.tsx:476-487`. `TextField` commits transiently per keystroke and only
persists on blur. Type a label or a note, close the tab without blurring, and
the text is gone — while the toolbar said "Saved locally" the whole time. It
also lacks the Enter-to-blur affordance `NumberField` has.

**Fix:** commit on Enter, or debounce a persist for transient text edits.

---

## Deliberately not doing

- **three.js code splitting.** Already handled: `View3D` loads `Scene3D` through
  `next/dynamic`, and the ~900 KB three chunk is absent from the build manifest,
  so it only downloads when 3D is opened.
- **Wall thickness, door swings, furniture detail.** Out of scope for v1, as in
  the README.
