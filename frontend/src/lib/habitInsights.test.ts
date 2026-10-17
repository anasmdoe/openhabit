import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Habit } from './types';
import { addDays, SKIP } from './stats';
import {
  cleanStats, completionRates, entriesCsv, lookupFor, nextMilestone, numberStats, savingsTotal, trendSentences,
} from './habitInsights';

const TODAY = '2026-10-14';
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 14, 12)); });
afterEach(() => vi.useRealTimers());

const habit = (over: Partial<Habit> = {}): Habit => ({
  id: 'h1', name: 'Test', question: '', type: 'boolean', unit: '', target: 1, targetType: 'at_least',
  color: '#000', icon: '', scheduleType: 'weekdays', frequency: 3, webhookUrl: '', reminderTime: '',
  activeDays: [0, 1, 2, 3, 4, 5, 6], position: 0, archived: false, category: '', cue: '', savingsPerDay: 0, savingsUnit: '', streakFreezes: 0,
  kind: 'build', createdAt: `${addDays(TODAY, -99)}T00:00:00Z`, ...over,
});
const e = (n: number, value = 1, notes?: string) => ({ date: addDays(TODAY, -n), value, notes });

describe('completionRates', () => {
  it('rates over 7/30/90 days and all time', () => {
    const h = habit();
    // done every day for the last 10 days, nothing before
    const entries = Array.from({ length: 10 }, (_, i) => e(i));
    const r = completionRates(h, lookupFor(h, entries), TODAY);
    expect(r.d7).toBe(100);
    expect(r.d30).toBe(33);   // 10 of 30
    expect(r.d90).toBe(11);   // 10 of 90
    expect(r.all).toBe(10);   // 10 of 100 days since creation
    expect(r.since).toBe(addDays(TODAY, -99));
  });
  it('is null when there are fewer than 3 scheduled days', () => {
    const h = habit({ createdAt: `${addDays(TODAY, -1)}T00:00:00Z` });
    expect(completionRates(h, lookupFor(h, []), TODAY).all).toBeNull();
  });
});

describe('nextMilestone', () => {
  it('daily habits: 7, 30, 100, 365 days', () => {
    expect(nextMilestone(habit(), 3)).toEqual({ target: 7, remaining: 4, unit: 'day' });
    expect(nextMilestone(habit(), 30)).toEqual({ target: 100, remaining: 70, unit: 'day' });
    expect(nextMilestone(habit(), 400)).toBeNull();
  });
  it('weekly habits count weeks', () => {
    expect(nextMilestone(habit({ scheduleType: 'per_week' }), 2)).toEqual({ target: 4, remaining: 2, unit: 'week' });
  });
});

describe('numberStats', () => {
  it('average, best, total and the share of days that hit the target', () => {
    const h = habit({ type: 'numeric', target: 10, unit: 'pages' });
    const s = numberStats(h, [e(0, 12), e(1, 8), e(2, 10), e(3, SKIP), e(4, 20)])!;
    expect(s.logged).toBe(4);
    expect(s.average).toBe(12.5);
    expect(s.best).toBe(20);
    expect(s.total).toBe(50);
    expect(s.hitRate).toBe(75); // 12, 10, 20 of 4
  });
  it('"at most" habits: the best day is the lowest value', () => {
    const h = habit({ type: 'numeric', target: 2, targetType: 'at_most' });
    expect(numberStats(h, [e(0, 3), e(1, 1), e(2, 2)])!.best).toBe(1);
  });
  it('returns null with nothing logged', () => {
    expect(numberStats(habit({ type: 'numeric' }), [])).toBeNull();
  });
});

describe('cleanStats and savings', () => {
  const q = () => habit({ kind: 'quit', createdAt: `${addDays(TODAY, -9)}T00:00:00Z`, savingsPerDay: 4, savingsUnit: '$' });
  it('counts days without a slip since the start, excusing skipped days', () => {
    const h = q(); // 10 days: -9..0
    const s = cleanStats(h, [e(5), e(2, SKIP)], TODAY);
    expect(s.slips).toBe(1);
    expect(s.cleanDays).toBe(8);          // 10 days - 1 slip - 1 skip
    expect(s.lastSlip).toBe(addDays(TODAY, -5));
    expect(s.longestClean).toBe(4);       // days -9..-6
  });
  it('multiplies clean days by what a day is worth', () => {
    expect(savingsTotal(q(), 8)).toBe(32);
    expect(savingsTotal(habit(), 8)).toBe(0);
  });
});

describe('trendSentences and csv', () => {
  it('describes the trend against the 30 days before', () => {
    const h = habit();
    const entries = Array.from({ length: 30 }, (_, i) => e(i)).concat(Array.from({ length: 10 }, (_, i) => e(30 + i)));
    const text = trendSentences(h, lookupFor(h, entries), TODAY).join(' ');
    expect(text).toMatch(/100% over the last 30 days, up \d+ points?/);
  });
  it('says so when there is too little data', () => {
    const h = habit({ createdAt: `${addDays(TODAY, -1)}T00:00:00Z` });
    expect(trendSentences(h, lookupFor(h, []), TODAY)[0]).toMatch(/Not enough days/);
  });
  it('exports date,value,state,notes with quoting', () => {
    const csv = entriesCsv(habit(), [e(1, 1, 'felt, great'), e(2, SKIP)]);
    expect(csv.split('\n')[0]).toBe('date,value,state,notes');
    expect(csv).toContain('2026-10-12,-1,skipped,');
    expect(csv).toContain('2026-10-13,1,done,"felt, great"');
  });
});
