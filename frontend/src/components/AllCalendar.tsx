import React, { useEffect, useMemo, useState } from 'react';
import { useApp, today } from '../store';
import { HabitIcon } from '../lib/icons';
import { addDays, dow, isCompleted, isFixedDay, isQuit, isSkip, monthRange } from '../lib/stats';
import { entryLookup, periodStats } from '../lib/periodStats';
import { DAY_LETTERS, MONTH_NAMES } from '../lib/types';
import type { Entry, Habit } from '../lib/types';

type Status = 'done' | 'missed' | 'skipped' | 'slipped' | 'open';

function statusOf(h: Habit, v: number | undefined, date: string, t: string): Status | null {
  if (date < h.createdAt.slice(0, 10)) return null;            // before the habit existed
  if (!isQuit(h) && isFixedDay(h) && !h.activeDays.includes(dow(date))) return null;
  if (isSkip(v)) return 'skipped';
  if (isQuit(h)) return v != null && v >= 1 ? 'slipped' : 'done';
  if (isCompleted(h, v)) return 'done';
  if (date >= t || !isFixedDay(h)) return 'open';              // today, and "N per week" days, are not misses
  return 'missed';
}

// Every habit on one calendar. Each day is tinted by how much of it you completed;
// tap a day to see what was done, skipped, or missed.
export function AllCalendar() {
  const { adapter, habits } = useApp();
  const t = today();
  const [cursor, setCursor] = useState(() => ({ y: +t.slice(0, 4), m: +t.slice(5, 7) }));
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<string | null>(t);
  const { start, end, daysInMonth } = monthRange(cursor.y, cursor.m);

  useEffect(() => {
    if (!adapter) return;
    let live = true;
    setLoading(true);
    adapter.getEntries(start, end)
      .then((rows) => { if (live) { setEntries(rows); setLoading(false); } })
      .catch(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [adapter, start, end, habits]);

  const lookup = useMemo(() => entryLookup(entries), [entries]);
  const notes = useMemo(() => new Map(entries.filter((e) => e.notes).map((e) => [`${e.habitId}|${e.date}`, e.notes!])), [entries]);
  const perDay = useMemo(() => {
    const p = periodStats(habits, lookup, start, end, t);
    return new Map(p.days.map((d) => [d.date, d]));
  }, [habits, lookup, start, end, t]);

  const lead = (new Date(`${start}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday-first grid
  const isNow = cursor.y === +t.slice(0, 4) && cursor.m === +t.slice(5, 7);
  const shift = (n: number) => {
    const d = new Date(Date.UTC(cursor.y, cursor.m - 1 + n, 1));
    setCursor({ y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 });
    setPicked(null);
  };
  const detail = picked
    ? habits.map((h) => ({ h, s: statusOf(h, lookup.get(`${h.id}|${picked}`), picked, t), v: lookup.get(`${h.id}|${picked}`) })).filter((x) => x.s)
    : [];

  if (!habits.length) return null;
  return (
    <section className="panel">
      <div className="panel-head">
        Calendar
        <span className="flex items-center gap-1 normal-case tracking-normal font-medium">
          <button onClick={() => shift(-1)} aria-label="Previous month" className="w-6 h-6 grid place-items-center rounded-md hover:bg-forest-850">‹</button>
          <span className="w-24 text-center">{MONTH_NAMES[cursor.m - 1]} {cursor.y}</span>
          <button onClick={() => shift(1)} disabled={isNow} aria-label="Next month" className="w-6 h-6 grid place-items-center rounded-md hover:bg-forest-850 disabled:opacity-30">›</button>
        </span>
      </div>
      <div className={`px-4 pb-3 transition-opacity ${loading ? 'opacity-50' : ''}`}>
        <div className="grid grid-cols-7 gap-1 text-center text-[9.5px] text-ink-soft mb-1">
          {[1, 2, 3, 4, 5, 6, 0].map((d) => <span key={d}>{DAY_LETTERS[d]}</span>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: lead }, (_, i) => <span key={`l${i}`} />)}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const date = addDays(start, i);
            const d = perDay.get(date);
            const future = date > t;
            const pct = d && d.goal ? d.done / d.goal : null;
            return (
              <button
                key={date}
                onClick={() => setPicked(date === picked ? null : date)}
                disabled={future}
                aria-label={`${date}${pct === null ? '' : `, ${Math.round(pct * 100)}% done`}`}
                aria-pressed={date === picked}
                className={`aspect-square rounded-md grid place-items-center text-[11px] num ${date === t ? 'ring-1 ring-ink' : ''} ${date === picked ? 'outline outline-2 outline-mint' : ''} ${future ? 'opacity-30' : ''}`}
                style={{
                  background: pct === null ? 'rgb(var(--forest-850))' : `rgb(var(--mint) / ${0.12 + pct * 0.6})`,
                  color: pct !== null && pct > 0.6 ? 'rgb(var(--forest-950))' : undefined,
                }}
              >
                {i + 1}
              </button>
            );
          })}
        </div>

        {picked && (
          <div className="mt-3 border-t border-line pt-2.5">
            <div className="text-[11px] font-semibold mb-1.5">
              {+picked.slice(8, 10)} {MONTH_NAMES[+picked.slice(5, 7) - 1]}
              {d_total(perDay.get(picked)) && <span className="ml-2 font-normal text-ink-soft num">{d_total(perDay.get(picked))}</span>}
            </div>
            {detail.length === 0 ? (
              <p className="text-[12px] text-ink-soft">No habits were scheduled this day.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {detail.map(({ h, s, v }) => (
                  <li key={h.id} className="flex items-center gap-2 text-[12.5px]">
                    <span className={`w-4 text-center ${s === 'done' ? 'text-mint' : s === 'slipped' ? 'text-[rgb(var(--slip))]' : 'text-ink-soft'}`} aria-hidden>
                      {s === 'done' ? '✓' : s === 'slipped' ? '✕' : s === 'skipped' ? '»' : s === 'missed' ? '·' : '○'}
                    </span>
                    {h.icon && <HabitIcon name={h.icon} color={h.color} size={13} className="shrink-0" />}
                    <span className={`truncate ${s === 'missed' || s === 'open' ? 'text-ink-soft' : ''}`}>{h.name}</span>
                    <span className="ml-auto text-[11px] text-ink-soft num shrink-0">
                      {s === 'skipped' ? 'skipped' : s === 'slipped' ? 'slipped' : s === 'missed' ? 'missed'
                        : h.type === 'numeric' && v != null && v >= 0 ? `${v}${h.unit ? ` ${h.unit}` : ''}` : ''}
                    </span>
                    {notes.get(`${h.id}|${picked}`) && <span className="text-[10px] text-ink-soft truncate max-w-[40%]" title={notes.get(`${h.id}|${picked}`)}>“{notes.get(`${h.id}|${picked}`)}”</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

const d_total = (d?: { goal: number; done: number }) => (d && d.goal ? `${d.done} of ${d.goal} done` : '');
