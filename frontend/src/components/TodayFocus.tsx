import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useApp, today, visibleHabits } from '../store';
import { HabitIcon } from '../lib/icons';
import { addDays, dow, isCompleted, isFixedDay, isQuit, isSkip, weekKey } from '../lib/stats';
import { quickCurrentStreak } from '../lib/periods';
import type { Habit } from '../lib/types';

// What's due today: a progress ring plus one big tap target per habit
// (full-width rows on phones, wrapping chips on wider screens).
export function TodayFocus() {
  const { habits, entries, toggleEntry, setNumericEntry, categoryFilter } = useApp();
  const t = today();
  const yesterday = addDays(t, -1);

  const lookup = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of entries) m.set(`${e.habitId}|${e.date}`, e.value);
    return m;
  }, [entries]);

  const due = useMemo(
    () => visibleHabits(habits, categoryFilter)
      .filter((h) => (isFixedDay(h) ? h.activeDays.includes(dow(t)) : true)),
    [habits, categoryFilter, t]
  );

  if (!due.length) return null;

  const valueOf = (h: Habit, d = t) => lookup.get(`${h.id}|${d}`);
  const settled = (h: Habit) => isCompleted(h, valueOf(h)) || isSkip(valueOf(h));
  const doneCount = due.filter(settled).length;
  const allDone = doneCount === due.length;

  return (
    <section className="panel">
      <div className="flex items-center gap-3 px-4 pt-3 pb-2">
        <ProgressRing done={doneCount} total={due.length} />
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-panel-head-text">Today</div>
          <div className="text-[13px] font-semibold text-ink">
            {allDone ? 'All clear — see you tomorrow.' : `${due.length - doneCount} to go`}
          </div>
        </div>
      </div>
      <div className="px-3 pb-3 grid grid-cols-1 gap-1.5 sm:flex sm:flex-wrap sm:gap-2">
        {due.map((h) => {
          const missedYesterday = !isQuit(h) && isFixedDay(h) && h.activeDays.includes(dow(yesterday))
            && yesterday >= h.createdAt.slice(0, 10)
            && !isCompleted(h, valueOf(h, yesterday)) && !isSkip(valueOf(h, yesterday));
          let weekCount = 0;
          if (!isFixedDay(h)) {
            for (let d = weekKey(t); d <= t; d = addDays(d, 1)) if (isCompleted(h, valueOf(h, d))) weekCount += 1;
          }
          return (
            <TodayItem
              key={h.id}
              habit={h}
              value={valueOf(h)}
              streak={quickCurrentStreak(h, lookup)}
              missedYesterday={missedYesterday}
              weekCount={weekCount}
              onToggle={() => toggleEntry(h, t)}
              onSetValue={(v) => setNumericEntry(h, t, v)}
            />
          );
        })}
      </div>
    </section>
  );
}

function ProgressRing({ done, total }: { done: number; total: number }) {
  const r = 17;
  const c = 2 * Math.PI * r;
  const pct = total ? done / total : 0;
  return (
    <span className="relative w-11 h-11 shrink-0" role="img" aria-label={`${done} of ${total} done today`}>
      <svg viewBox="0 0 44 44" className="w-11 h-11 -rotate-90">
        <circle cx="22" cy="22" r={r} fill="none" stroke="rgb(var(--forest-800))" strokeWidth="5" />
        <circle cx="22" cy="22" r={r} fill="none" stroke="rgb(var(--mint))" strokeWidth="5"
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)}
          className="ring-fill" />
      </svg>
      <span className={`absolute inset-0 grid place-items-center num text-[11px] font-bold ${pct === 1 ? 'text-mint' : 'text-ink'}`}>
        {pct === 1 ? <CheckMark className="w-4 h-4 pop" stroke="rgb(var(--mint))" /> : `${done}/${total}`}
      </span>
    </span>
  );
}

function TodayItem({ habit, value, streak, missedYesterday, weekCount, onToggle, onSetValue }: {
  habit: Habit;
  value: number | undefined;
  streak: number;
  missedYesterday: boolean;
  weekCount: number;
  onToggle: () => void;
  onSetValue: (v: number | null) => void;
}) {
  const quit = isQuit(habit);
  const skipped = isSkip(value);
  const done = isCompleted(habit, value);
  const slipped = quit && value != null && !skipped && value >= 1;
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState('');
  // bump on every fresh completion so the burst replays
  const [burst, setBurst] = useState(0);
  const wasDone = useRef(done);
  useEffect(() => {
    if (done && !wasDone.current && !quit) setBurst((b) => b + 1);
    wasDone.current = done;
  }, [done, quit]);

  useEffect(() => {
    if (editing) {
      setDraft(value != null && !skipped ? String(value) : '');
      setTimeout(() => inputRef.current?.select(), 10);
    }
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = () => {
    setEditing(false);
    if (draft.trim() === '') return onSetValue(null);
    const v = parseFloat(draft);
    if (!Number.isNaN(v) && v >= 0) onSetValue(v);
  };

  const shell = `relative shrink-0 flex items-center gap-2.5 rounded-xl border px-3 h-12 sm:h-11 text-[13px] font-medium transition-colors ${
    slipped ? 'border-[rgb(var(--slip)/0.5)] bg-[rgb(var(--slip)/0.08)]'
    : done ? 'border-mint/50 bg-mint/10'
    : 'border-line hover:bg-forest-850'
  } text-ink`;

  const meta = (
    <span className="ml-auto sm:ml-0 flex items-center gap-1.5 shrink-0">
      {missedYesterday && !done && !skipped && (
        <span className="text-[10px] font-semibold text-amber-400 whitespace-nowrap" data-tip="Missing once is fine; missing twice starts a new pattern">
          don't miss twice
        </span>
      )}
      {!isFixedDay(habit) && (
        <span className="num text-[10px] text-ink-soft">{Math.min(weekCount, habit.frequency)}/{habit.frequency} wk</span>
      )}
      {streak >= 2 && <Flame n={streak} unit={isFixedDay(habit) ? 'd' : 'w'} color={habit.color} />}
    </span>
  );

  const name = (
    <>
      {habit.icon && <HabitIcon name={habit.icon} color={habit.color} size={15} />}
      <span className="min-w-0 truncate sm:max-w-[150px]">{habit.name}</span>
    </>
  );

  if (quit) {
    return (
      <button onClick={() => { navigator.vibrate?.(slipped ? 8 : [10, 30, 10]); onToggle(); }}
        className={shell} aria-pressed={slipped}
        aria-label={`${habit.name}: ${slipped ? 'slipped today, tap to undo' : 'clean today, tap if you slipped'}`}>
        <span className={`w-6 h-6 rounded-full grid place-items-center shrink-0 ${slipped ? 'bg-[rgb(var(--slip))]' : 'border border-mint/60'}`}>
          {slipped
            ? <svg key="x" viewBox="0 0 14 14" className="w-3 h-3 pop"><path d="M4 4l6 6M10 4l-6 6" stroke="rgb(var(--forest-950))" strokeWidth="2.2" strokeLinecap="round" /></svg>
            : <Shield />}
        </span>
        {name}
        <span className={`text-[11px] shrink-0 ${slipped ? 'text-[rgb(var(--slip))]' : 'text-ink-soft'}`}>
          {slipped ? 'slipped' : 'clean so far'}
        </span>
        {meta}
      </button>
    );
  }

  if (habit.type === 'boolean') {
    return (
      <button onClick={() => { navigator.vibrate?.(8); onToggle(); }} className={shell} aria-pressed={done}>
        <Check done={done} skipped={skipped} burst={burst} color={habit.color} />
        {name}
        {meta}
      </button>
    );
  }

  if (editing) {
    return (
      <div className={`${shell} pr-1.5`}>
        {habit.icon && <HabitIcon name={habit.icon} color={habit.color} size={15} />}
        <span className="min-w-0 truncate text-ink-soft">{habit.name}</span>
        <input
          ref={inputRef}
          autoFocus
          type="number"
          step="any"
          inputMode="decimal"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') setEditing(false);
          }}
          className="num ml-auto w-20 bg-forest-800 rounded-md text-center text-[13px] outline-none h-8"
          aria-label={`${habit.name} value`}
        />
        <span className="text-[10px] text-ink-soft">{habit.unit}</span>
      </div>
    );
  }

  // numeric: tap the label to type a value, or "+1" to count up (glasses, pages, sets…)
  const current = value != null && !skipped ? value : 0;
  const countable = habit.targetType !== 'at_most';
  return (
    <div className={`${shell} pr-1.5`}>
      <button onClick={() => setEditing(true)} className="flex items-center gap-2.5 min-w-0 flex-1 sm:flex-none h-full text-left"
        aria-label={`${habit.name}: ${current} of ${habit.target} ${habit.unit}. Tap to enter a value`}>
        <Check done={done} skipped={skipped} burst={burst} color={habit.color} />
        {name}
        <span className={`num text-[11px] shrink-0 ${done ? 'text-mint' : 'text-ink-soft'}`}>
          {current}/{habit.target}{habit.unit ? ` ${habit.unit}` : ''}
        </span>
      </button>
      {meta}
      {countable && (
        <button
          onClick={() => { navigator.vibrate?.(6); onSetValue(Math.round((current + 1) * 100) / 100); }}
          className="w-9 h-9 sm:w-8 sm:h-8 rounded-lg bg-forest-800 hover:bg-forest-700 grid place-items-center text-[12px] font-bold shrink-0 cell-btn"
          aria-label={`Add 1 ${habit.unit || ''} to ${habit.name}`}
        >
          +1
        </button>
      )}
    </div>
  );
}

function Check({ done, skipped, burst, color }: { done: boolean; skipped: boolean; burst: number; color: string }) {
  return (
    <span className="relative w-6 h-6 shrink-0">
      {burst > 0 && <span key={burst} className="burst" style={{ borderColor: color }} aria-hidden />}
      <span
        key={String(done)}
        className={`absolute inset-0 rounded-full grid place-items-center ${done ? 'pop bg-mint' : skipped ? 'border border-dashed border-line' : 'border border-line'}`}
      >
        {done && <CheckMark className="w-3 h-3" stroke="rgb(var(--forest-950))" />}
        {skipped && (
          <svg viewBox="0 0 20 20" className="w-3 h-3" aria-label="skipped">
            <path d="M5 6l4 4-4 4M11 6l4 4-4 4" fill="none" stroke="rgb(var(--ink-soft))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
    </span>
  );
}

function CheckMark({ className, stroke }: { className: string; stroke: string }) {
  return (
    <svg viewBox="0 0 14 14" className={className} aria-hidden>
      <path d="M3 7.5l2.5 2.5L11 4" fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Shield() {
  return (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" aria-hidden>
      <path d="M8 1.8l5 1.9v3.9c0 3.1-2.1 5.6-5 6.6-2.9-1-5-3.5-5-6.6V3.7z" fill="none"
        stroke="rgb(var(--mint))" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function Flame({ n, unit, color }: { n: number; unit: string; color: string }) {
  return (
    <span className="num flex items-center gap-0.5 text-[11px] font-semibold text-ink-soft" data-tip={`${n}${unit === 'd' ? '-day' : '-week'} streak`}>
      <svg viewBox="0 0 16 16" className="w-3 h-3" aria-hidden>
        <path d="M8 1.5c.4 2.3 3.8 3.9 3.8 7.4A3.8 3.8 0 0 1 8 12.8a3.8 3.8 0 0 1-3.8-3.9c0-1.6.8-2.6 1.6-3.4.1 1.1.6 1.9 1.4 2.3C7 6.2 7.3 3.6 8 1.5z"
          fill={color} />
      </svg>
      {n}{unit}
    </span>
  );
}
