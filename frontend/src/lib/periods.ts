// Aggregation helpers for the Day/Week/Month/Quarter/Year toggles,
// target progress and the compact calendars.
import type { Habit, HabitDetail } from './types';
import { addDays, dow, fromISO, iso, todayISO, isCompleted, isSkip, isFixedDay, weekKey as wkKey } from './stats';

export type Period = 'day' | 'week' | 'month' | 'quarter' | 'year';
export const PERIODS: { id: Period; label: string }[] = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'quarter', label: 'Quarter' },
  { id: 'year', label: 'Year' },
];

const weekKey = wkKey;

export function bucketKey(dateStr: string, period: Period): string {
  switch (period) {
    case 'day': return dateStr;
    case 'week': return weekKey(dateStr);
    case 'month': return dateStr.slice(0, 7);
    case 'quarter': return `${dateStr.slice(0, 4)} Q${Math.floor((+dateStr.slice(5, 7) - 1) / 3) + 1}`;
    case 'year': return dateStr.slice(0, 4);
  }
}

export function bucketLabel(key: string, period: Period): string {
  switch (period) {
    case 'day': return key.slice(8, 10).replace(/^0/, '');
    case 'week': return `${+key.slice(5, 7)}/${+key.slice(8, 10)}`;
    case 'month': return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+key.slice(5, 7) - 1];
    case 'quarter': return key.slice(2).replace(' ', ' ');
    case 'year': return key;
  }
}

const KEEP: Record<Period, number> = { day: 30, week: 26, month: 12, quarter: 8, year: 5 };

/** Score chart: last score value inside each bucket */
export function aggregateScore(detail: HabitDetail, period: Period) {
  const buckets = new Map<string, number>();
  for (const p of detail.scoreSeries) buckets.set(bucketKey(p.date, period), p.score);
  return [...buckets.entries()].slice(-KEEP[period])
    .map(([key, score]) => ({ key, label: bucketLabel(key, period), value: score }));
}

/** History chart: completions (boolean) or summed value (numeric) per bucket */
export function aggregateHistory(detail: HabitDetail, period: Period) {
  const habit = detail.habit;
  const buckets = new Map<string, number>();
  for (const e of detail.entries) {
    if (isSkip(e.value)) continue;
    const key = bucketKey(e.date, period);
    const add = habit.type === 'numeric' ? Math.max(0, e.value) : (isCompleted(habit as Habit, e.value) ? 1 : 0);
    buckets.set(key, (buckets.get(key) ?? 0) + add);
  }
  return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-KEEP[period])
    .map(([key, v]) => ({ key, label: bucketLabel(key, period), value: Math.round(v * 10) / 10 }));
}

/** Target progress: actual vs expected for the current day/week/month/quarter/year */
export function targetProgress(detail: HabitDetail) {
  const habit = detail.habit;
  const today = todayISO();
  const ranges: { id: Period; label: string; from: string }[] = [
    { id: 'day', label: 'Today', from: today },
    { id: 'week', label: 'This week', from: weekKey(today) },
    { id: 'month', label: 'This month', from: `${today.slice(0, 7)}-01` },
    { id: 'quarter', label: 'This quarter', from: `${today.slice(0, 4)}-${String(Math.floor((+today.slice(5, 7) - 1) / 3) * 3 + 1).padStart(2, '0')}-01` },
    { id: 'year', label: 'This year', from: `${today.slice(0, 4)}-01-01` },
  ];
  return ranges.map((r) => {
    let actual = 0;
    for (const e of detail.entries)
      if (e.date >= r.from && e.date <= today && !isSkip(e.value) && e.value >= 0) actual += e.value;
    // expected = target × scheduled days (fixed) or target × freq-prorated days (flexible)
    let scheduledDays = 0;
    let rangeDays = 0;
    for (let d = r.from; d <= today; d = addDays(d, 1)) {
      if (d < detail.habit.createdDate) continue;
      rangeDays += 1;
      const value = detail.entries.find((e) => e.date === d)?.value;
      if (isSkip(value)) continue;
      if (habit.activeDays.includes(dow(d))) scheduledDays += 1;
    }
    if (!isFixedDay(habit as Habit)) {
      scheduledDays = Math.max(1, Math.round((habit.frequency * rangeDays) / 7));
    }
    const expected = habit.target * Math.max(scheduledDays, r.id === 'day' ? 1 : 0);
    return {
      ...r,
      actual: Math.round(actual * 10) / 10,
      expected: Math.round(expected * 10) / 10,
      pct: expected > 0 ? Math.min(100, Math.round((actual / expected) * 100)) : 0,
    };
  });
}

/** Compact calendar model: the current month and the two before it */
export interface CalendarMonth {
  key: string;   // YYYY-MM
  label: string;
  cells: { date: string; inMonth: boolean; state: 'done' | 'partial' | 'miss' | 'off' | 'future' }[];
}

export function buildCalendars(detail: HabitDetail, months = 3): CalendarMonth[] {
  const habit = detail.habit;
  const today = todayISO();
  const entryMap = new Map(detail.entries.map((e) => [e.date, e.value]));
  const out: CalendarMonth[] = [];
  const now = fromISO(today);

  for (let m = months - 1; m >= 0; m--) {
    const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - m, 1));
    const key = iso(first).slice(0, 7);
    const label = first.toLocaleDateString('en', { month: 'short', year: '2-digit', timeZone: 'UTC' });
    const daysInMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    const lead = first.getUTCDay(); // Sunday-start grid
    const cells: CalendarMonth['cells'] = [];
    for (let i = 0; i < lead; i++) cells.push({ date: '', inMonth: false, state: 'off' });
    for (let d = 1; d <= daysInMonth; d++) {
      const date = `${key}-${String(d).padStart(2, '0')}`;
      let state: CalendarMonth['cells'][number]['state'];
      const value = entryMap.get(date);
      if (date > today) state = 'future';
      else if (isSkip(value)) state = 'off';
      else if (date < detail.habit.createdDate
        || (isFixedDay(habit as Habit) && !habit.activeDays.includes(dow(date)))) state = 'off';
      else if (value != null && isCompleted(habit as Habit, value)) state = 'done';
      else if (value != null) state = 'partial';
      else state = isFixedDay(habit as Habit) ? 'miss' : 'off';
      cells.push({ date, inMonth: true, state });
    }
    out.push({ key, label, cells });
  }
  return out;
}

/** Current streak from a bounded entry window (home-page cards).
 *  Fixed-day habits: days (skips are excused). Flexible: weeks meeting quota. */
export function quickCurrentStreak(habit: Habit, entryDates: Map<string, number>, lookbackDays = 120): number {
  const today = todayISO();
  if (!isFixedDay(habit)) {
    const cnt = new Map<string, number>();
    let d = today;
    for (let i = 0; i < lookbackDays; i++, d = addDays(d, -1)) {
      const v = entryDates.get(`${habit.id}|${d}`);
      if (v != null && isCompleted(habit, v)) cnt.set(weekKey(d), (cnt.get(weekKey(d)) ?? 0) + 1);
    }
    let streak = 0;
    let wk = weekKey(today);
    if ((cnt.get(wk) ?? 0) >= habit.frequency) streak += 1; // current week counts if met
    for (wk = addDays(wk, -7); ; wk = addDays(wk, -7)) {
      if ((cnt.get(wk) ?? 0) >= habit.frequency) streak += 1;
      else break;
      if (streak > lookbackDays / 7) break;
    }
    return streak;
  }
  let streak = 0;
  let d = today;
  for (let i = 0; i < lookbackDays; i++, d = addDays(d, -1)) {
    if (!habit.activeDays.includes(dow(d))) continue;
    const v = entryDates.get(`${habit.id}|${d}`);
    if (isSkip(v)) continue; // excused
    const done = isCompleted(habit, v);
    if (done) streak += 1;
    else if (d === today) continue;
    else break;
  }
  return streak;
}
