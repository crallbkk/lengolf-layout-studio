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
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // The plan canvas also listens for Escape on window, where it clears
        // the selection. Dismissing the sheet should not also do that.
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // Move focus into the sheet so the next Tab lands inside it and a screen
  // reader announces what just opened.
  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  const onHandleDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    dragStartY.current = e.clientY;
    setDragDy(0);
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onHandleMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (dragDy === null) return;
      setDragDy(e.clientY - dragStartY.current);
    },
    [dragDy],
  );

  const onHandleUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const dy = dragDy;
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
      <button
        type="button"
        aria-label={`Close ${title}`}
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/25"
      />

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
