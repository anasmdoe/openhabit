import React, { useState } from 'react';
import {
  MonthTrendPanel, MonthlyCompletionPanel, StreaksPanel, CategoryPanel,
} from './StatsPanels';
import { InsightsPanel } from './InsightsPanel';
import { RecapPanel } from './Recap';
import { AllCalendar } from './AllCalendar';
import { YearPixels } from './YearPixels';
import { GoalsPanel } from './GoalsPanel';
import { PatternsPanel } from './PatternsPanel';

const KEY = 'openhabit.statsLayout';

interface Section { id: string; title: string; render: () => React.ReactNode }

const SECTIONS: Section[] = [
  { id: 'recap', title: 'Recap', render: () => <RecapPanel /> },
  { id: 'goals', title: 'Goals', render: () => <GoalsPanel /> },
  { id: 'month', title: 'This month, day by day', render: () => <MonthTrendPanel /> },
  {
    id: 'breakdown', title: 'Monthly completion and streaks',
    render: () => (
      <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
        <MonthlyCompletionPanel />
        <StreaksPanel />
      </div>
    ),
  },
  { id: 'category', title: 'By category', render: () => <CategoryPanel /> },
  { id: 'calendar', title: 'Calendar', render: () => <AllCalendar /> },
  { id: 'pixels', title: 'Year in pixels', render: () => <YearPixels /> },
  { id: 'insights', title: 'Insights', render: () => <InsightsPanel /> },
  { id: 'patterns', title: 'Patterns', render: () => <PatternsPanel /> },
];

interface Layout { order: string[]; hidden: string[] }

function load(): Layout {
  const ids = SECTIONS.map((s) => s.id);
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    const saved: string[] = Array.isArray(raw.order) ? raw.order.filter((id: string) => ids.includes(id)) : [];
    // sections added in a later version appear at the end rather than vanishing
    return {
      order: [...saved, ...ids.filter((id) => !saved.includes(id))],
      hidden: Array.isArray(raw.hidden) ? raw.hidden.filter((id: string) => ids.includes(id)) : [],
    };
  } catch {
    return { order: ids, hidden: [] };
  }
}

// The Stats page. Sections can be hidden and reordered ("Customize"); the choice is kept on this device.
export function StatsView() {
  const [layout, setLayout] = useState<Layout>(load);
  const [editing, setEditing] = useState(false);
  const save = (next: Layout) => {
    setLayout(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode */ }
  };
  const move = (id: string, by: -1 | 1) => {
    const i = layout.order.indexOf(id);
    const j = i + by;
    if (j < 0 || j >= layout.order.length) return;
    const order = [...layout.order];
    [order[i], order[j]] = [order[j], order[i]];
    save({ ...layout, order });
  };
  const toggle = (id: string) =>
    save({ ...layout, hidden: layout.hidden.includes(id) ? layout.hidden.filter((x) => x !== id) : [...layout.hidden, id] });
  const reset = () => save({ order: SECTIONS.map((s) => s.id), hidden: [] });

  const byId = new Map(SECTIONS.map((s) => [s.id, s]));
  return (
    <>
      <div className="flex items-center justify-end gap-2 -mb-1">
        {editing && (layout.hidden.length > 0 || layout.order.join() !== SECTIONS.map((s) => s.id).join()) && (
          <button onClick={reset} className="text-[11px] text-ink-soft hover:text-ink px-2 py-1">Reset</button>
        )}
        <button
          onClick={() => setEditing(!editing)}
          aria-pressed={editing}
          className={`text-[11px] font-medium rounded-lg px-2.5 py-1 border ${editing ? 'border-mint/60 bg-mint/12 text-ink' : 'border-line text-ink-soft hover:text-ink'}`}
        >
          {editing ? 'Done' : 'Customize'}
        </button>
      </div>
      {layout.order.map((id, i) => {
        const sec = byId.get(id)!;
        const hidden = layout.hidden.includes(id);
        if (hidden && !editing) return null;
        return (
          <div key={id} className="flex flex-col gap-1.5">
            {editing && (
              <div className="flex items-center gap-1.5 rounded-lg bg-forest-850 px-2 py-1">
                <span className="text-[11.5px] font-semibold flex-1 truncate">{sec.title}</span>
                <button onClick={() => move(id, -1)} disabled={i === 0} aria-label={`Move ${sec.title} up`}
                  className="w-7 h-7 grid place-items-center rounded-md hover:bg-forest-800 disabled:opacity-30">▲</button>
                <button onClick={() => move(id, 1)} disabled={i === layout.order.length - 1} aria-label={`Move ${sec.title} down`}
                  className="w-7 h-7 grid place-items-center rounded-md hover:bg-forest-800 disabled:opacity-30">▼</button>
                <button onClick={() => toggle(id)} aria-pressed={!hidden}
                  className={`text-[11px] font-semibold rounded-md px-2.5 h-7 ${hidden ? 'border border-line text-ink-soft' : 'bg-mint text-forest-950'}`}>
                  {hidden ? 'Show' : 'Shown'}
                </button>
              </div>
            )}
            <div className={hidden ? 'opacity-35 pointer-events-none' : ''} aria-hidden={hidden || undefined}>{sec.render()}</div>
          </div>
        );
      })}
    </>
  );
}
