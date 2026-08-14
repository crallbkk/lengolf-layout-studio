'use client';

import { useState } from 'react';

import BottomSheet from '@/components/mobile/BottomSheet';
import MobileBottomBar, {
  type MobileSheet,
} from '@/components/mobile/MobileBottomBar';
import SidePanel from '@/components/panel/SidePanel';
import StatsBar from '@/components/StatsBar';
import WarningsPanel from '@/components/WarningsPanel';

/**
 * The phone's whole bottom-of-screen surface: the summary bar and the three
 * sheets it opens.
 *
 * Which sheet is open lives here rather than in `Page` so that it dies with the
 * surface. `Page` renders this only while the viewport is narrow and the plan
 * view is showing; rotating a phone into landscape, or switching to 3D, unmounts
 * it and the open sheet is forgotten. Held one level up, the state survived —
 * and the sheet silently reappeared over the canvas on the way back, having
 * never been asked for.
 */
export default function MobilePanels() {
  const [sheet, setSheet] = useState<MobileSheet>('none');
  const close = () => setSheet('none');

  return (
    <>
      <MobileBottomBar onOpen={setSheet} />

      <BottomSheet
        open={sheet === 'objects'}
        onClose={close}
        title="Objects"
        initialSnap="full"
      >
        <SidePanel />
      </BottomSheet>

      <BottomSheet open={sheet === 'stats'} onClose={close} title="Statistics">
        <StatsBar />
      </BottomSheet>

      <BottomSheet open={sheet === 'warnings'} onClose={close} title="Warnings">
        {/* Closing on a pick is the whole point of the pick: selecting the
            implicated objects is meaningless while a sheet at 52dvh is sitting
            on top of the plan they are selected in. */}
        <WarningsPanel headless onSelect={close} />
      </BottomSheet>
    </>
  );
}
