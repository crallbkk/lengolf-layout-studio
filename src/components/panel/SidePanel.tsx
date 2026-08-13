'use client';

import { useLayoutStore } from '@/store/useLayoutStore';

import CatalogSection from './CatalogSection';
import ObjectInspector from './ObjectInspector';
import ObjectList from './ObjectList';
import SettingsSection from './SettingsSection';

/**
 * Fixed-width properties column. Sits in a flex row beside the canvas and
 * scrolls independently of it.
 */
export default function SidePanel() {
  const objectCount = useLayoutStore((s) => s.objects.length);
  const selectedCount = useLayoutStore((s) => s.selectedIds.length);

  return (
    <aside
      aria-label="Layout controls"
      className="flex h-full w-80 shrink-0 flex-col overflow-y-auto overscroll-contain border-l border-slate-200 bg-slate-50 text-slate-900"
    >
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white px-3 py-2">
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
