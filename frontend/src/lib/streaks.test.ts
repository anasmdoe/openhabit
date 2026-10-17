import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Entry, Habit } from './types';
import { addDays, computeHabitDetail, SKIP } from './stats';
import { quickCurrentStreak } from './periods';
import { freezeDays, freezesLeft } from './streaks';

// Wednesday 2026-10-14
const TODAY = '2026-10-14';
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 14, 12)); });
afterEach(() => vi.useRealTimers());

const habit = (over: Partial<Habit> = {}): Habit => ({
  id: 'h1', name: 'Test', question: '', type: 'boolean', unit: '', target: 1, targetType: 'at_least',
  color: '#000', icon: '', scheduleType: 'weekdays', frequency: 3, webhookUrl: '', reminderTime: '',
  activeDays: [0, 1, 2, 3, 4, 5, 6], position: 0, archived: false, category: '', cue: '', savingsPerDay: 0, savingsUnit: '',
  streakFreezes: 1, kind: 'build', createdAt: `${addDays(TODAY, -60)}T00:00:00Z`, ...over,
});
/** done on every offset (days ago) listed in `done`, skips on `skip`. */
const entries = (h: Habit, done: number[], skip: number[] = []): Entry[] => [
  ...done.map((n) => ({ habitId: h.id, date: addDays(TODAY, -n), value: 1 })),
  ...skip.map((n) => ({ habitId: h.id, date: addDays(TODAY, -n), value: SKIP })),
];
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const lookup = (h: Habit, es: Entry[]) => new Map(es.map((e) => [`${h.id}|${e.date}`, e.value]));
const valueAt = (es: Entry[]) => (d: string) => es.find((e) => e.date === d)?.value;

describe('freezeDays', () => {
  it('forgives one isolated miss after a completed day', () => {
    const h = habit();
    const es = entries(h, [0, 1, 2, 4, 5, 6]); // missed 3 days ago
    const { frozen } = freezeDays(h, valueAt(es), addDays(TODAY, -10), TODAY);
    expect([...frozen]).toEqual([addDays(TODAY, -3)]);
  });

  it('never forgives two misses in a row, and only one per month by default', () => {
    const h = habit();
    const es = entries(h, [0, 1, 5, 6, 7]); // misses 2,3,4 ago
    const { frozen } = freezeDays(h, valueAt(es), addDays(TODAY, -10), TODAY);
    expect([...frozen]).toEqual([addDays(TODAY, -4)]); // the first miss only; the next ones follow a freeze
  });

  it('is off when streakFreezes is 0, for quit habits and for flexible weekly habits', () => {
    const es = (h: Habit) => entries(h, [0, 1, 2, 4, 5]);
    for (const h of [habit({ streakFreezes: 0 }), habit({ kind: 'quit' }), habit({ scheduleType: 'per_week' })]) {
      expect(freezeDays(h, valueAt(es(h)), addDays(TODAY, -10), TODAY).frozen.size).toBe(0);
    }
  });

  it('a miss at the very start (no completion before it) and an open today are not frozen', () => {
    const h = habit();
    const es = entries(h, [1, 2]);                // today still open; nothing before day -2
    const { frozen } = freezeDays(h, valueAt(es), addDays(TODAY, -4), TODAY);
    expect(frozen.size).toBe(0);
  });

  it('allows as many freezes a month as configured, counted per calendar month', () => {
    const h = habit({ streakFreezes: 2 });
    // misses on Sep 30 and Oct 2: different months, so each month has its full allowance
    const done = range(0, 40).filter((n) => ![addDays(TODAY, -n)].some((d) => d === '2026-09-30' || d === '2026-10-02'));
    const { frozen, used } = freezeDays(h, valueAt(entries(h, done)), addDays(TODAY, -40), TODAY);
    expect([...frozen].sort()).toEqual(['2026-09-30', '2026-10-02']);
    expect(used.get('2026-10')).toBe(1);
    expect(freezesLeft(h, used, TODAY)).toBe(1);
  });

  it('skips are ignored: a freeze can still follow the day before a skip', () => {
    const h = habit();
    const es = entries(h, [0, 3, 4], [2]);        // done, skip, miss(1 ago)? 1 ago missed, 2 ago skipped
    const { frozen } = freezeDays(h, valueAt(es), addDays(TODAY, -6), TODAY);
    expect([...frozen]).toEqual([addDays(TODAY, -1)]);
  });
});

describe('streaks with freezes', () => {
  it('a frozen day keeps the streak and the day itself adds nothing', () => {
    const h = habit();
    const es = entries(h, [0, 1, 2, 4, 5, 6]);
    expect(quickCurrentStreak(h, lookup(h, es))).toBe(6);
    const d = computeHabitDetail(h, es);
    expect(d.currentStreak).toBe(6);
    expect(d.frozenDates).toEqual([addDays(TODAY, -3)]);
    expect(d.freezesLeft).toBe(0);
  });

  it('with protection off the same history is a streak of 3', () => {
    const h = habit({ streakFreezes: 0 });
    const es = entries(h, [0, 1, 2, 4, 5, 6]);
    expect(quickCurrentStreak(h, lookup(h, es))).toBe(3);
    expect(computeHabitDetail(h, es).currentStreak).toBe(3);
    expect(computeHabitDetail(h, es).frozenDates).toEqual([]);
  });

  it('the list view and the detail view agree', () => {
    const h = habit({ streakFreezes: 2 });
    const es = entries(h, [0, 1, 3, 4, 5, 7, 8, 9, 10]);
    expect(computeHabitDetail(h, es).currentStreak).toBe(quickCurrentStreak(h, lookup(h, es)));
  });

  it('a second miss in a row breaks the streak even though the first was frozen', () => {
    const h = habit();
    const es = entries(h, [0, 3, 4, 5]);          // misses 1 and 2 ago
    expect(quickCurrentStreak(h, lookup(h, es))).toBe(1);
    expect(computeHabitDetail(h, es).currentStreak).toBe(1);
  });

  it('best streaks run through a frozen day', () => {
    const h = habit();
    const es = entries(h, [10, 11, 12, 14, 15, 16]); // frozen 13 days ago; a long gap after
    const best = computeHabitDetail(h, es).bestStreaks[0];
    expect(best.length).toBe(6);
  });
});
