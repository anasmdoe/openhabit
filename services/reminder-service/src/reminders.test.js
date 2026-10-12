import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDue, inQuietHours, signSnooze, verifySnooze, snoozeActions } from './reminders.js';

test('isDue: from the reminder minute through the 15-minute catch-up window', () => {
  assert.equal(isDue('08:00', '07:59'), false);
  assert.equal(isDue('08:00', '08:00'), true);
  assert.equal(isDue('08:00', '08:14'), true);
  assert.equal(isDue('08:00', '08:15'), false);
  assert.equal(isDue('23:50', '00:01'), false); // no wrap: a new local day starts fresh
});

test('inQuietHours: same-day and overnight windows, off when unset', () => {
  assert.equal(inQuietHours('12:00', '', ''), false);
  assert.equal(inQuietHours('12:00', '09:00', '09:00'), false);
  assert.equal(inQuietHours('13:00', '12:00', '14:00'), true);
  assert.equal(inQuietHours('14:00', '12:00', '14:00'), false); // end is exclusive
  assert.equal(inQuietHours('23:30', '22:00', '07:00'), true);
  assert.equal(inQuietHours('06:59', '22:00', '07:00'), true);
  assert.equal(inQuietHours('07:00', '22:00', '07:00'), false);
  assert.equal(inQuietHours('12:00', '22:00', '07:00'), false);
});

const SECRET = 'x'.repeat(48);
const snooze = { habitId: '1cb18850-120d-407c-9273-939e2dff75c0', date: '2026-10-12', minutes: 30 };

test('snooze tokens round-trip', () => {
  const t = signSnooze(SECRET, { ...snooze, expiresAt: Date.now() + 60_000 });
  assert.deepEqual(verifySnooze(SECRET, t), snooze);
  assert.doesNotMatch(t, /[=,;\s]/); // safe inside an ntfy Actions header
});

test('snooze tokens reject tampering, other secrets, expiry and odd durations', () => {
  const t = signSnooze(SECRET, { ...snooze, expiresAt: Date.now() + 60_000 });
  const [payload, sig] = t.split('.');
  const forged = Buffer.from(JSON.stringify({ h: 'other-habit', d: snooze.date, m: 30, e: 9e9 })).toString('base64url');
  assert.equal(verifySnooze(SECRET, `${forged}.${sig}`), null);
  assert.equal(verifySnooze(SECRET, `${payload}.${sig}x`), null);
  assert.equal(verifySnooze(SECRET, `${payload}`), null);
  assert.equal(verifySnooze(SECRET, `${t}.extra`), null);
  assert.equal(verifySnooze('y'.repeat(48), t), null);
  assert.equal(verifySnooze(SECRET, t, Date.now() + 120_000), null);
  const odd = signSnooze(SECRET, { ...snooze, minutes: 5, expiresAt: Date.now() + 60_000 });
  assert.equal(verifySnooze(SECRET, odd), null);
});

test('snoozeActions builds one ntfy HTTP button per choice', () => {
  const header = snoozeActions('https://habits.example.com/', { 30: 'aaa.bbb', 60: 'ccc.ddd' });
  assert.equal(header,
    'http, Snooze 30 min, https://habits.example.com/api/reminders/snooze/aaa.bbb, method=POST, clear=true; '
    + 'http, Snooze 1 h, https://habits.example.com/api/reminders/snooze/ccc.ddd, method=POST, clear=true');
});
