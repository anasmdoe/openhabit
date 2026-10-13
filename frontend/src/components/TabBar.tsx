import React from 'react';
import { useApp } from '../store';
import type { AppView } from '../store';

const ICONS: Record<AppView | 'groups', React.ReactNode> = {
  today: <><circle cx="12" cy="12" r="8.5" /><path d="M8.2 12.4l2.7 2.7 4.9-5.6" strokeLinecap="round" strokeLinejoin="round" /></>,
  habits: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M4 9.5h16M9.5 4v16" /></>,
  stats: <><path d="M5 20V11M12 20V5M19 20v-6" strokeLinecap="round" /></>,
  groups: <><circle cx="9" cy="9" r="3" /><path d="M3.5 19c.6-3 2.7-4.5 5.5-4.5s4.9 1.5 5.5 4.5" strokeLinecap="round" /><path d="M16 6.4a3 3 0 0 1 0 5.2M17.5 14.7c1.7.5 2.7 1.9 3 4.3" strokeLinecap="round" /></>,
};

// Phone-only bottom navigation. Today, Habits and Stats switch what the page
// shows; Groups opens the groups sheet (API mode only).
export function TabBar({ dimmed = false }: { dimmed?: boolean }) {
  const { view, goView, adapter } = useApp();
  const tabs: { id: AppView; label: string }[] = [
    { id: 'today', label: 'Today' },
    { id: 'habits', label: 'Habits' },
    { id: 'stats', label: 'Stats' },
    ...(adapter?.mode === 'api' ? [{ id: 'groups' as const, label: 'Groups' }] : []),
  ];
  return (
    <nav
      className={`sm:hidden fixed bottom-0 inset-x-0 z-30 border-t border-line bg-panel/95 backdrop-blur-sm flex ${dimmed ? 'app-blur' : ''}`}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Main"
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => goView(t.id)}
          aria-current={view === t.id ? 'page' : undefined}
          className={`flex-1 flex flex-col items-center gap-0.5 pt-2 pb-1.5 text-[10.5px] font-medium transition-colors ${
            view === t.id ? 'text-mint' : 'text-ink-soft'
          }`}
        >
          <svg viewBox="0 0 24 24" className="w-[22px] h-[22px]" fill="none" stroke="currentColor"
            strokeWidth={view === t.id ? 2 : 1.7}>
            {ICONS[t.id]}
          </svg>
          {t.label}
        </button>
      ))}
    </nav>
  );
}
