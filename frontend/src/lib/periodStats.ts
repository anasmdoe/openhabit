// Completion over any window of days, with the same rules as the month overview:
//   - fixed-day habits count their scheduled days; skipped days are excused;
//   - "N per week" habits are measured against their (prorated) weekly quota, so 3 of 3 is 100%,
//     not 3 of 7;
//   - quit habits count every tracked day without a slip as done.
// Days after today never count. Used by the stat cards, the recap and the weekday summary.
import type { Entry, Habit } from './types';
import { addDays, dow, fromISO, isCompleted, isFixedDay, isQuit, isSkip, weekKey } from './stats';

export type EntryLookup = Map<string, number>;

export const entryLookup = (entries: Entry[]): EntryLookup =>
  new Map(entries.map((e) => [`${e.habitId}|${e.date}`, e.value]));

export interface HabitPeriod { id: string; goal: number; done: number; pct: number | null }
export interface DayPeriod { date: string; goal: number; done: number }
export interface PeriodStat {
  from: string;
  to: string;
  goal: number;
  done: number;
  pct: number | null;
  /** fixed-day and quit habits only: "N per week" habits have no per-day target */
  days: DayPeriod[];
  habits: HabitPeriod[];
}

const quotaFor = (freq: number, segDays: number) => Math.max(1, Math.round((freq * segDays) / 7));
const pctOf = (done: number, goal: number) => (goal ? Math.round((done / goal) * 100) : null);
const startOf = (h: Habit) => h.createdAt.slice(0, 10);

/** Completion of `habits` from `from` to `to` (inclusive), never past `today`. */
export function periodStats(habits: Habit[], lookup: EntryLookup, from: string, to: string, today: string): PeriodStat {
  const end = to > today ? today : to;
  const dayMap = new Map<string, DayPeriod>();
  for (let d = from; d <= end; d = addDays(d, 1)) dayMap.set(d, { date: d, goal: 0, done: 0 });
  const perHabit: HabitPeriod[] = [];

  for (const h of habits) {
    if (h.archived) continue;
    const start = startOf(h);
    let goal = 0;
    let done = 0;

    if (isFixedDay(h) || isQuit(h)) {
      for (let d = from > start ? from : start; d <= end; d = addDays(d, 1)) {
        if (!h.activeDays.includes(dow(d))) continue;
        const v = lookup.get(`${h.id}|${d}`);
        if (isSkip(v)) continue;
        const ok = isCompleted(h, v);
        goal += 1;
        if (ok) done += 1;
        const day = dayMap.get(d)!;
        day.goal += 1;
        if (ok) day.done += 1;
      }
    } else {
      // weekly quota, prorated for the days of each week that fall inside the window
      const weeks = new Map<string, { days: number; count: number }>();
      for (let d = from > start ? from : start; d <= end; d = addDays(d, 1)) {
        const wk = weekKey(d);
        const w = weeks.get(wk) ?? { days: 0, count: 0 };
        w.days += 1;
        if (isCompleted(h, lookup.get(`${h.id}|${d}`))) w.count += 1;
        weeks.set(wk, w);
      }
      for (const w of weeks.values()) {
        const quota = quotaFor(h.frequency, w.days);
        goal += quota;
        done += Math.min(w.count, quota);
      }
    }
    perHabit.push({ id: h.id, goal, done, pct: pctOf(done, goal) });
  }

  const goal = perHabit.reduce((n, h) => n + h.goal, 0);
  const done = perHabit.reduce((n, h) => n + h.done, 0);
  return { from, to: end, goal, done, pct: pctOf(done, goal), days: [...dayMap.values()], habits: perHabit };
}

export interface WeekdayStat { dow: number; goal: number; done: number; pct: number | null; /** distinct days behind the number */ samples: number }

/** Completion per weekday (Sunday = 0) over the window: which days of the week you do best on. */
export function weekdayStats(period: PeriodStat): WeekdayStat[] {
  const out: WeekdayStat[] = Array.from({ length: 7 }, (_, i) => ({ dow: i, goal: 0, done: 0, pct: null, samples: 0 }));
  for (const d of period.days) {
    const w = out[fromISO(d.date).getUTCDay()];
    w.goal += d.goal;
    w.done += d.done;
    if (d.goal > 0) w.samples += 1;
  }
  for (const w of out) w.pct = pctOf(w.done, w.goal);
  return out;
}

export interface Recap {
  days: number;
  current: PeriodStat;
  previous: PeriodStat;
  /** percentage-point change against the previous window, null without data on both sides */
  delta: number | null;
  best: (HabitPeriod & { name: string }) | null;
  weakest: (HabitPeriod & { name: string }) | null;
  /** weekday pattern over the last 4 weeks, whatever the recap window: a single Monday proves nothing */
  weekdays: WeekdayStat[];
  bestDay: WeekdayStat | null;
  weakestDay: WeekdayStat | null;
  perfectDays: number;
  enough: boolean;
}

const MIN_GOAL = 5; // below this a percentage says nothing
const MIN_HABIT_GOAL = 3;
const MIN_DAY_SAMPLES = 3;   // distinct days behind a weekday's number
const WEEKDAY_WINDOW = 28;

/** The last `days` days against the `days` before them. */
export function recap(habits: Habit[], lookup: EntryLookup, days: number, today: string): Recap {
  const current = periodStats(habits, lookup, addDays(today, -(days - 1)), today, today);
  const previous = periodStats(habits, lookup, addDays(today, -(2 * days - 1)), addDays(today, -days), today);
  const names = new Map(habits.map((h) => [h.id, h.name]));
  const rated = current.habits
    .filter((h) => h.goal >= MIN_HABIT_GOAL && h.pct !== null)
    .map((h) => ({ ...h, name: names.get(h.id) ?? '' }));
  const byPct = [...rated].sort((a, b) => (b.pct! - a.pct!) || (b.goal - a.goal));
  const best = byPct[0] ?? null;
  const weakest = byPct.length > 1 && byPct[byPct.length - 1].pct! < byPct[0].pct! ? byPct[byPct.length - 1] : null;

  const weekdays = weekdayStats(periodStats(habits, lookup, addDays(today, -(WEEKDAY_WINDOW - 1)), today, today));
  const sortedDays = weekdays.filter((w) => w.samples >= MIN_DAY_SAMPLES && w.pct !== null).sort((a, b) => b.pct! - a.pct!);
  const bestDay = sortedDays[0] ?? null;
  const weakestDay = sortedDays.length > 1 && sortedDays[sortedDays.length - 1].pct! < sortedDays[0].pct!
    ? sortedDays[sortedDays.length - 1] : null;

  const enough = current.goal >= MIN_GOAL;
  const delta = enough && previous.goal >= MIN_GOAL && current.pct !== null && previous.pct !== null
    ? current.pct - previous.pct : null;
  const perfectDays = current.days.filter((d) => d.goal > 0 && d.done === d.goal).length;
  return { days, current, previous, delta, best, weakest, weekdays, bestDay, weakestDay, perfectDays, enough };
}

const DAY_NAMES = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];

/** One to three plain sentences about a recap. */
export function recapSentences(r: Recap, label: string): string[] {
  if (!r.enough) return ['Not enough days logged yet for a recap — check in for a few more days.'];
  const out: string[] = [];
  const pct = r.current.pct ?? 0;
  if (r.delta === null) out.push(`You completed ${pct}% of your habits over the ${label}.`);
  else if (r.delta > 0) out.push(`You completed ${pct}% of your habits over the ${label}, up ${r.delta} point${r.delta === 1 ? '' : 's'} on the one before.`);
  else if (r.delta < 0) out.push(`You completed ${pct}% of your habits over the ${label}, ${-r.delta} point${r.delta === -1 ? '' : 's'} below the one before — a small dip, not a reset.`);
  else out.push(`You completed ${pct}% of your habits over the ${label}, the same as the one before.`);
  if (r.best && r.weakest) out.push(`${r.best.name} went best (${r.best.pct}%); ${r.weakest.name} has the most room (${r.weakest.pct}%).`);
  else if (r.best) out.push(`${r.best.name} went best (${r.best.pct}%).`);
  if (r.bestDay && r.weakestDay) out.push(`${DAY_NAMES[r.bestDay.dow]} are your strongest day (${r.bestDay.pct}%), ${DAY_NAMES[r.weakestDay.dow]} your weakest (${r.weakestDay.pct}%).`);
  return out;
}
