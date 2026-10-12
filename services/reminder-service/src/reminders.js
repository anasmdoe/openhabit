// Pure reminder rules (no I/O), unit-tested in reminders.test.js.
import crypto from 'crypto';

// A reminder may go out up to this many minutes after its time, so a restart
// or a slow tick doesn't lose it. reminders_sent keeps it to one per day.
export const CATCH_UP_MINUTES = Number(process.env.REMINDER_CATCH_UP_MINUTES) || 15;
export const SNOOZE_CHOICES = [30, 60];

const toMinutes = (hm) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));

/** True when `nowHm` is at or up to CATCH_UP_MINUTES after `reminderHm` (same day). */
export function isDue(reminderHm, nowHm) {
  const late = toMinutes(nowHm) - toMinutes(reminderHm);
  return late >= 0 && late < CATCH_UP_MINUTES;
}

/** Quiet window [start, end) in local 'HH:MM'; wraps midnight when start > end. Empty = off. */
export function inQuietHours(nowHm, start, end) {
  if (!start || !end || start === end) return false;
  const n = toMinutes(nowHm);
  const s = toMinutes(start);
  const e = toMinutes(end);
  return s < e ? n >= s && n < e : n >= s || n < e;
}

// ---- signed snooze links ---------------------------------------------------
// The link in the ntfy notification must work from a phone without a login,
// so it carries its own HMAC signature over (habit, local date, minutes, expiry).
const b64url = (buf) => Buffer.from(buf).toString('base64url');
const actionKey = (secret) => crypto.createHmac('sha256', secret).update('openhabit:reminder-action:v1').digest();

export function signSnooze(secret, { habitId, date, minutes, expiresAt }) {
  const payload = b64url(JSON.stringify({ h: habitId, d: date, m: minutes, e: Math.floor(expiresAt / 1000) }));
  const sig = b64url(crypto.createHmac('sha256', actionKey(secret)).update(payload).digest());
  return `${payload}.${sig}`;
}

/** Returns { habitId, date, minutes } for a valid, unexpired token, else null. */
export function verifySnooze(secret, token, now = Date.now()) {
  const [payload, sig, extra] = String(token).split('.');
  if (!payload || !sig || extra !== undefined) return null;
  const expected = crypto.createHmac('sha256', actionKey(secret)).update(payload).digest();
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  let data;
  try { data = JSON.parse(Buffer.from(payload, 'base64url').toString()); } catch { return null; }
  if (!data || typeof data.e !== 'number' || data.e * 1000 < now) return null;
  if (!SNOOZE_CHOICES.includes(data.m) || typeof data.h !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.d)) return null;
  return { habitId: data.h, date: data.d, minutes: data.m };
}

/** ntfy `Actions` header value: one HTTP button per snooze choice. */
export function snoozeActions(publicUrl, tokens) {
  const base = publicUrl.replace(/\/+$/, '');
  return SNOOZE_CHOICES
    .map((m) => `http, Snooze ${m < 60 ? `${m} min` : `${m / 60} h`}, ${base}/api/reminders/snooze/${tokens[m]}, method=POST, clear=true`)
    .join('; ');
}
