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
function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    [query],
  );

  const getSnapshot = useCallback(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  }, [query]);

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/**
 * Below Tailwind's `md`. This is the line between "panel beside the canvas" and
 * "panel over the canvas": at 768px the w-80 aside still leaves 448px of
 * drawing surface, which is usable; at 375px it leaves 55px, which is not.
 */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 767px)');
}

/**
 * Deliberately keyed off the pointer rather than the viewport. Hit targets have
 * to grow for a fingertip whatever the screen is attached to, and a large
 * touchscreen laptop needs them exactly as much as a phone does.
 */
export function useCoarsePointer(): boolean {
  return useMediaQuery('(pointer: coarse)');
}
