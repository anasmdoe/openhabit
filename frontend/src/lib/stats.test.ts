import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Entry, Habit } from './types';
import {
  addDays, computeHabitDetail, computeOverview, isCompleted, monthRange, SKIP, weekKey,
} from './stats';
import { quickCurrentStreak } from './periods';

// "Today" for every test: Wednesday 2026-10-14 (local noon, so todayISO() is TZ-proof).
const TODAY = '2026-10-14';
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 14, 12));
});
afterEach(() => vi.useRealTimers());

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAYS = [1, 2, 3, 4, 5];

function habit(over: Partial<Habit> = {}): Habit {
  return {
    id: 'h1', name: 'Test', question: '', type: 'boolean', unit: '', target: 1,
    targetType: 'at_least', color: '#000', icon: '', scheduleType: 'weekdays', frequency: 7,
    webhookUrl: '', reminderTime: '', activeDays: ALL_DAYS, position: 0, archived: false, category: '', cue: '', savingsPerDay: 0, savingsUnit: '', streakFreezes: 0, afterHabitId: null, kind: 'build',
    createdAt: '2026-01-01T00:00:00Z', ...over,
  };
}

/** Entries on the given days, counted backwards from TODAY (0 = today). */
const daysAgo = (h: Habit, offsets: number[], value = 1): Entry[] =>
  offsets.map((n) => ({ habitId: h.id, date: addDays(TODAY, -n), value }));

describe('date helpers', () => {
  it('addDays crosses month, year and leap-day boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('weekKey buckets by Monday-start weeks', () => {
    expect(weekKey('2026-10-12')).toBe('2026-10-12'); // Monday
    expect(weekKey('2026-10-14')).toBe('2026-10-12'); // Wednesday
    expect(weekKey('2026-10-18')).toBe('2026-10-12'); // Sunday belongs to the previous Monday
    expect(weekKey('2026-10-19')).toBe('2026-10-19');
  });

  it('monthRange handles leap years', () => {
    expect(monthRange(2028, 2)).toEqual({ start: '2028-02-01', end: '2028-02-29', daysInMonth: 29 });
    expect(monthRange(2026, 2).daysInMonth).toBe(28);
  });
});

describe('isCompleted', () => {
  it('boolean: any value >= 1 counts, skip and empty do not', () => {
    const h = habit();
    expect(isCompleted(h, 1)).toBe(true);
    expect(isCompleted(h, 0)).toBe(false);
    expect(isCompleted(h, SKIP)).toBe(false);
    expect(isCompleted(h, null)).toBe(false);
  });

  it('numeric: honours at_least and at_most targets', () => {
    const atLeast = habit({ type: 'numeric', target: 8 });
    expect(isCompleted(atLeast, 8)).toBe(true);
    expect(isCompleted(atLeast, 7)).toBe(false);
    const atMost = habit({ type: 'numeric', target: 2, targetType: 'at_most' });
    expect(isCompleted(atMost, 0)).toBe(true);
    expect(isCompleted(atMost, 3)).toBe(false);
    expect(isCompleted(atMost, SKIP)).toBe(false);
  });
});

describe('computeHabitDetail — daily habits (streaks in days)', () => {
  it('counts consecutive completed days up to today', () => {
    const h = habit();
    const d = computeHabitDetail(h, daysAgo(h, [0, 1, 2, 3, 4]));
    expect(d.streakUnit).toBe('days');
    expect(d.currentStreak).toBe(5);
  });

  it('a missed day ends the streak and is kept as a best streak', () => {
    const h = habit();
    const d = computeHabitDetail(h, daysAgo(h, [0, 1, /* miss 2 */ 3, 4, 5, 6]));
    expect(d.currentStreak).toBe(2);
    expect(d.bestStreaks[0]).toMatchObject({ length: 4, start: addDays(TODAY, -6), end: addDays(TODAY, -3) });
  });

  it('today not ticked yet keeps yesterday\'s streak (it is not a miss until the day ends)', () => {
    const h = habit();
    const d = computeHabitDetail(h, daysAgo(h, [1, 2, 3]));
    expect(d.currentStreak).toBe(3);
    expect(d.currentStreak).toBe(quickCurrentStreak(h, new Map(daysAgo(h, [1, 2, 3]).map((e) => [`h1|${e.date}`, e.value]))));
  });

  it('a skipped day is excused and keeps the streak alive', () => {
    const h = habit();
    const entries = [...daysAgo(h, [0, 1, 3, 4]), ...daysAgo(h, [2], SKIP)];
    expect(computeHabitDetail(h, entries).currentStreak).toBe(4);
  });

  it('days outside activeDays are ignored', () => {
    const h = habit({ activeDays: WEEKDAYS });
    // Wed 14, Tue 13, Mon 12, (weekend 11/10 unscheduled), Fri 9
    const d = computeHabitDetail(h, daysAgo(h, [0, 1, 2, 5]));
    expect(d.currentStreak).toBe(4);
  });

  it('score climbs with completions and stays at 0 without them', () => {
    const h = habit({ createdAt: `${addDays(TODAY, -60)}T00:00:00Z` });
    const all = computeHabitDetail(h, daysAgo(h, Array.from({ length: 61 }, (_, i) => i)));
    const scores = all.scoreSeries.map((s) => s.score);
    expect(scores.every((s, i) => i === 0 || s >= scores[i - 1])).toBe(true);
    expect(scores.at(-1)!).toBeGreaterThan(90);

    const none = computeHabitDetail(h, []);
    expect(none.scoreSeries.every((s) => s.score === 0)).toBe(true);
  });
});

describe('computeHabitDetail — per_week habits (streaks in weeks)', () => {
  const h = habit({ scheduleType: 'per_week', frequency: 3 });

  it('counts weeks that met the quota; an unmet current week does not break it', () => {
    // Week of 2026-10-12 (current): only 1 so far. Previous two weeks: 3 each.
    const entries = daysAgo(h, [
      0,
      7, 8, 9, // week of 10-05
      14, 15, 16, // week of 09-28
    ]);
    const d = computeHabitDetail(h, entries);
    expect(d.streakUnit).toBe('weeks');
    expect(d.currentStreak).toBe(2);
  });

  it('the current week extends the streak once its quota is met', () => {
    const entries = daysAgo(h, [0, 1, 2, 7, 8, 9]);
    expect(computeHabitDetail(h, entries).currentStreak).toBe(2);
  });

  it('a week under quota breaks the streak', () => {
    const entries = daysAgo(h, [7, 8, 9, /* week of 09-28: only 2 */ 14, 15, 21, 22, 23]);
    expect(computeHabitDetail(h, entries).currentStreak).toBe(1);
  });
});

describe('computeOverview', () => {
  it('goal counts scheduled days; skips are excluded from the goal', () => {
    const h = habit({ activeDays: WEEKDAYS });
    const entries: Entry[] = [
      { habitId: h.id, date: '2026-09-01', value: 1 }, // Tue
      { habitId: h.id, date: '2026-09-02', value: 1 }, // Wed
      { habitId: h.id, date: '2026-09-03', value: SKIP }, // Thu, excused
    ];
    const o = computeOverview([h], entries, [], 2026, 9);
    // September 2026 has 22 weekdays; one is skipped.
    expect(o.goal).toBe(21);
    expect(o.completed).toBe(2);
    expect(o.left).toBe(19);
    expect(o.days.find((d) => d.date === '2026-09-03')!.scheduled).toBe(0);
  });

  it('per_week quotas are prorated over partial weeks', () => {
    const h = habit({ scheduleType: 'per_week', frequency: 3 });
    const o = computeOverview([h], [], [], 2026, 9);
    // 30 days → four 7-day segments (quota 3) + one 2-day segment (round(3*2/7) = 1)
    expect(o.goal).toBe(3 * 4 + 1);
  });

  it('completions above the weekly quota do not inflate the score', () => {
    const h = habit({ scheduleType: 'per_week', frequency: 1 });
    const entries = ['2026-09-01', '2026-09-02', '2026-09-03'].map((date) => ({ habitId: h.id, date, value: 1 }));
    const o = computeOverview([h], entries, [], 2026, 9);
    expect(o.habits[0].actual).toBe(1);
  });

  it('archived habits are left out', () => {
    const o = computeOverview([habit({ archived: true })], [], [], 2026, 9);
    expect(o.habits).toHaveLength(0);
    expect(o.goal).toBe(0);
  });
});

describe('quickCurrentStreak (list view)', () => {
  const map = (h: Habit, entries: Entry[]) => new Map(entries.map((e) => [`${h.id}|${e.date}`, e.value]));

  it('today still pending does not break the streak', () => {
    const h = habit();
    expect(quickCurrentStreak(h, map(h, daysAgo(h, [1, 2, 3])))).toBe(3);
  });

  it('skips are excused, misses break', () => {
    const h = habit();
    const entries = [...daysAgo(h, [0, 1, 3, 5]), ...daysAgo(h, [2], SKIP)];
    // done 0, 1, 3 + skipped 2 (excused, not counted); day 4 missed ends it
    expect(quickCurrentStreak(h, map(h, entries))).toBe(3);
  });
});

describe('quit habits (an entry is a slip)', () => {
  const quit = (createdDaysAgo: number) =>
    habit({ kind: 'quit', createdAt: `${addDays(TODAY, -createdDaysAgo)}T00:00:00Z` });
  const lookupOf = (h: Habit, entries: Entry[]) =>
    new Map(entries.map((e) => [`${h.id}|${e.date}`, e.value]));

  it('days without a slip count as done; a slip or skip does not', () => {
    const h = quit(10);
    expect(isCompleted(h, undefined)).toBe(true);
    expect(isCompleted(h, 0)).toBe(true);
    expect(isCompleted(h, 1)).toBe(false);
    expect(isCompleted(h, SKIP)).toBe(false);
  });

  it('the clean streak counts from the start, not from before the habit existed', () => {
    const h = quit(5); // created 5 days ago: days -5..0 are clean
    expect(computeHabitDetail(h, []).currentStreak).toBe(6);
    expect(quickCurrentStreak(h, new Map())).toBe(6);
  });

  it('a slip resets the streak; a slip today means a streak of 0', () => {
    const h = quit(20);
    const slip3 = daysAgo(h, [3]);
    expect(computeHabitDetail(h, slip3).currentStreak).toBe(3);
    expect(quickCurrentStreak(h, lookupOf(h, slip3))).toBe(3);
    const slipToday = daysAgo(h, [0]);
    expect(computeHabitDetail(h, slipToday).currentStreak).toBe(0);
    expect(quickCurrentStreak(h, lookupOf(h, slipToday))).toBe(0);
  });

  it('a skipped day is excused, and the history counts slips', () => {
    const h = quit(20);
    const entries = [...daysAgo(h, [2], SKIP), ...daysAgo(h, [8, 9])];
    const d = computeHabitDetail(h, entries);
    expect(d.currentStreak).toBe(7); // days 7..0 minus the skip on day 2
    expect(d.history.reduce((n, m) => n + m.completions, 0)).toBe(2);
  });

  it('the month overview never counts future days as clean', () => {
    const h = quit(60);
    const o = computeOverview([h], [], [], 2026, 10);
    expect(o.habits[0].actual).toBe(14); // Oct 1..14, no slips
    expect(o.habits[0].goal).toBe(31);
  });
});
