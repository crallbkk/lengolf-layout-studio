'use client';

import { useEffect } from 'react';

import FloorPlanCanvas from '@/components/canvas/FloorPlanCanvas';
import SidePanel from '@/components/panel/SidePanel';
import StatsBar from '@/components/StatsBar';
import Toolbar from '@/components/Toolbar';
import View3D from '@/components/View3D';
import WarningsPanel from '@/components/WarningsPanel';
import { useLayoutStore } from '@/store/useLayoutStore';
import { useViewStore } from '@/store/useViewStore';

export default function Page() {
  const hydrated = useLayoutStore((s) => s.hydrated);
  const hydrate = useLayoutStore((s) => s.hydrate);
  const mode = useViewStore((s) => s.mode);
  const hydrateView = useViewStore((s) => s.hydrateView);

  /**
   * The layout lives in localStorage / the URL hash, neither of which exists on
   * the server. Rendering the real tree only after hydration keeps the server
   * and first client pass identical and avoids a hydration mismatch.
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
      <StatsBar />
      <div className="flex min-h-0 flex-1">
        {/* Only one view is mounted at a time: a hidden WebGL canvas still
            costs a GPU context, and the plan canvas re-fits on mount anyway. */}
        <div className="relative min-w-0 flex-1">
          {mode === '3d' ? <View3D /> : <FloorPlanCanvas />}
        </div>
        <aside className="flex w-80 min-h-0 shrink-0 flex-col border-l border-[var(--border)] bg-[var(--panel)]">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <SidePanel />
          </div>
          <div className="shrink-0 border-t border-[var(--border)]">
            <WarningsPanel />
          </div>
        </aside>
      </div>
    </main>
  );
}
