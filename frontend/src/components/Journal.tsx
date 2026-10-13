import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../store';
import { HabitIcon } from '../lib/icons';
import { addDays, isSkip, todayISO } from '../lib/stats';
import { MONTH_NAMES } from '../lib/types';
import type { Entry } from '../lib/types';
import { useModalOpen } from '../lib/modal';

// The journal: every note you've written, newest first. Notes already exist on
// entries — this is simply the reading surface for them.
export function JournalModal() {
  const { journalOpen, closeJournal, adapter, habits } = useApp();
  const [entries, setEntries] = useState<Entry[] | null>(null);

  useEffect(() => {
    if (!journalOpen || !adapter) return;
    setEntries(null);
    const today = todayISO();
    adapter
      .getEntries(addDays(today, -365), today)
      .then((all) => setEntries(all.filter((e) => e.notes && e.notes.trim())))
      .catch(() => setEntries([]));
  }, [journalOpen, adapter]);

  const byId = useMemo(() => new Map(habits.map((h) => [h.id, h])), [habits]);

  const groups = useMemo(() => {
    if (!entries) return [];
    const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));
    const out: { date: string; items: Entry[] }[] = [];
    for (const e of sorted) {
      const last = out[out.length - 1];
      if (last && last.date === e.date) last.items.push(e);
      else out.push({ date: e.date, items: [e] });
    }
    return out;
  }, [entries]);

  useModalOpen(journalOpen, closeJournal);
  if (!journalOpen) return null;

  const fmt = (d: string) =>
    `${+d.slice(8, 10)} ${MONTH_NAMES[+d.slice(5, 7) - 1].slice(0, 3)} ${d.slice(0, 4)}`;

  return (
    <div className="backdrop grid place-items-center p-4" onClick={closeJournal}
      role="dialog" aria-modal="true" aria-label="Journal">
      <div className="panel w-full max-w-lg modal-scroll thin-scroll"
        onClick={(e) => e.stopPropagation()}>
        <div className="panel-head sticky top-0 bg-panel z-10">
          Journal
          <button onClick={closeJournal} className="normal-case font-semibold hover:text-ink" aria-label="Close">✕</button>
        </div>

        <div className="px-4 pb-4">
          {entries === null && <div className="shimmer h-32 w-full mt-2" />}

          {entries !== null && !groups.length && (
            <p className="text-[12px] text-ink-soft py-8 text-center">
              No notes yet. Right-click (or long-press) any cell in the grid to jot one —
              they'll all collect here.
            </p>
          )}

          {groups.map((g) => (
            <div key={g.date} className="mt-4 first:mt-3">
              <div className="text-[10px] uppercase tracking-[0.14em] text-ink-soft mb-1.5">
                {fmt(g.date)}
              </div>
              <div className="flex flex-col gap-2">
                {g.items.map((e) => {
                  const h = byId.get(e.habitId);
                  return (
                    <div key={`${e.habitId}|${e.date}`} className="flex gap-2.5">
                      <span className="mt-0.5 shrink-0">
                        {h?.icon
                          ? <HabitIcon name={h.icon} color={h.color} size={14} />
                          : <span className="inline-block w-2.5 h-2.5 rounded-full"
                              style={{ background: h?.color ?? 'rgb(var(--forest-700))' }} />}
                      </span>
                      <div className="min-w-0">
                        <span className="text-[11px] font-semibold">
                          {h?.name ?? 'Deleted habit'}
                        </span>
                        <span className="text-[10.5px] text-ink-soft ml-1.5">
                          {isSkip(e.value) ? 'skipped' : h?.type === 'numeric' ? `${e.value}${h.unit ? ` ${h.unit}` : ''}` : 'done'}
                        </span>
                        <p className="text-[12.5px] leading-snug text-ink whitespace-pre-wrap">{e.notes}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
