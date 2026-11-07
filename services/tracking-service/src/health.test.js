import test from 'node:test';
import assert from 'node:assert/strict';
import { checkDay, valueFor } from './health.js';

const yesNo = { type: 'boolean', kind: 'build', autoMetric: 'steps', autoThreshold: 8000 };
const numeric = { type: 'numeric', kind: 'build', autoMetric: 'exercise_minutes', autoThreshold: null };

test('a yes/no habit is done once the metric reaches its threshold', () => {
  assert.equal(valueFor(yesNo, 8000), 1);
  assert.equal(valueFor(yesNo, 12000), 1);
  assert.equal(valueFor(yesNo, 7999), null);
});

test('without a threshold, any amount completes a yes/no habit', () => {
  assert.equal(valueFor({ ...yesNo, autoThreshold: null }, 1), 1);
  assert.equal(valueFor({ ...yesNo, autoThreshold: null }, 0), null);
});

test('a measurable habit takes the metric as its value', () => {
  assert.equal(valueFor(numeric, 42.456), 42.46);
  assert.equal(valueFor(numeric, 0), null);
});

test('quit habits and habits without a metric are never written', () => {
  assert.equal(valueFor({ ...yesNo, kind: 'quit' }, 9000), null);
  assert.equal(valueFor({ ...yesNo, autoMetric: '' }, 9000), null);
  assert.equal(valueFor(yesNo, undefined), null);
});

test('days are validated', () => {
  assert.equal(checkDay({ date: '2026-11-07', metrics: { steps: 9000, sleep_hours: 7.5 } }), null);
  assert.match(checkDay({ date: 'yesterday', metrics: {} }), /date/);
  assert.match(checkDay({ date: '2026-11-07', metrics: { heartbeats: 3 } }), /unknown metric/);
  assert.match(checkDay({ date: '2026-11-07', metrics: { sleep_hours: 30 } }), /0 to 24/);
  assert.match(checkDay({ date: '2026-11-07', metrics: { steps: -1 } }), /steps/);
});
