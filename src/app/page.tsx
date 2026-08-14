'use client';

import { useEffect, useState } from 'react';

import FloorPlanCanvas from '@/components/canvas/FloorPlanCanvas';
import BottomSheet from '@/components/mobile/BottomSheet';
import MobileBottomBar, {
  type MobileSheet,
} from '@/components/mobile/MobileBottomBar';
import SidePanel from '@/components/panel/SidePanel';
import StatsBar from '@/components/StatsBar';
import Toolbar from '@/components/Toolbar';
import View3D from '@/components/View3D';
import WarningsPanel from '@/components/WarningsPanel';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { useLayoutStore } from '@/store/useLayoutStore';
import { useViewStore } from '@/store/useViewStore';

export default function Page() {
  const hydrated = useLayoutStore((s) => s.hydrated);
  const hydrate = useLayoutStore((s) => s.hydrate);
  const mode = useViewStore((s) => s.mode);
  const hydrateView = useViewStore((s) => s.hydrateView);

  const isMobile = useIsMobile();
  const [sheet, setSheet] = useState<MobileSheet>('none');

  /**
   * The layout lives in localStorage / the URL hash, neither of which exists on
   * the server. Rendering the real tree only after hydration keeps the server
   * and first client pass identical and avoids a hydration mismatch. It is also
   * what makes `useIsMobile` safe to branch on: by the time anything below runs,
   * this is a client-only render.
   */
  useEffect(() => {
    hydrate();
    hydrateView();
  }, [hydrate, hydrateView]);

  if (!hydrated) {
    return (
      <main className="flex h-full items-center justify-center bg-[var(--background)]">
        <p className="text-sm text-[var(--muted)]">Loading layout…</p>
      </main>
    );
  }

  return (
    <main className="flex h-full flex-col bg-[var(--background)]">
      <Toolbar />

      {/* On a phone the stats row is a chip in the bottom bar that opens the
          same component in a sheet; seven tiles is most of a 812px screen. */}
      {isMobile ? null : <StatsBar />}

      <div className="flex min-h-0 flex-1">
        {/* Only one view is mounted at a time: a hidden WebGL canvas still
            costs a GPU context, and the plan canvas re-fits on mount anyway. */}
        <div className="relative min-w-0 flex-1">
          {mode === '3d' ? <View3D /> : <FloorPlanCanvas />}
        </div>

        {isMobile ? null : (
          <aside className="flex w-80 min-h-0 shrink-0 flex-col border-l border-[var(--border)] bg-[var(--panel)]">
            <div className="min-h-0 flex-1 overflow-y-auto">
              <SidePanel />
            </div>
            <div className="shrink-0 border-t border-[var(--border)]">
              <WarningsPanel />
            </div>
          </aside>
        )}
      </div>

      {/* The 3D view carries its own HUD and bottom sheet, and its controls are
          not the plan's. Stacking a second bar under it would leave a phone with
          two competing sheets and almost no model. */}
      {isMobile && mode === '2d' ? (
        <>
          <MobileBottomBar onOpen={setSheet} />

          <BottomSheet
            open={sheet === 'objects'}
            onClose={() => setSheet('none')}
            title="Objects"
            initialSnap="full"
          >
            <SidePanel />
          </BottomSheet>

          <BottomSheet
            open={sheet === 'stats'}
            onClose={() => setSheet('none')}
            title="Statistics"
          >
            <StatsBar />
          </BottomSheet>

          <BottomSheet
            open={sheet === 'warnings'}
            onClose={() => setSheet('none')}
            title="Warnings"
          >
            <WarningsPanel headless />
          </BottomSheet>
        </>
      ) : null}
    </main>
  );
}
