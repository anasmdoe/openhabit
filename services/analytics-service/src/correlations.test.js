import test from 'node:test';
import assert from 'node:assert/strict';
import { correlations } from './correlations.js';

const habits = [
  { id: 'g', name: 'Gym', color: '#fff', icon: '', kind: 'build' },
  { id: 'm', name: 'Meditation', color: '#fff', icon: '', kind: 'build' },
  { id: 'n', name: 'Noise', color: '#fff', icon: '', kind: 'build' },
];
// deterministic jitter
let s = 7;
const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

function build(n, fn) {
  return Array.from({ length: n }, (_, i) => fn(i));
}

test('finds longer sleep on gym days and says how much', () => {
  const days = build(60, (i) => {
    const gym = i % 2 === 0;
    return { date: `d${i}`, done: { g: gym }, sleep: (gym ? 7.7 : 7.0) + (rnd() - 0.5) * 0.3 };
  });
  const r = correlations(habits, days);
  const sleep = r.find((x) => x.kind === 'sleep');
  assert.ok(sleep);
  assert.equal(sleep.name, 'Gym');
  assert.match(sleep.text, /sleep (4\d) minutes longer/);
});

test('says nothing with too little data', () => {
  const days = build(10, (i) => ({ date: `d${i}`, done: { g: i % 2 === 0 }, sleep: i % 2 ? 6 : 8 }));
  assert.deepEqual(correlations(habits, days), []);
});

test('ignores noise: no relation, no pattern', () => {
  const days = build(120, (i) => ({ date: `d${i}`, done: { g: rnd() > 0.5, n: rnd() > 0.5 }, sleep: 7 + (rnd() - 0.5) * 2 }));
  assert.deepEqual(correlations(habits, days), []);
});

test('links habits that go together, once per pair', () => {
  const days = build(80, (i) => {
    const m = rnd() > 0.5;
    return { date: `d${i}`, done: { m, g: m ? rnd() > 0.15 : rnd() > 0.8 } };
  });
  const r = correlations(habits, days).filter((x) => x.kind === 'pair');
  assert.equal(r.length, 1);
  assert.ok(r[0].diff >= 15);
});

test('days a habit was not scheduled or skipped are left out', () => {
  const days = build(40, (i) => ({ date: `d${i}`, done: i < 20 ? { g: i % 2 === 0 } : {}, sleep: i % 2 === 0 ? 8 : 6 }));
  const r = correlations(habits, days).find((x) => x.kind === 'sleep');
  assert.ok(r);
  assert.equal(r.nDone + r.nMissed, 20);
});
