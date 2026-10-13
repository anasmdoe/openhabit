// Numbers and sentences for one habit's detail window. Pure functions over the habit and its entries.
import type { Habit } from './types';
import { addDays, isCompleted, isFixedDay, isQuit, isSkip } from './stats';
import { periodStats, recap, weekdayStats } from './periodStats';
import type { EntryLookup } from './periodStats';

export interface DayEntry { date: string; value: number; notes?: string }

/** The habit with its effective start (the first entry may predate its creation: imports). */
export function withStart(habit: Habit, createdDate: string): Habit {
  return { ...habit, createdAt: `${createdDate}T00:00:00Z` };
}

export function lookupFor(habit: Habit, entries: DayEntry[]): EntryLookup {
  return new Map(entries.map((e) => [`${habit.id}|${e.date}`, e.value]));
}

export interface Rates { d7: number | null; d30: number | null; d90: number | null; all: number | null; since: string }

/** Completion rate over the last 7 / 30 / 90 days and since the start (target-aware). */
export function completionRates(habit: Habit, lookup: EntryLookup, today: string): Rates {
  const since = habit.createdAt.slice(0, 10);
  const rate = (days: number | null) => {
    const from = days === null ? since : addDays(today, -(days - 1));
    const p = periodStats([habit], lookup, from < since ? since : from, today, today);
    return p.goal >= 3 ? p.pct : null; // fewer than 3 scheduled days says nothing
  };
  return { d7: rate(7), d30: rate(30), d90: rate(90), all: rate(null), since };
}

const DAY_MILESTONES = [7, 30, 100, 365];
const WEEK_MILESTONES = [4, 12, 26, 52];

/** The next streak milestone and how far away it is. */
export function nextMilestone(habit: Habit, streak: number): { target: number; remaining: number; unit: 'day' | 'week' } | null {
  const weekly = !isFixedDay(habit) && !isQuit(habit);
  const target = (weekly ? WEEK_MILESTONES : DAY_MILESTONES).find((m) => m > streak);
  return target ? { target, remaining: target - streak, unit: weekly ? 'week' : 'day' } : null;
}

export interface NumberStats { logged: number; average: number; best: number; bestDate: string; total: number; hitRate: number | null }

/** Measurable habits: what the values look like, over the days that were logged. */
export function numberStats(habit: Habit, entries: DayEntry[]): NumberStats | null {
  const vals = entries.filter((e) => !isSkip(e.value) && e.value >= 0);
  if (!vals.length) return null;
  const total = vals.reduce((n, e) => n + e.value, 0);
  const best = vals.reduce((b, e) => (habit.targetType === 'at_most' ? (e.value < b.value ? e : b) : (e.value > b.value ? e : b)));
  const hit = vals.filter((e) => isCompleted(habit, e.value)).length;
  return {
    logged: vals.length,
    average: Math.round((total / vals.length) * 10) / 10,
    best: best.value,
    bestDate: best.date,
    total: Math.round(total * 10) / 10,
    hitRate: vals.length >= 3 ? Math.round((hit / vals.length) * 100) : null,
  };
}

export interface CleanStats { cleanDays: number; slips: number; lastSlip: string | null; longestClean: number }

/** Quit habits: days without a slip since the habit started (skipped days excluded). */
export function cleanStats(habit: Habit, entries: DayEntry[], today: string): CleanStats {
  const slipDates = new Set(entries.filter((e) => e.value >= 1).map((e) => e.date));
  const skipped = new Set(entries.filter((e) => isSkip(e.value)).map((e) => e.date));
  const start = habit.createdAt.slice(0, 10);
  let cleanDays = 0;
  let run = 0;
  let longest = 0;
  for (let d = start; d <= today; d = addDays(d, 1)) {
    if (skipped.has(d)) continue;
    if (slipDates.has(d)) { run = 0; continue; }
    cleanDays += 1;
    run += 1;
    if (run > longest) longest = run;
  }
  const dates = [...slipDates].sort();
  return { cleanDays, slips: slipDates.size, lastSlip: dates.length ? dates[dates.length - 1] : null, longestClean: longest };
}

export const savingsTotal = (habit: Habit, cleanDays: number) =>
  habit.savingsPerDay > 0 ? Math.round(habit.savingsPerDay * cleanDays * 100) / 100 : 0;

/** Two or three plain sentences: the trend against the 30 days before, and the best weekday. */
export function trendSentences(habit: Habit, lookup: EntryLookup, today: string): string[] {
  const r = recap([habit], lookup, 30, today);
  if (!r.enough) return ['Not enough days logged yet for a trend.'];
  const out: string[] = [];
  const pct = r.current.pct ?? 0;
  if (r.delta === null) out.push(`${pct}% over the last 30 days.`);
  else if (r.delta > 0) out.push(`${pct}% over the last 30 days, up ${r.delta} point${r.delta === 1 ? '' : 's'} on the 30 before.`);
  else if (r.delta < 0) out.push(`${pct}% over the last 30 days, ${-r.delta} point${r.delta === -1 ? '' : 's'} below the 30 before: a dip, not a reset.`);
  else out.push(`${pct}% over the last 30 days, the same as the 30 before.`);
  const names = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
  if (r.bestDay && r.weakestDay) out.push(`${names[r.bestDay.dow]} are your best day (${r.bestDay.pct}%); ${names[r.weakestDay.dow]} your toughest (${r.weakestDay.pct}%).`);
  return out;
}

/** Weekday pattern for the frequency chart note (kept for tests of the underlying maths). */
export const weekdayPattern = (habit: Habit, lookup: EntryLookup, today: string) =>
  weekdayStats(periodStats([habit], lookup, addDays(today, -89), today, today));

/** CSV of one habit's entries: date,value,state,notes. */
export function entriesCsv(habit: Habit, entries: DayEntry[]): string {
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const rows = [...entries].sort((a, b) => a.date.localeCompare(b.date)).map((e) => {
    const state = isSkip(e.value) ? 'skipped' : isQuit(habit) ? (e.value >= 1 ? 'slip' : 'clean')
      : isCompleted(habit, e.value) ? 'done' : 'partial';
    return [e.date, String(e.value), state, esc(e.notes ?? '')].join(',');
  });
  return ['date,value,state,notes', ...rows].join('\n') + '\n';
}
