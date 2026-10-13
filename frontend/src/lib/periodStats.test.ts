import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Habit } from './types';
import { addDays, SKIP } from './stats';
import { entryLookup, periodStats, recap, recapSentences, weekdayStats } from './periodStats';

// Wednesday 2026-10-14, local noon
const TODAY = '2026-10-14';
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 14, 12)); });
afterEach(() => vi.useRealTimers());

const habit = (over: Partial<Habit> = {}): Habit => ({
  id: 'h1', name: 'Test', question: '', type: 'boolean', unit: '', target: 1, targetType: 'at_least',
  color: '#000', icon: '', scheduleType: 'weekdays', frequency: 3, webhookUrl: '', reminderTime: '',
  activeDays: [0, 1, 2, 3, 4, 5, 6], position: 0, archived: false, category: '', cue: '', savingsPerDay: 0, savingsUnit: '', kind: 'build',
  createdAt: '2026-01-01T00:00:00Z', ...over,
});
const done = (h: Habit, ...offsets: number[]) => offsets.map((n) => ({ habitId: h.id, date: addDays(TODAY, -n), value: 1 }));

describe('periodStats', () => {
  it('fixed-day habits: done / scheduled days, skipped days excused, future days ignored', () => {
    const h = habit();
    const lookup = entryLookup([...done(h, 0, 1, 2), { habitId: h.id, date: addDays(TODAY, -3), value: SKIP }]);
    const p = periodStats([h], lookup, addDays(TODAY, -6), addDays(TODAY, 3), TODAY); // window runs into the future
    expect(p.to).toBe(TODAY);
    expect(p.goal).toBe(6);        // 7 days minus the skip
    expect(p.done).toBe(3);
    expect(p.pct).toBe(50);
  });

  it('"N per week" habits are measured against the weekly quota: 3 of 3 is 100%', () => {
    const h = habit({ scheduleType: 'per_week', frequency: 3 });
    // Mon 12, Tue 13, Wed 14 this week
    const lookup = entryLookup(done(h, 0, 1, 2));
    const full = periodStats([h], lookup, '2026-10-12', TODAY, TODAY); // Mon..Wed, 3 days
    expect(full.pct).toBe(100);
    const none = periodStats([h], entryLookup([]), '2026-10-12', TODAY, TODAY);
    expect(none.pct).toBe(0);
    // a whole week with 3 completions meets the quota of 3
    const week = periodStats([h], lookup, '2026-10-08', '2026-10-14', TODAY);
    expect(week.goal).toBeGreaterThan(0);
    expect(week.done).toBeLessThanOrEqual(week.goal);
  });

  it('quit habits: every tracked day without a slip is done, from the day the habit was created', () => {
    const h = habit({ kind: 'quit', createdAt: `${addDays(TODAY, -4)}T00:00:00Z` });
    const lookup = entryLookup(done(h, 1)); // one slip yesterday
    const p = periodStats([h], lookup, addDays(TODAY, -9), TODAY, TODAY);
    expect(p.goal).toBe(5);   // only the 5 days since it was created
    expect(p.done).toBe(4);
  });

  it('weekdaysStats groups by day of week and ignores "N per week" habits', () => {
    const daily = habit({ id: 'a' });
    const weekly = habit({ id: 'b', scheduleType: 'per_week', frequency: 2 });
    const lookup = entryLookup(done(daily, 0, 1, 2, 3, 4, 5, 6));
    const w = weekdayStats(periodStats([daily, weekly], lookup, addDays(TODAY, -6), TODAY, TODAY));
    expect(w).toHaveLength(7);
    expect(w.every((d) => d.goal === 1 && d.done === 1)).toBe(true);
  });
});

describe('recap', () => {
  it('compares with the previous window and names the best and weakest habit', () => {
    const a = habit({ id: 'a', name: 'Gym' });
    const b = habit({ id: 'b', name: 'Reading' });
    // Gym: all 7 days this week; Reading: 2 of 7. Previous week: Gym 3 of 7, Reading 0.
    const entries = [
      ...done(a, 0, 1, 2, 3, 4, 5, 6), ...done(a, 7, 8, 9),
      ...done(b, 0, 1),
    ].map((e, i) => (i < 7 ? { ...e, habitId: 'a' } : e));
    const r = recap([a, b], entryLookup(entries.map((e) => e)), 7, TODAY);
    expect(r.enough).toBe(true);
    expect(r.current.pct).toBeGreaterThan(r.previous.pct ?? 0);
    expect(r.delta).toBeGreaterThan(0);
    expect(r.best?.name).toBe('Gym');
    expect(r.weakest?.name).toBe('Reading');
    const text = recapSentences(r, 'week').join(' ');
    expect(text).toMatch(/up \d+ point/);
    expect(text).toMatch(/Gym went best/);
  });

  it('does not name a strongest weekday from fewer than 3 days of each', () => {
    const h = habit({ createdAt: `${addDays(TODAY, -5)}T00:00:00Z` }); // only ~5 days of history: 1 sample per weekday
    const entries = [0, 1, 2, 3, 4, 5].map((n) => ({ habitId: h.id, date: addDays(TODAY, -n), value: 1 }));
    const r = recap([h], entryLookup(entries), 7, TODAY);
    expect(r.bestDay).toBeNull();
    expect(r.weakestDay).toBeNull();
  });

  it('says so instead of inventing a number when there is too little data', () => {
    const h = habit({ createdAt: `${addDays(TODAY, -1)}T00:00:00Z` });
    const r = recap([h], entryLookup([]), 7, TODAY);
    expect(r.enough).toBe(false);
    expect(r.delta).toBeNull();
    expect(recapSentences(r, 'week')[0]).toMatch(/Not enough days/);
  });
});
