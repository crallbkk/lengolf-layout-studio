'use client';

import { useLayoutStore } from '@/store/useLayoutStore';

import CatalogSection from './CatalogSection';
import ObjectInspector from './ObjectInspector';
import ObjectList from './ObjectList';
import SettingsSection from './SettingsSection';

/**
 * The properties column. On desktop it is a fixed-width column beside the
 * canvas that scrolls independently of it; below md it fills the width of the
 * bottom sheet that carries it and lets that sheet own the scrolling, because
 * nesting a second scroller inside one you can also drag to dismiss makes it
 * ambiguous which of the two a flick belongs to.
 */
export default function SidePanel() {
  const objectCount = useLayoutStore((s) => s.objects.length);
  const selectedCount = useLayoutStore((s) => s.selectedIds.length);

  return (
    <aside
      aria-label="Layout controls"
      className="flex w-full shrink-0 flex-col overscroll-contain bg-slate-50 text-slate-900 md:h-full md:w-80 md:overflow-y-auto md:border-l md:border-slate-200"
    >
      {/* Redundant on mobile: the sheet is already titled, and the counts are
          on the bar chip that opened it. */}
      <header className="sticky top-0 z-10 hidden border-b border-slate-200 bg-white px-3 py-2 md:block">
        <h1 className="text-xs font-semibold tracking-tight text-slate-800">
          Floor plan
        </h1>
        <p className="text-[10px] tabular-nums text-slate-500">
          {objectCount} object{objectCount === 1 ? '' : 's'}
          {selectedCount > 0 && `, ${selectedCount} selected`}
        </p>
      </header>

      <ObjectInspector />
      <CatalogSection />
      <ObjectList />
      <SettingsSection />

      <div className="h-6 shrink-0" />
    </aside>
  );
}
