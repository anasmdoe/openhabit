// Signed one-tap action links: the buttons on a reminder notification must
// work from a phone without a login, so each link carries an HMAC signature
// over (action, habit, local date, extra, expiry). Copied verbatim into the
// services that sign or verify them as src/actions.js — keep the copies
// identical (CI checks).
import crypto from 'node:crypto';

const b64url = (buf) => Buffer.from(buf).toString('base64url');
const actionKey = (secret) => crypto.createHmac('sha256', secret).update('openhabit:reminder-action:v1').digest();
const sign = (secret, payload) => crypto.createHmac('sha256', actionKey(secret)).update(payload).digest();

/** Token for `action` ('snooze', 'done', ...) on one habit's local date; `minutes` is optional. */
export function signAction(secret, { action, habitId, date, minutes, expiresAt }) {
  const body = { a: action, h: habitId, d: date, e: Math.floor(expiresAt / 1000) };
  if (minutes !== undefined) body.m = minutes;
  const payload = b64url(JSON.stringify(body));
  return `${payload}.${b64url(sign(secret, payload))}`;
}

/** Returns { habitId, date, minutes } for a valid, unexpired token of that action, else null. */
export function verifyAction(secret, token, action, now = Date.now()) {
  const [payload, sig, extra] = String(token).split('.');
  if (!payload || !sig || extra !== undefined) return null;
  const expected = sign(secret, payload);
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  let data;
  try { data = JSON.parse(Buffer.from(payload, 'base64url').toString()); } catch { return null; }
  if (!data || data.a !== action || typeof data.e !== 'number' || data.e * 1000 < now) return null;
  if (typeof data.h !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.d)) return null;
  return { habitId: data.h, date: data.d, minutes: data.m };
}
