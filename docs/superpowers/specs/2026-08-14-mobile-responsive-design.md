# Mobile responsiveness — LENGOLF Layout Studio

Date: 2026-08-14
Status: approved

## Problem

The studio is desktop-only below roughly 900px. On a 375×812 phone:

- The `w-80` side panel sits beside the canvas in a flex row, leaving ~55px of
  drawing surface.
- The toolbar's ~10 controls wrap into a 3–4 line stack that eats the screen.
- Several controls explain themselves only through `title=`, which does nothing
  on touch.
- Resize/rotate handles and the object padlock are small SVG shapes sized for a
  mouse.
- Walk mode is drag-to-look plus WASD, so on a phone you can look around but
  never move — a dead end.
- The 3D HUD's two floating panels (`w-72` bottom-left, `w-64` bottom-right)
  overlap each other and cover the model.
- `html, body { height: 100% }` breaks on iOS Safari as the URL bar shows and
  hides.

This is a presentation problem only. The layout data model, both stores,
`seed.ts` and the geometry are out of scope.

## Already working

Contrary to the initial brief, two-finger pinch-to-zoom and two-finger pan
already exist in `FloorPlanCanvas` (`touchesRef` / `pinchRef`, with
`touchAction: 'none'` on the SVG). One-finger drag on empty space already pans;
one-finger drag on an object already moves it. The remaining touch work is hit
target sizing, not gesture plumbing.

## Breakpoint and detection

Tailwind's `md` (768px) is the line. A 768×1024 iPad keeps the desktop layout —
448px of canvas beside the `w-80` aside is workable. Below that, mobile.

Behaviour CSS cannot express (sheets defaulting closed, overflow menu vs inline
toolbar) comes from a new SSR-safe `useIsMobile()` hook. This is safe because
`page.tsx` already gates the whole tree behind `hydrated`, so there is no server
pass for a media query to disagree with.

Touch target sizing keys off `useCoarsePointer()` — `(pointer: coarse)` — rather
than screen width, because a touch laptop needs the larger grips at any size.

## Components

### BottomSheet (new, shared)

One primitive used by the 2D panel, the warnings list and the 3D HUD, so mobile
has a single idiom rather than three. Drag handle, backdrop, two snap heights
(peek / full), Escape and backdrop-tap to close, `env(safe-area-inset-bottom)`
padding.

### 1 — Layout shell

`src/app/page.tsx`, `src/app/globals.css`, `src/app/layout.tsx`

Below md the canvas fills the viewport and the aside becomes a bottom sheet
behind a persistent bottom bar (safe-area padded) with three tap targets:
`Objects`, a stats summary chip, and `Warnings` carrying its severity badge.
Tapping a chip opens the corresponding sheet.

`html, body` move to `100dvh` with a `100%` fallback. The `h-full` classes come
off `layout.tsx` — a Tailwind class outranks an element selector, so leaving
them there would defeat the `dvh` rule. `viewportFit: 'cover'` is added to the
existing `viewport` export, and safe-area insets are respected on every fixed
control.

### 2 — Toolbar

`src/components/Toolbar.tsx`

Below md: the title truncates, Plan/3D and Undo/Redo stay inline, and Fit,
Measure (+ Clear), Snap and its grid label, Share link, the "Saved locally"
status and the published-layout banner move into a `⋯` popover. Every item in
the popover gets a visible text label. Tap targets are at least 44px.

### 3 — Canvas touch

`src/components/canvas/SelectionHandles.tsx`,
`src/components/canvas/ObjectShape.tsx`

Under a coarse pointer the handle hit boxes grow from `px(11)` to `px(24)`, and
the rotate stalk lengthens so the grip clears the fingertip covering the object.
The padlock loses its 0.32 "discoverable on hover" opacity — hover does not
exist on a phone — and gains a hit rect at the same 44px-equivalent scale.

Existing pointer-event drag modes (pan / move / resize / rotate / marquee) must
keep working unchanged with a mouse.

### 4 — 3D controls

`src/components/three/WalkControls.tsx`, `src/components/View3D.tsx`

Walk mode gains a bottom-left virtual thumbstick, touch-only and shown only in
walk mode on coarse pointers. It feeds the same `forward` / `strafe` scalars
that WASD produces, so there is one movement path and the mouse behaviour cannot
drift from the touch behaviour. The look-drag handler ignores pointers that land
on the stick.

Viewpoint chips scroll horizontally (`overflow-x-auto`, `flex-nowrap`) instead
of wrapping. Structure and Swing clearance collapse into one bottom bar showing
the headline figure, which opens a tabbed sheet.

### 5 — 3D performance

`src/components/three/Scene3D.tsx`, `src/components/three/Objects3D.tsx`

`dpr={[1, 2]}` drops to `[1, 1.5]` below md. `preserveDrawingBuffer` stays —
Save PNG depends on it.

Object labels default off on mobile. `useViewStore` is out of scope, so this is
local state in `View3D`; the `Labels` chip toggles that local state on mobile and
the store on desktop, which keeps the chip honest about what is on screen.

The per-bay `pointLight`s are measured before being touched. The finished
materials palette was calibrated against them, so the look is not changed on a
guess.

## Acceptance

At 375×812: the plan canvas is usable one-handed; an object can be selected,
moved and resized by touch; pinch zoom works; the 3D view can be orbited and
walked; no control is clipped or stacked more than two rows deep. Screenshots at
375×812 and 1280×800 as proof.

Gates: `npx tsc --noEmit`, `npx eslint src`, `npm test`, `npm run build`.
