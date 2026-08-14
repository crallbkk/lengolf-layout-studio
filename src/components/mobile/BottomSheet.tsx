'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';

/**
 * The one mobile disclosure primitive.
 *
 * The side panel, the warnings list and the 3D HUD all need the same thing:
 * something that stays out of the way, opens over the canvas on a tap, and can
 * be dismissed without hunting for a close button. Giving each of them its own
 * shape would mean three idioms to learn on the screen with the least room to
 * explain any of them.
 *
 * Nothing is rendered while closed. A permanently mounted sheet translated
 * off-screen still covers the canvas with a transparent backdrop unless every
 * layer is carefully pointer-events-none, and getting that subtly wrong costs
 * the user their drawing surface with no visible cause.
 */

export type SheetSnap = 'peek' | 'full';

/** Sheet heights. dvh, not vh: the iOS URL bar must not push the sheet off. */
const SNAP_HEIGHT: Record<SheetSnap, string> = {
  peek: '52dvh',
  full: '88dvh',
};

/** Drag thresholds in px, measured from where the handle was grabbed. */
const DISMISS_DY = 96;
const SNAP_DY = 44;

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Rendered at the right of the title row — a badge, a count, an action. */
  trailing?: ReactNode;
  initialSnap?: SheetSnap;
  children: ReactNode;
}

export default function BottomSheet({ open, ...rest }: BottomSheetProps) {
  // The panel is a separate component so that opening the sheet MOUNTS it. Its
  // snap height and drag offset then start at their defaults for free, rather
  // than needing an effect to reset state left over from the last time it was
  // open — and stale state here means a sheet that opens already half dragged
  // off the bottom of the screen.
  if (!open) return null;
  return <SheetPanel {...rest} />;
}

function SheetPanel({
  onClose,
  title,
  trailing,
  initialSnap = 'peek',
  children,
}: Omit<BottomSheetProps, 'open'>) {
  const [snap, setSnap] = useState<SheetSnap>(initialSnap);
  /** Live finger travel while the handle is held; null when not dragging. */
  const [dragDy, setDragDy] = useState<number | null>(null);
  const dragStartY = useRef(0);
  const dragPointerId = useRef<number | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const panel = panelRef.current;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        /**
         * Capture phase, and stopImmediatePropagation rather than
         * stopPropagation.
         *
         * FloorPlanCanvas also listens for Escape on `window`, where it clears
         * the selection — so dismissing a sheet used to silently wipe the
         * user's selection too. stopPropagation cannot prevent that: two
         * listeners on the same node are already at the end of the propagation
         * path, so there is nothing left to stop. Registering in the capture
         * phase puts this listener ahead of every bubble-phase window listener
         * whatever order they were added in, and the immediate variant is what
         * actually halts the rest of the dispatch.
         */
        e.stopImmediatePropagation();
        e.preventDefault();
        onClose();
        return;
      }

      // The dialog claims aria-modal, so Tab has to honour that claim.
      if (e.key !== 'Tab' || !panel) return;
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null,
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);

  // Move focus into the sheet so the next Tab lands inside it and a screen
  // reader announces what opened — then hand it back to whatever opened the
  // sheet, so a keyboard user does not restart at the top of the document.
  useEffect(() => {
    const restoreTo = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => {
      if (restoreTo && document.contains(restoreTo)) restoreTo.focus();
    };
  }, []);

  const onHandleDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    // The close button and anything in `trailing` are descendants of this
    // drag surface. Capturing their pointers here would both start a sheet
    // drag on a tap meant for them and, under the pointer-capture target
    // override, redirect their click to this element so it never fires.
    if ((e.target as HTMLElement).closest('button')) return;
    dragStartY.current = e.clientY;
    dragPointerId.current = e.pointerId;
    setDragDy(0);
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onHandleMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (dragPointerId.current !== e.pointerId) return;
      setDragDy(e.clientY - dragStartY.current);
    },
    [],
  );

  const onHandleUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (dragPointerId.current !== e.pointerId) return;
      const dy = dragDy;
      dragPointerId.current = null;
      setDragDy(null);
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      if (dy === null) return;
      if (dy > DISMISS_DY) onClose();
      else if (dy < -SNAP_DY) setSnap('full');
      else if (dy > SNAP_DY) setSnap('peek');
    },
    [dragDy, onClose],
  );

  // Downward drag follows the finger; upward does not, because the sheet has no
  // height above `full` to reveal and a stretchy top edge reads as broken.
  const offset = dragDy !== null && dragDy > 0 ? dragDy : 0;

  return (
    <div className="fixed inset-0 z-40 md:hidden">
      {/* Not a button: it would carry the same accessible name as the real
          close control, and a screen-reader user would hear "Close Objects"
          twice with no way to tell which is which. Escape and the × are the
          accessible paths out; this is the pointer shortcut. */}
      <div aria-hidden="true" onClick={onClose} className="absolute inset-0 bg-black/25" />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        style={{
          height: SNAP_HEIGHT[snap],
          transform: `translateY(${offset}px)`,
          transition:
            dragDy === null ? 'transform 160ms ease, height 160ms ease' : 'none',
        }}
        className="absolute inset-x-0 bottom-0 flex flex-col rounded-t-2xl border-t border-[var(--border)] bg-[var(--panel)] shadow-[0_-8px_28px_rgba(0,0,0,0.18)] outline-none"
      >
        <div
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
          style={{ touchAction: 'none' }}
          className="shrink-0 cursor-grab px-4 pb-1 pt-2 active:cursor-grabbing"
        >
          <div className="mx-auto h-1 w-10 rounded-full bg-black/20" aria-hidden="true" />
          <div className="mt-2 flex min-h-11 items-center gap-2">
            <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
            <div className="ml-auto flex items-center gap-2">
              {trailing}
              <button
                type="button"
                onClick={onClose}
                aria-label={`Close ${title}`}
                style={{ touchAction: 'manipulation' }}
                className="-mr-2 flex h-11 w-11 items-center justify-center rounded-md text-lg leading-none opacity-60 hover:bg-black/5 hover:opacity-100"
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
          </div>
        </div>

        {/* The bottom padding accounts for the home indicator, so the last row
            of a list is never sitting underneath it. */}
        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.5rem)' }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
