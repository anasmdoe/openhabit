import { createPortal } from 'react-dom';
import React, { useCallback, useEffect, useState } from 'react';
import { useApp, today } from '../store';
import type { GoalStatus, GoalView } from '../lib/types';
import { useModalOpen } from '../lib/modal';
import { addDays } from '../lib/stats';

const STATUS: Record<GoalStatus, { label: string; cls: string }> = {
  done: { label: 'Done', cls: 'text-mint' },
  ahead: { label: 'Ahead', cls: 'text-mint' },
  on_track: { label: 'On track', cls: 'text-mint' },
  behind: { label: 'Behind', cls: 'text-amber-400' },
  missed: { label: 'Missed', cls: 'text-rose-400' },
  upcoming: { label: 'Starts soon', cls: 'text-ink-soft' },
};

export function GoalsPanel() {
  const { adapter, habits } = useApp();
  const [goals, setGoals] = useState<GoalView[] | null>(null);
  const [editing, setEditing] = useState<GoalView | 'new' | null>(null);

  const load = useCallback(async () => {
    if (!adapter) return;
    try { setGoals(await adapter.listGoals()); } catch { setGoals((g) => g ?? []); }
  }, [adapter]);
  useEffect(() => { void load(); }, [load, habits]);

  if (!habits.length) return null;
  const active = habits.filter((h) => !h.archived && h.kind !== 'quit');

  return (
    <section className="panel">
      <div className="panel-head">
        Goals
        {active.length > 0 && (
          <button className="text-[11px] normal-case tracking-normal font-medium text-mint" onClick={() => setEditing('new')}>
            + New goal
          </button>
        )}
      </div>
      <div className="px-4 pb-4 flex flex-col gap-3.5">
        {goals && goals.length === 0 && (
          <p className="text-[12.5px] text-ink-soft leading-snug">
            Give a habit a finish line: "Read 20 books by December", "Run 100 Km by June". OpenHabit tracks your pace and tells you what you need per day.
          </p>
        )}
        {goals?.map((g) => <GoalRow key={g.id} g={g} onEdit={() => setEditing(g)} />)}
      </div>
      {editing && (
        <GoalDialog goal={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />
      )}
    </section>
  );
}

function GoalRow({ g, onEdit }: { g: GoalView; onEdit: () => void }) {
  const st = STATUS[g.status];
  const unit = g.measure === 'sum' ? ` ${g.unit}` : g.unit ? ` ${g.unit}` : ' days';
  return (
    <button onClick={onEdit} className="text-left flex flex-col gap-1.5" aria-label={`Goal ${g.title}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13.5px] font-semibold text-ink truncate">{g.title}</span>
        <span className={`text-[11px] font-semibold ${st.cls}`}>{st.label}</span>
      </div>
      <div className="relative h-2 rounded-full bg-line overflow-hidden" role="progressbar" aria-valuenow={g.pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, g.pct)}%`, background: g.habit.color }} />
        {g.status !== 'done' && g.elapsedPct > 0 && g.elapsedPct < 100 && (
          <div className="absolute inset-y-0 w-0.5 bg-ink/60" style={{ left: `${g.elapsedPct}%` }} title="Where you should be by now" />
        )}
      </div>
      <div className="flex justify-between text-[11.5px] text-ink-soft num">
        <span>{g.current} / {g.target}{unit} · {g.pct}%</span>
        <span>{g.status === 'done' || g.status === 'missed' ? g.deadline : `${g.daysLeft} days left`}</span>
      </div>
      <p className="text-[12px] text-ink-soft leading-snug">{g.message}</p>
    </button>
  );
}

function GoalDialog({ goal, onClose, onSaved }: { goal: GoalView | null; onClose: () => void; onSaved: () => void }) {
  const { adapter, habits, showToast } = useApp();
  useModalOpen(true, onClose);
  const options = habits.filter((h) => !h.archived && h.kind !== 'quit');
  const [habitId, setHabitId] = useState(goal?.habitId ?? options[0]?.id ?? '');
  const habit = habits.find((h) => h.id === habitId);
  const [title, setTitle] = useState(goal?.title ?? '');
  const [target, setTarget] = useState(goal ? String(goal.target) : '');
  const [deadline, setDeadline] = useState(goal?.deadline ?? addDays(today(), 90));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const numeric = habit?.type === 'numeric';

  const save = async () => {
    if (!adapter) return;
    const t = Number(target);
    if (!title.trim() || !(t > 0)) { setErr('Give the goal a title and a target above zero.'); return; }
    setBusy(true); setErr('');
    try {
      const unit = numeric ? habit?.unit ?? '' : 'days';
      if (goal) await adapter.updateGoal(goal.id, { title: title.trim(), target: t, deadline, unit });
      else await adapter.createGoal({ habitId, title: title.trim(), target: t, deadline, unit, startDate: today() });
      onSaved();
    } catch (e) {
      setErr((e as Error).message || 'Could not save');
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!adapter || !goal) return;
    await adapter.deleteGoal(goal.id);
    showToast?.('Goal deleted');
    onSaved();
  };
  const finish = async () => {
    if (!adapter || !goal) return;
    await adapter.updateGoal(goal.id, { completed: goal.status !== 'done' });
    onSaved();
  };

  return createPortal(
    <div className="backdrop grid place-items-center p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label={goal ? 'Edit goal' : 'New goal'}>
      <div className="panel w-full max-w-md modal-scroll thin-scroll p-4 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-semibold">{goal ? 'Edit goal' : 'New goal'}</h2>
        <label className="flex flex-col gap-1 text-[12px] text-ink-soft">Habit
          <select className="input" value={habitId} disabled={!!goal} onChange={(e) => setHabitId(e.target.value)} aria-label="Goal habit">
            {options.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-ink-soft">Goal
          <input className="input" value={title} maxLength={120} placeholder="Read 20 books" onChange={(e) => setTitle(e.target.value)} aria-label="Goal title" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-[12px] text-ink-soft">{numeric ? `Target (${habit?.unit || 'total'})` : 'Target (days done)'}
            <input className="input" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Goal target" />
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-ink-soft">Deadline
            <input className="input" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} aria-label="Goal deadline" />
          </label>
        </div>
        {err && <p role="alert" className="text-[12px] text-rose-400">{err}</p>}
        <div className="flex gap-2 justify-end">
          {goal && <button className="text-[11px] uppercase tracking-wider font-semibold text-ink-soft px-3 py-1.5 text-rose-400 mr-auto" onClick={remove}>Delete</button>}
          {goal && <button className="text-[11px] uppercase tracking-wider font-semibold text-ink-soft px-3 py-1.5" onClick={finish}>{goal.status === 'done' ? 'Reopen' : 'Mark done'}</button>}
          <button className="text-[11px] uppercase tracking-wider font-semibold text-ink-soft px-3 py-1.5" onClick={onClose}>Cancel</button>
          <button className="text-[11px] uppercase tracking-wider font-bold bg-mint text-forest-950 rounded-sm px-4 py-1.5 disabled:opacity-40" disabled={busy} onClick={save}>Save</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
