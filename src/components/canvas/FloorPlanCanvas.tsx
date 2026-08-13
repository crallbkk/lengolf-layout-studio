'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import GridLayer from './GridLayer';
import MeasureLayer from './MeasureLayer';
import ObjectShape from './ObjectShape';
import ScaleBar from './ScaleBar';
import SelectionHandles, {
  HANDLE_AXES,
  type HandleId,
} from './SelectionHandles';
import ShellLayer from './ShellLayer';

import { CATALOG } from '@/lib/catalog';
import {
  computeWarnings,
  hardWarningIds,
  softWarningIds,
} from '@/lib/collision';
import { SHELL_OUTLINE } from '@/lib/floorplan';
import { viewCenter } from '@/lib/viewCenter';
import { bounds, corners, snap, toLocal, toWorld } from '@/lib/geometry';
import type { ObjectKind, PlacedObject, Settings, TypeSpec, Vec2 } from '@/lib/types';
import {
  clientToWorld,
  fitToBounds,
  metresPerPixel,
  panBy,
  reaspect,
  viewBoxString,
  zoomAt,
  type Viewport,
} from '@/lib/viewport';
import { useLayoutStore } from '@/store/useLayoutStore';

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

/** Hard floor on any edited dimension. Type minimums are a *soft* warning and
 *  are deliberately not enforced here — this only stops inversion/collapse. */
const MIN_SIZE_M = 0.3;

/** External hook so a toolbar can re-fit without a prop drill. */
export const FIT_EVENT = 'floorplan:fit';

const ZOOM_SENSITIVITY = 0.0015;

type DragMode = 'none' | 'pan' | 'move' | 'resize' | 'rotate' | 'marquee';

interface DragOriginal {
  id: string;
  cx: number;
  cy: number;
  w: number;
  d: number;
  rotation: number;
}

interface DragState {
  mode: DragMode;
  pointerId: number;
  lastClientX: number;
  lastClientY: number;
  startWorld: Vec2;
  originals: DragOriginal[];
  primary: DragOriginal | null;
  handle: HandleId | null;
  /** beginChange() is fired lazily, but at most once per gesture. */
  historyPushed: boolean;
  moved: boolean;
}

const idleDrag = (): DragState => ({
  mode: 'none',
  pointerId: -1,
  lastClientX: 0,
  lastClientY: 0,
  startWorld: { x: 0, y: 0 },
  originals: [],
  primary: null,
  handle: null,
  historyPushed: false,
  moved: false,
});

type HitTarget =
  | { type: 'object'; id: string }
  | { type: 'handle'; handle: HandleId };

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Translation snap step in metres; 0 means "do not snap". */
const stepFor = (settings: Settings, altKey: boolean) =>
  settings.snapEnabled && !altKey ? settings.gridSnapMm / 1000 : 0;

const snapPoint = (p: Vec2, step: number): Vec2 =>
  step > 0 ? { x: snap(p.x, step), y: snap(p.y, step) } : p;

/** Freeze only the geometry a gesture needs, so no frame can read live state. */
const toOriginal = (o: PlacedObject): DragOriginal => ({
  id: o.id,
  cx: o.cx,
  cy: o.cy,
  w: o.w,
  d: o.d,
  rotation: o.rotation,
});

/**
 * One axis of a resize, in the object's LOCAL frame.
 * `h` is -1 (min edge moves), 0 (axis untouched) or +1 (max edge moves).
 * The opposite edge is held fixed, so the object grows from where it was.
 */
function resizeAxis(
  localCoord: number,
  h: -1 | 0 | 1,
  originalSize: number,
  step: number,
): { size: number; centreOffset: number } {
  if (h === 0) return { size: originalSize, centreOffset: 0 };
  const halfO = originalSize / 2;
  const fixedEdge = h === -1 ? halfO : -halfO;
  let size = h === -1 ? fixedEdge - localCoord : localCoord - fixedEdge;
  size = Math.max(MIN_SIZE_M, size);
  if (step > 0) size = Math.max(MIN_SIZE_M, snap(size, step));
  const centreOffset =
    h === -1 ? fixedEdge - size / 2 : fixedEdge + size / 2;
  return { size, centreOffset };
}

const isTypingTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
};

/**
 * Space and Enter activate a focused control. These shortcuts live on `window`,
 * so without this every button in the toolbar and side panel would stop
 * responding to the keyboard the moment the canvas mounted.
 */
const isActivatableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'BUTTON' ||
    tag === 'A' ||
    target.getAttribute('role') === 'button' ||
    target.closest('button,[role="button"]') !== null
  );
};

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function FloorPlanCanvas() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const dragRef = useRef<DragState>(idleDrag());
  /** Set by whichever child received the pointerdown, read by the root. */
  const hitRef = useRef<HitTarget | null>(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  const spaceRef = useRef(false);
  const fittedRef = useRef(false);

  const [size, setSize] = useState({ w: 0, h: 0 });
  const [viewport, setViewport] = useState<Viewport>({
    minX: -2,
    minY: -2,
    width: 34,
    height: 22,
  });
  const [marquee, setMarquee] = useState<{ a: Vec2; b: Vec2 } | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const [panning, setPanning] = useState(false);

  const objects = useLayoutStore((s) => s.objects);
  const settings = useLayoutStore((s) => s.settings);
  const selectedIds = useLayoutStore((s) => s.selectedIds);
  const measure = useLayoutStore((s) => s.measure);
  const typeOverrides = useLayoutStore((s) => s.typeOverrides);

  /* ---------------- derived ---------------- */

  const specOf = useCallback(
    (kind: ObjectKind): TypeSpec => {
      const base = CATALOG[kind];
      const ov = typeOverrides[kind];
      return ov ? { ...base, minW: ov.minW, minD: ov.minD } : base;
    },
    [typeOverrides],
  );

  // Recomputed on every transient drag update, which is exactly what makes the
  // red/amber feedback live while an object is still under the cursor.
  const warnings = useMemo(
    () => computeWarnings(objects, settings),
    [objects, settings],
  );
  const hardIds = useMemo(() => hardWarningIds(warnings), [warnings]);
  const softIds = useMemo(() => softWarningIds(warnings), [warnings]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const soleSelected = useMemo(() => {
    if (selectedIds.length !== 1) return null;
    const o = objects.find((x) => x.id === selectedIds[0]);
    return o && !o.locked ? o : null;
  }, [selectedIds, objects]);

  const ready = size.w > 0 && size.h > 0;
  const mpp = metresPerPixel(viewport, size.w);

  // Publish where the user is looking so newly added objects land on screen
  // instead of at a fixed point that may be scrolled out of view. In an effect
  // rather than inline: writing module state during render is impure and would
  // misbehave under concurrent rendering.
  useEffect(() => {
    viewCenter.current = {
      x: viewport.minX + viewport.width / 2,
      y: viewport.minY + viewport.height / 2,
    };
  }, [viewport]);

  /* ---------------- hydrate + sizing ---------------- */

  useEffect(() => {
    useLayoutStore.getState().hydrate();
  }, []);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const apply = (w: number, h: number) => {
      const next = { w: Math.round(w), h: Math.round(h) };
      sizeRef.current = next;
      setSize((prev) => (prev.w === next.w && prev.h === next.h ? prev : next));
    };

    /**
     * Measure once, synchronously, before observing. ResizeObserver callbacks
     * are delivered as part of the rendering steps, so a canvas that waits for
     * the first callback stays blank in any context that is not compositing —
     * a background tab, an offscreen pane, a hidden container. The element
     * already has layout by this point, so there is no reason to wait for it.
     */
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) apply(r.width, r.height);

    const ro = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box) return;
      apply(box.width, box.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fitNow = useCallback(() => {
    const { w, h } = sizeRef.current;
    if (w <= 0 || h <= 0) return;
    const pts: Vec2[] = [...SHELL_OUTLINE];
    for (const o of useLayoutStore.getState().objects) pts.push(...corners(o));
    setViewport(fitToBounds(bounds(pts), w, h));
  }, []);

  useEffect(() => {
    if (size.w <= 0 || size.h <= 0) return;
    if (!fittedRef.current) {
      fittedRef.current = true;
      fitNow();
      return;
    }
    setViewport((v) => reaspect(v, size.w, size.h));
  }, [size.w, size.h, fitNow]);

  useEffect(() => {
    const handler = () => fitNow();
    window.addEventListener(FIT_EVENT, handler);
    return () => window.removeEventListener(FIT_EVENT, handler);
  }, [fitNow]);

  /* ---------------- wheel zoom (non-passive) ---------------- */

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !ready) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const anchor = clientToWorld(e.clientX, e.clientY, svgRef.current);
      const factor = Math.exp(e.deltaY * ZOOM_SENSITIVITY);
      setViewport((v) => zoomAt(v, anchor, factor));
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [ready]);

  /* ---------------- keyboard ---------------- */

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const st = useLayoutStore.getState();
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key;

      if (key === ' ') {
        // Space is the pan modifier; never let it scroll the page — unless a
        // button has focus, where Space belongs to that button.
        if (isActivatableTarget(e.target)) return;
        e.preventDefault();
        if (!spaceRef.current) {
          spaceRef.current = true;
          setSpaceDown(true);
        }
        return;
      }

      if (key === 'Escape') {
        // Escape has to be able to leave the tool entirely: while measure mode
        // is on it swallows every canvas click, so without this the only way out
        // is finding the toolbar button.
        if (st.measure.active) {
          if (st.measure.points.length > 0) st.clearMeasure();
          else st.setMeasureActive(false);
        } else {
          st.clearSelection();
        }
        return;
      }

      if (mod && (key === 'z' || key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) st.redo();
        else st.undo();
        return;
      }
      if (mod && (key === 'y' || key === 'Y')) {
        e.preventDefault();
        st.redo();
        return;
      }
      if (mod && (key === 'd' || key === 'D')) {
        e.preventDefault();
        st.duplicateSelected();
        return;
      }
      if (mod && (key === 'a' || key === 'A')) {
        e.preventDefault();
        st.selectAll();
        return;
      }
      if (mod) return; // leave every other browser shortcut alone

      if (key === 'Delete' || key === 'Backspace') {
        e.preventDefault();
        st.removeSelected();
        return;
      }
      if (key === 'l' || key === 'L') {
        st.toggleLockSelected();
        return;
      }
      if (key === 'f' || key === 'F') {
        fitNow();
        return;
      }

      const nudge: Record<string, Vec2 | undefined> = {
        ArrowLeft: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 },
        ArrowUp: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 },
      };
      const dir = nudge[key];
      if (dir) {
        const movable = st.objects.filter(
          (o) => st.selectedIds.includes(o.id) && !o.locked,
        );
        if (movable.length === 0) return;
        e.preventDefault();
        const step = (st.settings.gridSnapMm / 1000) * (e.shiftKey ? 10 : 1);
        /**
         * Coalesce OS key-repeat into one history entry. beginChange() deep
         * clones every object, and HISTORY_LIMIT is 100 with a shift() — so
         * holding an arrow for a few seconds would otherwise evict the entire
         * undo stack and clear the redo future on every repeat.
         */
        if (!e.repeat) st.beginChange();
        for (const o of movable) {
          st.updateObject(o.id, {
            cx: o.cx + dir.x * step,
            cy: o.cy + dir.y * step,
          });
        }
      }
    };

    const releaseSpace = () => {
      if (!spaceRef.current) return;
      spaceRef.current = false;
      setSpaceDown(false);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') releaseSpace();
    };

    /**
     * Alt-Tab while holding Space and the keyup is delivered to the other
     * window, leaving the canvas stuck in forced-pan mode where clicks no longer
     * select anything. Drop the modifier whenever we lose the keyboard.
     */
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', releaseSpace);
    document.addEventListener('visibilitychange', releaseSpace);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', releaseSpace);
      document.removeEventListener('visibilitychange', releaseSpace);
    };
  }, [fitNow]);

  /* ---------------- child pointer-down reporters ---------------- */

  const onObjectPointerDown = useCallback(
    (e: ReactPointerEvent<SVGGElement>) => {
      const id = e.currentTarget.dataset.objectId;
      if (id) hitRef.current = { type: 'object', id };
    },
    [],
  );

  const onHandlePointerDown = useCallback((handle: HandleId) => {
    hitRef.current = { type: 'handle', handle };
  }, []);

  /* ---------------- gestures ---------------- */

  /** Push history at most once per gesture, and only once something moved. */
  const ensureHistory = (d: DragState) => {
    if (d.historyPushed) return;
    d.historyPushed = true;
    useLayoutStore.getState().beginChange();
  };

  const handlePointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    const hit = hitRef.current;
    hitRef.current = null;

    const svg = svgRef.current;
    if (!svg) return;
    if (e.button !== 0 && e.button !== 1) return;

    /**
     * One gesture at a time. Without this, a second pointerdown mid-drag (a
     * middle-click while dragging, or the second finger of a pinch) replaces
     * dragRef with a fresh state whose `historyPushed` is false — so the final
     * non-transient write in endGesture never runs. The object has already moved
     * on screen and an undo entry has already been pushed, but nothing is
     * persisted, and the edit vanishes on reload.
     */
    if (dragRef.current.mode !== 'none') return;

    const st = useLayoutStore.getState();
    const world = clientToWorld(e.clientX, e.clientY, svg);

    // The tape measure owns every click while it is active.
    if (st.measure.active) {
      if (e.button === 0) {
        st.addMeasurePoint(snapPoint(world, stepFor(st.settings, e.altKey)));
      }
      return;
    }

    if (e.button === 1) e.preventDefault();
    svg.setPointerCapture(e.pointerId);

    const d = idleDrag();
    d.pointerId = e.pointerId;
    d.lastClientX = e.clientX;
    d.lastClientY = e.clientY;
    d.startWorld = world;

    const forcePan = e.button === 1 || spaceRef.current;

    if (forcePan || !hit) {
      if (!forcePan && e.shiftKey) {
        d.mode = 'marquee';
        setMarquee({ a: world, b: world });
      } else {
        d.mode = 'pan';
        setPanning(true);
        if (!forcePan) st.clearSelection();
      }
      dragRef.current = d;
      return;
    }

    if (hit.type === 'handle') {
      // Handles only ever render for `soleSelected`, which is already known to
      // be a single, unlocked object — no second lookup can disagree with it.
      const target = soleSelected;
      if (!target) {
        dragRef.current = idleDrag();
        return;
      }
      d.mode = hit.handle === 'rotate' ? 'rotate' : 'resize';
      d.handle = hit.handle;
      d.primary = toOriginal(target);
      d.originals = [toOriginal(target)];
      dragRef.current = d;
      return;
    }

    /* --- object --- */
    const clicked = st.objects.find((o) => o.id === hit.id);
    if (!clicked) {
      dragRef.current = idleDrag();
      return;
    }

    // Work out the resulting selection locally: the store update is async and
    // this gesture needs the post-click set right now.
    let nextSelection: string[];
    if (e.shiftKey) {
      nextSelection = st.selectedIds.includes(clicked.id)
        ? st.selectedIds.filter((x) => x !== clicked.id)
        : [...st.selectedIds, clicked.id];
      st.select(clicked.id, true);
    } else if (st.selectedIds.includes(clicked.id)) {
      nextSelection = st.selectedIds;
    } else {
      nextSelection = [clicked.id];
      st.select(clicked.id, false);
    }

    // A locked object is selectable so it can be unlocked, but never draggable.
    if (clicked.locked || !nextSelection.includes(clicked.id)) {
      dragRef.current = idleDrag();
      return;
    }

    const movable = st.objects.filter(
      (o) => nextSelection.includes(o.id) && !o.locked,
    );
    if (movable.length === 0) {
      dragRef.current = idleDrag();
      return;
    }

    d.mode = 'move';
    d.primary = toOriginal(clicked);
    d.originals = movable.map(toOriginal);
    dragRef.current = d;
  };

  const handlePointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const st = useLayoutStore.getState();

    if (st.measure.active) {
      const world = clientToWorld(e.clientX, e.clientY, svg);
      st.setMeasureCursor(snapPoint(world, stepFor(st.settings, e.altKey)));
      return;
    }

    const d = dragRef.current;
    if (d.mode === 'none' || e.pointerId !== d.pointerId) return;

    if (d.mode === 'pan') {
      const dxPx = e.clientX - d.lastClientX;
      const dyPx = e.clientY - d.lastClientY;
      d.lastClientX = e.clientX;
      d.lastClientY = e.clientY;
      const pw = sizeRef.current.w;
      setViewport((v) => {
        const m = metresPerPixel(v, pw);
        return panBy(v, dxPx * m, dyPx * m);
      });
      return;
    }

    const world = clientToWorld(e.clientX, e.clientY, svg);
    d.moved = true;

    if (d.mode === 'marquee') {
      setMarquee((m) => (m ? { a: m.a, b: world } : { a: d.startWorld, b: world }));
      return;
    }

    const step = stepFor(st.settings, e.altKey);

    if (d.mode === 'move') {
      const primary = d.primary;
      if (!primary) return;
      let dx = world.x - d.startWorld.x;
      let dy = world.y - d.startWorld.y;
      if (step > 0) {
        // Snap the delta via the primary's ORIGINAL centre so the object can
        // never drift: every frame is derived from the pointerdown state.
        dx = snap(primary.cx + dx, step) - primary.cx;
        dy = snap(primary.cy + dy, step) - primary.cy;
      }
      // Skip only while the gesture has not moved anything yet, so a plain
      // click never pushes history. Once it is live, a zero delta must still be
      // written — otherwise dragging back to the start strands the object.
      if (dx === 0 && dy === 0 && !d.historyPushed) return;
      ensureHistory(d);
      for (const o of d.originals) {
        st.updateObject(
          o.id,
          { cx: o.cx + dx, cy: o.cy + dy },
          { transient: true },
        );
      }
      return;
    }

    const original = d.primary;
    if (!original) return;

    if (d.mode === 'resize') {
      const handle = d.handle;
      if (!handle || handle === 'rotate') return;
      const axes = HANDLE_AXES[handle];
      const local = toLocal(world, original);
      const ax = resizeAxis(local.x, axes.hx, original.w, step);
      const ay = resizeAxis(local.y, axes.hy, original.d, step);
      const centre = toWorld(
        { x: ax.centreOffset, y: ay.centreOffset },
        original,
      );
      ensureHistory(d);
      st.updateObject(
        original.id,
        { cx: centre.x, cy: centre.y, w: ax.size, d: ay.size },
        { transient: true },
      );
      return;
    }

    if (d.mode === 'rotate') {
      // The stalk points along the object's local -y, i.e. 90 deg behind the
      // pointer bearing measured from the centre.
      const bearing =
        (Math.atan2(world.y - original.cy, world.x - original.cx) * 180) /
        Math.PI;
      let rotation = bearing + 90;
      // Shift inverts whatever the angle-snap setting currently says.
      const useSnap = st.settings.angleSnapEnabled !== e.shiftKey;
      if (useSnap && st.settings.angleSnapDeg > 0) {
        rotation = snap(rotation, st.settings.angleSnapDeg);
      }
      rotation = ((rotation % 360) + 360) % 360;
      ensureHistory(d);
      st.updateObject(original.id, { rotation }, { transient: true });
    }
  };

  const endGesture = (e?: ReactPointerEvent<SVGSVGElement>) => {
    const d = dragRef.current;

    /**
     * Only the pointer that started the gesture may end it. A stray pointerup
     * from a second finger would otherwise reset dragRef to idle, so the real
     * pointerup would then take the `mode === 'none'` path and silently drop the
     * pending persist.
     */
    if (e && d.pointerId >= 0 && e.pointerId !== d.pointerId) return;

    const svg = svgRef.current;
    if (svg && d.pointerId >= 0 && svg.hasPointerCapture(d.pointerId)) {
      svg.releasePointerCapture(d.pointerId);
    }
    if (d.mode === 'none') {
      dragRef.current = idleDrag();
      return;
    }

    const st = useLayoutStore.getState();

    if (d.mode === 'marquee') {
      const m = marquee;
      if (m) {
        const minX = Math.min(m.a.x, m.b.x);
        const maxX = Math.max(m.a.x, m.b.x);
        const minY = Math.min(m.a.y, m.b.y);
        const maxY = Math.max(m.a.y, m.b.y);
        for (const o of st.objects) {
          const b = bounds(corners(o));
          const overlaps =
            b.minX <= maxX && b.maxX >= minX && b.minY <= maxY && b.maxY >= minY;
          if (overlaps && !st.selectedIds.includes(o.id)) st.select(o.id, true);
        }
      }
      setMarquee(null);
    }

    if (d.mode === 'pan') setPanning(false);

    // One final non-transient write per touched object forces the persist that
    // the transient drag updates deliberately skipped.
    if (d.historyPushed) {
      for (const o of d.originals) {
        const cur = st.objects.find((x) => x.id === o.id);
        if (!cur) continue;
        st.updateObject(o.id, {
          cx: cur.cx,
          cy: cur.cy,
          w: cur.w,
          d: cur.d,
          rotation: cur.rotation,
        });
      }
    }

    dragRef.current = idleDrag();
  };

  const handlePointerLeave = () => {
    const st = useLayoutStore.getState();
    if (st.measure.active && dragRef.current.mode === 'none') {
      st.setMeasureCursor(null);
    }
  };

  /* ---------------- cursor ---------------- */

  const cursor = measure.active
    ? 'crosshair'
    : panning
      ? 'grabbing'
      : spaceDown
        ? 'grab'
        : 'default';

  /* ---------------- render ---------------- */

  return (
    <div ref={wrapRef} className="w-full h-full relative overflow-hidden">
      {ready && (
        <svg
          ref={svgRef}
          className="w-full h-full block select-none"
          viewBox={viewBoxString(viewport)}
          preserveAspectRatio="xMidYMid meet"
          style={{ touchAction: 'none', cursor, background: '#f4f2ee' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endGesture}
          onPointerCancel={endGesture}
          onPointerLeave={handlePointerLeave}
        >
          <ShellLayer viewport={viewport} pixelWidth={size.w} />

          {settings.showGrid && <GridLayer metresPerPixel={mpp} />}

          {/* Clearance envelopes, when the user has asked to see them. */}
          {settings.showClearance && (
            <g style={{ pointerEvents: 'none' }}>
              {objects
                .filter((o) => CATALOG[o.type].requiresClearance)
                .map((o) => (
                  <rect
                    key={`cl-${o.id}`}
                    x={-o.w / 2 - settings.clearanceM}
                    y={-o.d / 2 - settings.clearanceM}
                    width={o.w + settings.clearanceM * 2}
                    height={o.d + settings.clearanceM * 2}
                    transform={`translate(${o.cx} ${o.cy}) rotate(${o.rotation})`}
                    fill="none"
                    stroke="#0ea5e9"
                    strokeOpacity={0.45}
                    strokeWidth={1}
                    strokeDasharray="4 5"
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
            </g>
          )}

          <g>
            {objects.map((o) => (
              <ObjectShape
                key={o.id}
                object={o}
                spec={specOf(o.type)}
                selected={selectedSet.has(o.id)}
                hard={hardIds.has(o.id)}
                soft={softIds.has(o.id)}
                onPointerDown={onObjectPointerDown}
                viewport={viewport}
                pixelWidth={size.w}
              />
            ))}
          </g>

          {marquee && (
            <rect
              x={Math.min(marquee.a.x, marquee.b.x)}
              y={Math.min(marquee.a.y, marquee.b.y)}
              width={Math.abs(marquee.b.x - marquee.a.x)}
              height={Math.abs(marquee.b.y - marquee.a.y)}
              fill="#2563eb"
              fillOpacity={0.1}
              stroke="#2563eb"
              strokeWidth={1.25}
              strokeDasharray="5 4"
              vectorEffect="non-scaling-stroke"
              style={{ pointerEvents: 'none' }}
            />
          )}

          {soleSelected && !measure.active && (
            <SelectionHandles
              object={soleSelected}
              viewport={viewport}
              pixelWidth={size.w}
              onHandlePointerDown={onHandlePointerDown}
            />
          )}

          <MeasureLayer
            measure={measure}
            viewport={viewport}
            pixelWidth={size.w}
          />

          <ScaleBar viewport={viewport} pixelWidth={size.w} />
        </svg>
      )}
    </div>
  );
}
