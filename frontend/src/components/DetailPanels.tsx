import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp, today } from '../store';
import { LineChart } from '../charts';
import { shareCard } from '../lib/share';
import { DAY_LETTERS, MONTH_NAMES } from '../lib/types';
import type { Habit, HabitDetail as HabitDetailData } from '../lib/types';
import { addDays, isCompleted, isQuit, isSkip } from '../lib/stats';
import { buildCalendars } from '../lib/periods';
import {
  cleanStats, completionRates, entriesCsv, lookupFor, nextMilestone, numberStats, savingsTotal, trendSentences,
  withStart,
} from '../lib/habitInsights';
import type { DayEntry } from '../lib/habitInsights';
import { fmtValue } from '../lib/format';

// ---- this habit's entries (with notes) for the last year -------------------------------------
export function useHabitEntries(habitId: string) {
  const { adapter } = useApp();
  const [entries, setEntries] = useState<DayEntry[]>([]);
  const reload = useCallback(async () => {
    if (!adapter || !habitId) return;
    const t = today();
    const rows = await adapter.getEntries(addDays(t, -365), t).catch(() => []);
    setEntries(rows.filter((e) => e.habitId === habitId).map((e) => ({ date: e.date, value: e.value, notes: e.notes })));
  }, [adapter, habitId]);
  useEffect(() => { void reload(); }, [reload]);
  return { entries, reload };
}

const fmtDate = (d: string) => `${+d.slice(8, 10)} ${MONTH_NAMES[+d.slice(5, 7) - 1].slice(0, 3)} ${d.slice(0, 4)}`;

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-line px-3 py-2 min-w-0">
      <div className="text-[10px] uppercase tracking-[0.12em] text-ink-soft">{label}</div>
      <div className="num text-lg font-bold leading-tight truncate">{value}</div>
      {sub && <div className="text-[10px] text-ink-soft truncate">{sub}</div>}
    </div>
  );
}

// ---- summary: rates, next milestone, reminders ---------------------------------------------
export function SummaryPanel({ habit, detail, entries, color }: {
  habit: Habit; detail: HabitDetailData; entries: DayEntry[]; color: string;
}) {
  const t = today();
  const h = useMemo(() => withStart(habit, detail.habit.createdDate), [habit, detail.habit.createdDate]);
  const rates = useMemo(() => completionRates(h, lookupFor(h, entries), t), [h, entries, t]);
  const miles = nextMilestone(h, detail.currentStreak);
  const unit = detail.streakUnit === 'weeks' ? 'week' : 'day';
  const pct = (v: number | null) => (v === null ? '—' : `${v}%`);
  const times = habit.reminderTime ? habit.reminderTime.split(',') : [];
  return (
    <section className="panel">
      <div className="panel-head">
        Overview
        <span className="normal-case tracking-normal font-medium">tracking since {fmtDate(rates.since)}</span>
      </div>
      <div className="px-4 pb-4 flex flex-col gap-3">
        <div className="grid grid-cols-4 gap-2">
          <Tile label="7 days" value={pct(rates.d7)} />
          <Tile label="30 days" value={pct(rates.d30)} />
          <Tile label="90 days" value={pct(rates.d90)} />
          <Tile label="All time" value={pct(rates.all)} />
        </div>
        {miles ? (
          <div>
            <div className="flex items-baseline justify-between text-[12px] mb-1">
              <span className="font-medium">Next milestone: {miles.target}-{miles.unit} streak</span>
              <span className="text-ink-soft num">{miles.remaining} {miles.unit}{miles.remaining === 1 ? '' : 's'} to go</span>
            </div>
            <div className="h-2 rounded-full bg-forest-800 overflow-hidden" role="progressbar"
              aria-valuenow={detail.currentStreak} aria-valuemin={0} aria-valuemax={miles.target} aria-label={`Streak towards ${miles.target} ${unit}s`}>
              <div className="h-full rounded-full" style={{ width: `${Math.min(100, (detail.currentStreak / miles.target) * 100)}%`, background: color }} />
            </div>
          </div>
        ) : (
          <p className="text-[12px] text-ink-soft">Every streak milestone reached. Impressive.</p>
        )}
        {(times.length > 0 || habit.cue) && (
          <div className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-ink-soft">
            {times.map((tm) => (
              <span key={tm} className="num rounded-full border border-line px-2.5 py-0.5">⏰ {tm}</span>
            ))}
            {habit.cue && <span className="min-w-0 truncate">“{habit.cue}”</span>}
          </div>
        )}
      </div>
    </section>
  );
}

// ---- trend, weekday and mood sentences -------------------------------------------------------
export function TrendPanel({ habit, detail, entries }: { habit: Habit; detail: HabitDetailData; entries: DayEntry[] }) {
  const { insights } = useApp();
  const t = today();
  const h = useMemo(() => withStart(habit, detail.habit.createdDate), [habit, detail.habit.createdDate]);
  const lines = useMemo(() => trendSentences(h, lookupFor(h, entries), t), [h, entries, t]);
  const mood = insights?.moodImpact.find((m) => m.habitId === habit.id);
  const quit = isQuit(habit);
  return (
    <section className="panel">
      <div className="panel-head">Trend</div>
      <div className="px-4 pb-4 flex flex-col gap-2 text-[12.5px] leading-snug">
        <p>{lines.join(' ')}</p>
        {mood ? (
          <p>
            Your mood averages <span className="num font-semibold text-mint">{mood.avgMoodDone}</span> on days {quit ? 'without a slip' : 'you do it'} vs{' '}
            <span className="num font-semibold text-ink-soft">{mood.avgMoodMissed}</span> {quit ? 'when you slip' : "when you don't"}
            {mood.diff < 0 ? ' — it runs the other way here' : ''}.
          </p>
        ) : (
          <p className="text-ink-soft">
            Mood link: needs at least 5 days done and 5 missed with a mood logged{insights && insights.moodDays < 14 ? ` (${insights.moodDays} mood day${insights.moodDays === 1 ? '' : 's'} so far)` : ''}.
          </p>
        )}
      </div>
    </section>
  );
}

// ---- measurable habits -------------------------------------------------------------------------
export function NumbersPanel({ habit, entries, color }: { habit: Habit; entries: DayEntry[]; color: string }) {
  const s = useMemo(() => numberStats(habit, entries), [habit, entries]);
  const recent = useMemo(
    () => entries.filter((e) => !isSkip(e.value) && e.value >= 0).sort((a, b) => a.date.localeCompare(b.date)).slice(-30),
    [entries]);
  if (!s) return null;
  return (
    <section className="panel">
      <div className="panel-head">
        Numbers
        <span className="normal-case tracking-normal font-medium">{s.logged} days logged</span>
      </div>
      <div className="px-4 pb-4 flex flex-col gap-3">
        <div className="grid grid-cols-2 min-[420px]:grid-cols-4 gap-2">
          <Tile label="Average" value={fmtValue(habit, s.average)} sub="per logged day" />
          <Tile label={habit.targetType === 'at_most' ? 'Lowest' : 'Best day'} value={fmtValue(habit, s.best)} sub={fmtDate(s.bestDate)} />
          <Tile label="Total" value={fmtValue(habit, s.total)} />
          <Tile label="Target hit" value={s.hitRate === null ? '—' : `${s.hitRate}%`} sub={`goal ${habit.targetType === 'at_most' ? '≤' : '≥'} ${habit.target}`} />
        </div>
        {recent.length > 2 && (
          <LineChart height={80} series={[{ name: 'value', color, points: recent.map((e) => e.value) }]}
            labels={recent.map((e, i) => (i % Math.ceil(recent.length / 5) === 0 ? e.date.slice(5) : null))} />
        )}
      </div>
    </section>
  );
}

// ---- quit habits -----------------------------------------------------------------------------------
export function QuitPanel({ habit, detail, entries }: { habit: Habit; detail: HabitDetailData; entries: DayEntry[] }) {
  const t = today();
  const h = useMemo(() => withStart(habit, detail.habit.createdDate), [habit, detail.habit.createdDate]);
  const c = useMemo(() => cleanStats(h, entries, t), [h, entries, t]);
  const saved = savingsTotal(habit, c.cleanDays);
  const unit = habit.savingsUnit;
  const money = unit.length <= 1; // "$" goes in front, words go after
  const fmt = (n: number) => (money ? `${unit}${n}` : `${n} ${unit}`);
  return (
    <section className="panel">
      <div className="panel-head">Clean days</div>
      <div className="px-4 pb-4 flex flex-col gap-3">
        <div className="flex items-end gap-3">
          <span className="num text-4xl font-bold leading-none text-mint">{c.cleanDays}</span>
          <span className="text-[12px] text-ink-soft pb-1">days without a slip since you started</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Tile label="Longest run" value={`${c.longestClean} d`} />
          <Tile label="Slips" value={String(c.slips)} />
          <Tile label="Last slip" value={c.lastSlip ? fmtDate(c.lastSlip).slice(0, -5) : 'none'} />
        </div>
        {saved > 0 ? (
          <p className="text-[13px]">
            Staying clean has saved you <span className="num font-bold text-mint">{fmt(saved)}</span>
            <span className="text-ink-soft"> ({fmt(habit.savingsPerDay)} a day × {c.cleanDays}).</span>
          </p>
        ) : (
          <p className="text-[12px] text-ink-soft">Edit the habit to give a clean day a value (money, minutes, cigarettes…) and see the total grow here.</p>
        )}
      </div>
    </section>
  );
}

// ---- calendar you can edit ---------------------------------------------------------------------
export function EditableCalendar({ habit, detail, entries, color, onChanged }: {
  habit: Habit; detail: HabitDetailData; entries: DayEntry[]; color: string; onChanged: () => Promise<void>;
}) {
  const { setNumericEntry, setSkip, setNote } = useApp();
  const t = today();
  const calendars = useMemo(() => buildCalendars(detail, 3), [detail]);
  const [picked, setPicked] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [note, setNoteDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const entry = picked ? entries.find((e) => e.date === picked) : undefined;
  const quit = isQuit(habit);
  const numeric = habit.type === 'numeric';
  const skipped = isSkip(entry?.value);

  useEffect(() => {
    setDraft(entry && !skipped ? String(entry.value) : '');
    setNoteDraft(entry?.notes ?? '');
  }, [picked, entry?.value, entry?.notes]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (fn: () => Promise<unknown> | void) => {
    setBusy(true);
    try { await fn(); await onChanged(); } finally { setBusy(false); }
  };
  const state = !entry ? (quit ? 'clean' : 'none')
    : skipped ? 'skipped'
    : quit ? (entry.value >= 1 ? 'slipped' : 'clean')
    : isCompleted(habit, entry.value) ? 'done' : `${entry.value}`;
  const btn = (on: boolean) => `text-[12px] font-semibold rounded-lg px-3 h-9 border ${on ? 'border-mint/60 bg-mint/12 text-ink' : 'border-line text-ink-soft hover:text-ink'} disabled:opacity-50`;

  return (
    <section className="panel">
      <div className="panel-head">
        Calendar
        <span className="normal-case tracking-normal font-medium">tap a day to change it</span>
      </div>
      <div className="px-4 pb-3 grid grid-cols-1 min-[420px]:grid-cols-3 gap-4">
        {calendars.map((m) => (
          <div key={m.key}>
            <div className="text-[11px] font-medium text-ink-soft mb-1.5">{m.label}</div>
            <div className="grid grid-cols-7 gap-[3px]">
              {DAY_LETTERS.map((l) => <div key={l} className="text-[8px] text-ink-soft text-center">{l[0]}</div>)}
              {m.cells.map((c, i) => {
                if (!c.inMonth || !c.date) return <div key={i} />;
                const future = c.date > t;
                return (
                  <button
                    key={i}
                    disabled={future}
                    onClick={() => setPicked(c.date === picked ? null : c.date)}
                    aria-label={`${c.date}: ${c.state}`}
                    aria-pressed={c.date === picked}
                    className={`aspect-square rounded-[3px] ${c.date === picked ? 'outline outline-2 outline-ink' : ''} ${c.date === t ? 'ring-1 ring-ink' : ''}`}
                    style={{
                      background: c.state === 'done' ? color
                        : c.state === 'partial' ? `${color}55`
                        : c.state === 'miss' ? 'rgb(var(--forest-800))'
                        : c.state === 'future' ? 'transparent'
                        : 'rgb(var(--forest-850))',
                      outline: c.state === 'future' ? '1px solid rgb(var(--line))' : undefined,
                      outlineOffset: -1,
                      opacity: c.state === 'off' ? 0.55 : 1,
                    }}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {picked && (
        <div className="px-4 pb-4 pt-1 border-t border-line flex flex-col gap-2.5" aria-live="polite">
          <div className="flex items-baseline justify-between pt-2.5">
            <span className="text-[13px] font-semibold">{fmtDate(picked)}</span>
            <span className="text-[11px] text-ink-soft">{state === 'none' ? 'nothing logged' : state}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {numeric ? (
              <>
                <input
                  type="number" step="any" inputMode="decimal" value={draft} onChange={(e) => setDraft(e.target.value)}
                  className="input num w-24 h-9 py-0" aria-label={`${habit.name} value on ${picked}`}
                  placeholder={habit.unit || '0'}
                />
                <button disabled={busy || draft.trim() === '' || Number.isNaN(parseFloat(draft)) || parseFloat(draft) < 0} className={btn(false)}
                  onClick={() => act(() => setNumericEntry(habit, picked, parseFloat(draft)))}>Save</button>
              </>
            ) : quit ? (
              <>
                <button disabled={busy} className={btn(state === 'slipped')} onClick={() => act(() => setNumericEntry(habit, picked, 1))}>Slipped</button>
                <button disabled={busy} className={btn(state === 'clean')} onClick={() => act(() => setNumericEntry(habit, picked, null))}>Clean</button>
              </>
            ) : (
              <button disabled={busy} className={btn(state === 'done')} onClick={() => act(() => setNumericEntry(habit, picked, 1))}>Done</button>
            )}
            <button disabled={busy} className={btn(skipped)} onClick={() => act(() => setSkip(habit, picked, !skipped))}>
              {skipped ? 'Unskip' : 'Skip'}
            </button>
            {!quit && entry && (
              <button disabled={busy} className={btn(false)} onClick={() => act(() => setNumericEntry(habit, picked, null))}>Clear</button>
            )}
          </div>
          <input
            className="input h-9 py-0 text-[13px]" value={note} maxLength={280}
            onChange={(e) => setNoteDraft(e.target.value)}
            onBlur={() => { if (note.trim() !== (entry?.notes ?? '')) void act(() => setNote(habit, picked, note.trim())); }}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            placeholder="Add a note for this day" aria-label={`Note for ${picked}`}
          />
        </div>
      )}
    </section>
  );
}

// ---- notes timeline -------------------------------------------------------------------------------------
export function NotesPanel({ entries }: { entries: DayEntry[] }) {
  const [all, setAll] = useState(false);
  const notes = useMemo(() => entries.filter((e) => e.notes).sort((a, b) => b.date.localeCompare(a.date)), [entries]);
  if (!notes.length) return null;
  const shown = all ? notes : notes.slice(0, 5);
  return (
    <section className="panel">
      <div className="panel-head">
        Notes
        <span className="normal-case tracking-normal font-medium">{notes.length}</span>
      </div>
      <ul className="px-4 pb-3 flex flex-col gap-2">
        {shown.map((n) => (
          <li key={n.date} className="flex gap-3 text-[12.5px] leading-snug">
            <span className="num text-[11px] text-ink-soft w-16 shrink-0 pt-px">{fmtDate(n.date).slice(0, -5)}</span>
            <span className="min-w-0 break-words">{n.notes}</span>
          </li>
        ))}
      </ul>
      {notes.length > 5 && (
        <button onClick={() => setAll(!all)} className="mx-4 mb-3 text-[11px] text-ink-soft hover:text-ink">
          {all ? 'Show fewer' : `Show all ${notes.length}`}
        </button>
      )}
    </section>
  );
}

// ---- quick actions --------------------------------------------------------------------------------------------
export function QuickActions({ habit, detail, entries }: { habit: Habit; detail: HabitDetailData; entries: DayEntry[] }) {
  const { setPauseOpen, openEditor, closeDetail } = useApp();
  const t = today();
  const h = useMemo(() => withStart(habit, detail.habit.createdDate), [habit, detail.habit.createdDate]);
  const btn = 'text-[12px] font-medium rounded-lg px-3 h-9 border border-line text-ink-soft hover:text-ink hover:bg-forest-850';

  const share = () => {
    const r = completionRates(h, lookupFor(h, entries), t);
    const rows = ([['Last 7 days', r.d7], ['Last 30 days', r.d30], ['Last 90 days', r.d90], ['All time', r.all]] as const)
      .filter(([, v]) => v !== null)
      .map(([label, v]) => ({ label, pct: v!, value: `${v}%`, color: habit.color }));
    void shareCard(habit.name, `${isQuit(habit) ? 'Clean streak' : 'Current streak'}: ${detail.currentStreak} ${detail.streakUnit}`, rows);
  };
  const exportCsv = () => {
    const blob = new Blob([entriesCsv(habit, entries)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${habit.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'habit'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="flex flex-wrap gap-2">
      <button className={btn} onClick={share}>Share card</button>
      <button className={btn} onClick={exportCsv} disabled={!entries.length}>Export CSV</button>
      <button className={btn} onClick={() => { closeDetail(); setPauseOpen(true, [habit.id]); }}>Pause this habit</button>
      <button className={btn} onClick={() => openEditor(habit)}>Edit reminders</button>
    </div>
  );
}
