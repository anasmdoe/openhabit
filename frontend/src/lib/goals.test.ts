import { describe, expect, it } from 'vitest';
import type { Goal, Habit } from './types';
import { addDays } from './stats';
import { goalProgress } from './goals';

const TODAY = '2026-10-20';
const base: Habit = {
  id: 'h', name: 'Read', question: '', type: 'numeric', unit: 'pages', target: 10, targetType: 'at_least', color: '#000', icon: '',
  scheduleType: 'weekdays', frequency: 3, webhookUrl: '', reminderTime: '', activeDays: [0, 1, 2, 3, 4, 5, 6], position: 0,
  archived: false, category: '', cue: '', savingsPerDay: 0, savingsUnit: '', streakFreezes: 1, afterHabitId: null, kind: 'build',
  createdAt: '2026-01-01T00:00:00Z',
};
const pages = base;
const gym: Habit = { ...base, type: 'boolean', unit: '' };
const goal = (over: Partial<Goal> = {}): Goal => ({
  id: 'g', habitId: 'h', title: 'Read', target: 20, unit: 'books', startDate: '2026-10-01', deadline: '2026-12-31', completedAt: null, ...over,
});
const vals = (m: Record<string, number>) => (d: string) => m[d];
const fast = Object.fromEntries(Array.from({ length: 14 }, (_, i) => [addDays(TODAY, -i), 1]));

describe('goalProgress', () => {
  it('sums a measurable habit since the start, ignoring skips, negatives and other dates', () => {
    const p = goalProgress(goal(), pages, vals({ '2026-09-30': 5, '2026-10-02': 2, '2026-10-05': 3, '2026-10-06': -1, '2026-10-21': 4 }), TODAY);
    expect(p).toMatchObject({ measure: 'sum', current: 5, remaining: 15, pct: 25 });
  });

  it('counts completed days for a yes/no habit', () => {
    const p = goalProgress(goal({ target: 30, unit: '' }), gym, vals({ '2026-10-03': 1, '2026-10-04': 1, '2026-10-05': 0, '2026-10-06': 1 }), TODAY);
    expect(p).toMatchObject({ measure: 'days', current: 3 });
    expect(p.message).toMatch(/days/);
  });

  it('reports done, missed, upcoming, early, ahead, on track and behind', () => {
    const twenty = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [addDays('2026-10-01', i), 1]));
    expect(goalProgress(goal(), pages, vals(twenty), TODAY).status).toBe('done');
    expect(goalProgress(goal({ deadline: '2026-10-10' }), pages, vals({}), TODAY).status).toBe('missed');
    expect(goalProgress(goal({ startDate: '2026-11-01' }), pages, vals({}), TODAY).status).toBe('upcoming');
    expect(goalProgress(goal({ startDate: '2026-10-19' }), pages, vals({ '2026-10-19': 1 }), TODAY).status).toBe('on_track');
    expect(goalProgress(goal({ target: 30 }), pages, vals(fast), TODAY).status).toBe('ahead');
    expect(goalProgress(goal({ target: 80 }), pages, vals(fast), TODAY).status).toBe('on_track');
    expect(goalProgress(goal({ target: 400 }), pages, vals(fast), TODAY).status).toBe('behind');
  });

  it('says what is needed, and when you would finish when on track', () => {
    const p = goalProgress(goal({ target: 40 }), pages, vals(fast), TODAY);
    expect(p.etaDate! > TODAY && p.etaDate! < '2026-12-31').toBe(true);
    expect(p.message).toMatch(/a day/);
    const behind = goalProgress(goal({ target: 400 }), pages, vals(fast), TODAY);
    expect(behind.message).toMatch(/would reach/);
    expect(behind.needPerDay).toBeGreaterThan(behind.pace);
  });

  it('a goal marked complete is done even below the target', () => {
    expect(goalProgress(goal({ completedAt: '2026-10-10T00:00:00Z' }), pages, vals({}), TODAY).status).toBe('done');
  });
});
