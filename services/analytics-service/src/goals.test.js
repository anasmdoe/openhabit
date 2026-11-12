import { test } from 'node:test';
import assert from 'node:assert/strict';
import { goalProgress } from './goals.js';
import { addDays } from './streaks.js';

const TODAY = '2026-10-20';
const books = { type: 'numeric', kind: 'build', target: 1, targetType: 'at_least', createdDate: '2026-01-01', activeDays: [0, 1, 2, 3, 4, 5, 6], scheduleType: 'weekdays' };
const gym = { type: 'boolean', kind: 'build', target: 1, targetType: 'at_least', createdDate: '2026-01-01', activeDays: [0, 1, 2, 3, 4, 5, 6], scheduleType: 'weekdays' };
const goal = (over = {}) => ({ id: 'g', title: 'Read', target: 20, unit: 'books', startDate: '2026-10-01', deadline: '2026-12-31', completedAt: null, ...over });
const vals = (m) => (d) => m[d];

test('a measurable habit sums its values since the start; skips and negatives are ignored', () => {
  const v = { '2026-09-30': 5, '2026-10-02': 2, '2026-10-05': 3, '2026-10-06': -1, '2026-10-21': 4 };
  const p = goalProgress(goal(), books, vals(v), TODAY);
  assert.equal(p.measure, 'sum');
  assert.equal(p.current, 5);       // before the start and after today do not count
  assert.equal(p.remaining, 15);
  assert.equal(p.pct, 25);
});

test('a yes/no habit counts completed days', () => {
  const v = { '2026-10-03': 1, '2026-10-04': 1, '2026-10-05': 0, '2026-10-06': 1 };
  const p = goalProgress(goal({ target: 30, unit: '' }), gym, vals(v), TODAY);
  assert.equal(p.measure, 'days');
  assert.equal(p.current, 3);
  assert.match(p.message, /days/);
});

test('status: done, missed, upcoming, early, ahead, on track, behind', () => {
  const fast = Object.fromEntries(Array.from({ length: 14 }, (_, i) => [addDays(TODAY, -i), 1]));      // 1 a day
  // 20 days since Oct 1 at 1/day = 20 reached
  assert.equal(goalProgress(goal({ target: 20 }), books, vals(Object.fromEntries(Array.from({ length: 20 }, (_, i) => [addDays('2026-10-01', i), 1]))), TODAY).status, 'done');
  assert.equal(goalProgress(goal({ deadline: '2026-10-10' }), books, vals({}), TODAY).status, 'missed');
  assert.equal(goalProgress(goal({ startDate: '2026-11-01' }), books, vals({}), TODAY).status, 'upcoming');
  assert.equal(goalProgress(goal({ startDate: '2026-10-19' }), books, vals({ '2026-10-19': 1 }), TODAY).status, 'on_track'); // too early to judge
  assert.equal(goalProgress(goal({ target: 30 }), books, vals(fast), TODAY).status, 'ahead');      // ~14 + 72 = 86 projected vs 30
  assert.equal(goalProgress(goal({ target: 80 }), books, vals(fast), TODAY).status, 'on_track');   // projected 87 vs 80
  assert.equal(goalProgress(goal({ target: 400 }), books, vals(fast), TODAY).status, 'behind');
});

test('the message says what is needed and, on track, when you would finish', () => {
  const fast = Object.fromEntries(Array.from({ length: 14 }, (_, i) => [addDays(TODAY, -i), 1]));
  const p = goalProgress(goal({ target: 40 }), books, vals(fast), TODAY);
  assert.ok(p.etaDate && p.etaDate > TODAY && p.etaDate < '2026-12-31');
  assert.match(p.message, /a day/);
  const behind = goalProgress(goal({ target: 400 }), books, vals(fast), TODAY);
  assert.match(behind.message, /would reach/);
  assert.ok(behind.needPerDay > behind.pace);
});

test('manual completion marks a goal done even below the target', () => {
  assert.equal(goalProgress(goal({ completedAt: '2026-10-10T00:00:00Z' }), books, vals({}), TODAY).status, 'done');
});
