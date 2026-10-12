import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useApp, today } from '../store';
import { HabitIcon } from '../lib/icons';
import { dow, isCompleted, isFixedDay, isSkip } from '../lib/stats';
import type { Habit } from '../lib/types';

// A horizontal strip of what's due today — big tap targets, instant feedback.
export function TodayFocus() {
  const { habits, entries, toggleEntry, setNumericEntry } = useApp();
  const t = today();

  const lookup = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of entries) if (e.date === t) m.set(e.habitId, e.value);
    return m;
  }, [entries, t]);

  const due = useMemo(
    () => habits.filter((h) => (isFixedDay(h) ? h.activeDays.includes(dow(t)) : true)),
    [habits, t]
  );

  if (!due.length) return null;

  const doneOrSkipped = (h: Habit) => {
    const v = lookup.get(h.id);
    return isCompleted(h, v) || isSkip(v);
  };
  const doneCount = due.filter(doneOrSkipped).length;
  const allDone = doneCount === due.length;

  return (
    <section className="panel">
      <div className="panel-head">
        Today
        <span className="num normal-case tracking-normal font-medium">
          {doneCount}/{due.length}
        </span>
      </div>
      {allDone ? (
        <div className="px-4 pb-3.5 pt-1 flex items-center gap-2.5">
          <span className="w-7 h-7 rounded-full bg-mint grid place-items-center pop">
            <svg viewBox="0 0 14 14" className="w-3.5 h-3.5">
              <path d="M3 7.5l2.5 2.5L11 4" fill="none" stroke="rgb(var(--forest-950))"
                strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <div>
            <div className="text-[13px] font-semibold">All clear.</div>
            <div className="text-[11px] text-ink-soft">Every habit for today is done — see you tomorrow.</div>
          </div>
        </div>
      ) : (
        <div className="px-3 pb-3 pt-0.5 flex gap-2 overflow-x-auto thin-scroll">
          {due.map((h) => (
            <TodayChip
              key={h.id}
              habit={h}
              value={lookup.get(h.id)}
              onToggle={() => { navigator.vibrate?.(8); toggleEntry(h, t); }}
              onSetValue={(v) => setNumericEntry(h, t, v)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function TodayChip({ habit, value, onToggle, onSetValue }: {
  habit: Habit;
  value: number | undefined;
  onToggle: () => void;
  onSetValue: (v: number | null) => void;
}) {
  const done = isCompleted(habit, value);
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (editing) {
      setDraft(value?.toString() ?? '');
      setTimeout(() => inputRef.current?.select(), 10);
    }
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = () => {
    setEditing(false);
    if (draft.trim() === '') return onSetValue(null);
    const v = parseFloat(draft);
    if (!Number.isNaN(v) && v >= 0) onSetValue(v);
  };

  const base = `shrink-0 flex items-center gap-2 rounded-xl border px-3 h-11 text-[13px] font-medium transition-colors ${
    done
      ? 'border-mint/60 bg-mint/12 text-ink'
      : 'border-line hover:bg-forest-850 text-ink'
  }`;

  if (habit.type === 'boolean') {
    return (
      <button onClick={onToggle} className={base} aria-pressed={done}>
        <Check done={done} color={habit.color} />
        {habit.icon && <HabitIcon name={habit.icon} color={habit.color} size={14} />}
        <span className="max-w-[140px] truncate">{habit.name}</span>
      </button>
    );
  }

  if (editing) {
    return (
      <div className={`${base} pr-1.5`}>
        {habit.icon && <HabitIcon name={habit.icon} color={habit.color} size={14} />}
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
          className="num w-16 bg-forest-800 rounded-md text-center text-[12px] outline-none h-7"
          aria-label={`${habit.name} value`}
        />
        <span className="text-[10px] text-ink-soft">{habit.unit}</span>
      </div>
    );
  }

  return (
    <button onClick={() => setEditing(true)} className={base}>
      <Check done={done} color={habit.color} />
      {habit.icon && <HabitIcon name={habit.icon} color={habit.color} size={14} />}
      <span className="max-w-[140px] truncate">{habit.name}</span>
      <span className={`num text-[11px] ${done ? 'text-mint' : 'text-ink-soft'}`}>
        {value != null ? `${value}/${habit.target}` : `0/${habit.target}`}
        {habit.unit ? ` ${habit.unit}` : ''}
      </span>
    </button>
  );
}

function Check({ done, color }: { done: boolean; color: string }) {
  return (
    <span
      key={String(done)}
      className={`w-5 h-5 rounded-full grid place-items-center shrink-0 ${done ? 'pop bg-mint' : 'border border-line'}`}
    >
      {done && (
        <svg viewBox="0 0 14 14" className="w-3 h-3">
          <path d="M3 7.5l2.5 2.5L11 4" fill="none" stroke="rgb(var(--forest-950))"
            strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}
