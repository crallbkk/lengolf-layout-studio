'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * A media query as a React value.
 *
 * useSyncExternalStore rather than useEffect + useState so the value is correct
 * in the *first* committed render rather than one frame later. Both consumers
 * of this file choose a layout, and a one-frame-late answer is a visible flash
 * of the desktop shell on a phone.
 *
 * The server snapshot is a hard `false`. Nothing that reads these hooks renders
 * on the server today — `page.tsx` gates its whole tree behind `hydrated` — but
 * returning the desktop answer is the safe direction if that ever changes: a
 * phone corrects itself on hydration, whereas a desktop briefly told it was a
 * phone would tear down and rebuild the canvas.
 */
/**
 * One MediaQueryList per query for the lifetime of the page. React calls
 * getSnapshot several times per render and compares the results, so building a
 * fresh MediaQueryList each time is pure waste — and there are only ever two
 * distinct queries in this app.
 */
const mqlCache = new Map<string, MediaQueryList>();

function mql(query: string): MediaQueryList | null {
  if (typeof window === 'undefined' || !window.matchMedia) return null;
  let m = mqlCache.get(query);
  if (!m) {
    m = window.matchMedia(query);
    mqlCache.set(query, m);
  }
  return m;
}

function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const m = mql(query);
      if (!m) return () => {};
      m.addEventListener('change', onChange);
      return () => m.removeEventListener('change', onChange);
    },
    [query],
  );

  const getSnapshot = useCallback(() => mql(query)?.matches ?? false, [query]);

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/**
 * Below Tailwind's `md`. This is the line between "panel beside the canvas" and
 * "panel over the canvas": at 768px the w-80 aside still leaves 448px of
 * drawing surface, which is usable; at 375px it leaves 55px, which is not.
 *
 * `47.999rem`, not `767px`, so this asks the browser the SAME question Tailwind
 * does. Tailwind emits `md` as `48rem`, and rem in a media query resolves
 * against the browser's default font size — a user accessibility setting, not
 * `html { font-size }`. At a 20px default, `md:` flips at 960px while a px
 * query would still flip at 767px, and every viewport in between would render
 * the desktop shell from JS with the mobile-only CSS chrome laid on top of it:
 * the HUD bar over the Structure panel, the thumbstick on screen, the side
 * panel with none of its `md:` sizing. Same band is reachable at a normal 16px
 * default via browser zoom or fractional device scaling.
 */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 47.999rem)');
}

/**
 * Deliberately keyed off the pointer rather than the viewport. Hit targets have
 * to grow for a fingertip whatever the screen is attached to, and a large
 * touchscreen laptop needs them exactly as much as a phone does.
 */
export function useCoarsePointer(): boolean {
  return useMediaQuery('(pointer: coarse)');
}
