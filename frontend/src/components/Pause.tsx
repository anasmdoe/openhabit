import React, { useState } from 'react';
import { useApp, today } from '../store';
import { HabitIcon } from '../lib/icons';
import { addDays, fromISO } from '../lib/stats';
import { useModalOpen } from '../lib/modal';

const MAX_DAYS = 60;

// "Take a break": vacation, illness, travel. Marks every open day in the range
// as skipped (excused), so goals shrink and streaks survive. Undo any single
// day by tapping it in the grid.
export function PauseModal() {
  const { pauseOpen, setPauseOpen, habits, pauseHabits } = useApp();
  const t = today();
  const [from, setFrom] = useState(t);
  const [to, setTo] = useState(addDays(t, 6));
  const [picked, setPicked] = useState<Set<string> | null>(null); // null = all
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<number | null>(null);

  useModalOpen(pauseOpen);
  if (!pauseOpen) return null;

  const close = () => { setPauseOpen(false); setDone(null); setPicked(null); };
  const selected = picked ?? new Set(habits.map((h) => h.id));
  const days = from && to && to >= from
    ? Math.round((fromISO(to).getTime() - fromISO(from).getTime()) / 86400000) + 1 : 0;
  const valid = days > 0 && days <= MAX_DAYS && selected.size > 0;
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setPicked(next);
  };
  const preset = (a: string, b: string) => { setFrom(a); setTo(b); };
  const satOffset = (6 - fromISO(t).getUTCDay() + 7) % 7;

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      setDone(await pauseHabits([...selected], from, to));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="backdrop grid place-items-center p-4" onClick={close} role="dialog" aria-modal="true" aria-label="Take a break">
      <div className="panel w-full max-w-md modal-scroll thin-scroll sheet-in" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head">
          Take a break
          <button onClick={close} className="normal-case font-semibold hover:text-mint" aria-label="Close">✕</button>
        </div>
        {done != null ? (
          <div className="p-4 flex flex-col gap-3">
            <p className="text-[13px] text-ink">
              {done
                ? <>Paused <span className="num font-semibold">{done}</span> habit-days. Your streaks are safe — enjoy the break.</>
                : 'Nothing to pause: every day in that range already has an entry.'}
            </p>
            <p className="text-[11px] text-ink-soft">Changed your mind about a day? Tap it in the grid to clear it.</p>
            <button onClick={close} className="self-end text-[11px] uppercase tracking-wider font-bold bg-mint text-forest-950 rounded-sm px-4 py-1.5">Done</button>
          </div>
        ) : (
          <div className="p-4 flex flex-col gap-4">
            <p className="text-[12px] text-ink-soft leading-snug">
              Travelling or sick? Paused days are excused: they leave your goals, keep your streaks,
              and silence reminders. Days you already logged are left alone.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {([
                ['Today', t, t],
                ['This weekend', addDays(t, satOffset), addDays(t, satOffset + 1)],
                ['1 week', t, addDays(t, 6)],
                ['2 weeks', t, addDays(t, 13)],
              ] as const).map(([label, a, b]) => (
                <button key={label} onClick={() => preset(a, b)}
                  className={`text-[11px] font-medium rounded-full px-3 h-7 border ${
                    from === a && to === b ? 'border-mint/60 bg-mint/12 text-ink' : 'border-line text-ink-soft hover:bg-forest-850'
                  }`}>
                  {label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-[0.14em] text-ink-soft">From</span>
                <input type="date" className="input num" value={from} min={addDays(t, -30)} onChange={(e) => setFrom(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-[0.14em] text-ink-soft">To</span>
                <input type="date" className="input num" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
              </label>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-[0.14em] text-ink-soft flex justify-between">
                Habits
                <button onClick={() => setPicked(selected.size === habits.length ? new Set() : null)}
                  className="normal-case tracking-normal hover:text-ink">
                  {selected.size === habits.length ? 'none' : 'all'}
                </button>
              </span>
              <div className="flex flex-col">
                {habits.map((h) => (
                  <label key={h.id} className="flex items-center gap-2.5 py-1.5 px-1 rounded-md hover:bg-forest-850/60 cursor-pointer">
                    <input type="checkbox" checked={selected.has(h.id)} onChange={() => toggle(h.id)}
                      className="accent-[rgb(var(--mint))] w-4 h-4" />
                    {h.icon && <HabitIcon name={h.icon} color={h.color} size={14} />}
                    <span className="text-[13px] truncate">{h.name}</span>
                    {h.category && <span className="ml-auto text-[10px] text-ink-soft">{h.category}</span>}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-line">
              <span className={`text-[11px] ${days > MAX_DAYS ? 'text-amber-400' : 'text-ink-soft'}`}>
                {days > MAX_DAYS ? `At most ${MAX_DAYS} days at a time`
                  : days > 0 ? `${selected.size} habit${selected.size === 1 ? '' : 's'} × ${days} day${days === 1 ? '' : 's'}`
                  : 'Pick an end date after the start'}
              </span>
              <button onClick={submit} disabled={!valid || busy}
                className="text-[11px] uppercase tracking-wider font-bold bg-mint text-forest-950 rounded-sm px-4 py-1.5 disabled:opacity-40">
                {busy ? 'Pausing…' : 'Pause'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
