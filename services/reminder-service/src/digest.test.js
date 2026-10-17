import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDigest, defaultWeek, digestMessage, mondayOf, weekScore } from './digest.js';
import { addDays } from './streaks.js';

// Sunday 2026-10-18; the week under review is Mon 12 .. Sun 18 Oct
const TODAY = '2026-10-18';
const WEEK = '2026-10-12';

const habit = (id, over = {}) => ({
  id, name: id, type: 'boolean', target: 1, targetType: 'at_least', scheduleType: 'weekdays', frequency: 3,
  activeDays: [0, 1, 2, 3, 4, 5, 6], kind: 'build', streakFreezes: 1, createdDate: '2026-06-01', ...over,
});
/** vals: day offsets from WEEK (0 = Monday) that are done (value 1); skip = -1 offsets */
const values = (done = [], skipped = [], extra = {}) => new Map([
  ...done.map((n) => [addDays(WEEK, n), 1]),
  ...skipped.map((n) => [addDays(WEEK, n), -1]),
  ...Object.entries(extra),
]);
const all = (h, arr) => new Map([[h.id, values(arr)]]);

test('week helpers', () => {
  assert.equal(mondayOf('2026-10-18'), '2026-10-12');
  assert.equal(mondayOf('2026-10-12'), '2026-10-12');
  assert.equal(defaultWeek('2026-10-18'), '2026-10-12'); // Sunday: the week that is ending
  assert.equal(defaultWeek('2026-10-14'), '2026-10-05'); // midweek: the last complete week
});

test('a daily habit scores done over scheduled, skips excluded, open today not counted', () => {
  const h = habit('read');
  assert.deepEqual(weekScore(h, values([0, 1, 2, 3, 4, 5, 6]), WEEK, TODAY), { done: 7, goal: 7 });
  assert.deepEqual(weekScore(h, values([0, 1, 2, 3], [4]), WEEK, TODAY), { done: 4, goal: 5 }); // Sunday (today) is still open
  assert.deepEqual(weekScore(h, values([0, 1, 2, 3, 4, 5]), WEEK, TODAY), { done: 6, goal: 6 });
  // mid-week review: Wednesday still open
  assert.deepEqual(weekScore(h, values([0, 1]), WEEK, '2026-10-14'), { done: 2, goal: 2 });
});

test('weekly-quota habits are capped at the quota and quit habits count clean days', () => {
  const gym = habit('gym', { scheduleType: 'per_week', frequency: 3 });
  assert.deepEqual(weekScore(gym, values([0, 1, 2, 3, 4]), WEEK, TODAY), { done: 3, goal: 3 });
  const quit = habit('quit', { kind: 'quit' });
  assert.deepEqual(weekScore(quit, values([2]), WEEK, TODAY), { done: 6, goal: 7 }); // one slip
});

test('the digest picks the strongest habit, the one with most room, and compares with the week before', () => {
  const read = habit('read');
  const run = habit('run');
  const prev = [-7, -6, -5, -4]; // last week: read done 4 of 7
  const vals = new Map([
    [read.id, values([0, 1, 2, 3, 4, 5, 6, ...prev])],
    [run.id, values([0, 1, 2])],
  ]);
  const d = buildDigest({ habits: [read, run], valuesByHabit: vals, weekStart: WEEK, today: TODAY });
  assert.equal(d.enough, true);
  assert.equal(d.overall.pct, 77); // 10 of 13: Sunday (today) is still open for run
  assert.equal(d.best.name, 'read');
  assert.equal(d.attention.name, 'run');
  assert.equal(d.overall.prevPct, 29); // 4 of 14 the week before
  assert.equal(d.overall.delta, 48);
  assert.equal(d.perfectDays, 3);
  assert.equal(d.streak.name, 'read');
  assert.ok(d.streak.length >= 7);
});

test('a frozen day shows up and keeps the streak', () => {
  const read = habit('read');
  const vals = new Map([[read.id, values([0, 1, 2, 4, 5, 6])]]); // missed Thursday (offset 3)
  const d = buildDigest({ habits: [read], valuesByHabit: vals, weekStart: WEEK, today: TODAY });
  assert.equal(d.freezesUsed, 1);
  assert.equal(d.streak.length, 6);
  assert.match(digestMessage(d).text, /streak freeze saved a day/);
});

test('too little data gives a gentle message instead of numbers', () => {
  const read = habit('read', { createdDate: '2026-10-17' });
  const d = buildDigest({ habits: [read], valuesByHabit: new Map([[read.id, values([5, 6])]]), weekStart: WEEK, today: TODAY });
  assert.equal(d.enough, false);
  const m = digestMessage(d, { name: 'Anas' });
  assert.match(m.text, /quiet week/i);
  assert.doesNotMatch(m.text, /%/);
});

test('the message is specific and never scolding', () => {
  const read = habit('read');
  const run = habit('run');
  const vals = new Map([[read.id, values([0, 1, 2, 3, 4, 5, 6])], [run.id, values([0])]]);
  const m = digestMessage(buildDigest({ habits: [read, run], valuesByHabit: vals, weekStart: WEEK, today: TODAY }), { name: 'Anas', appUrl: 'https://habits.example.com' });
  assert.match(m.subject, /^Your week: \d+%$/);
  assert.match(m.text, /Strongest: read/);
  assert.match(m.text, /Most room: run/);
  assert.match(m.text, /https:\/\/habits\.example\.com/);
  assert.doesNotMatch(m.text, /fail|lazy|bad/i);
  assert.ok(m.pushBody.length < 90);
});
