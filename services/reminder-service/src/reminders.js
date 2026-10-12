// Pure reminder rules (no I/O), unit-tested in reminders.test.js.
import { signAction, verifyAction } from './actions.js';

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

// ---- notification buttons --------------------------------------------------
// Signed links (see actions.js) so they work from a phone without a login.

export function signSnooze(secret, { habitId, date, minutes, expiresAt }) {
  return signAction(secret, { action: 'snooze', habitId, date, minutes, expiresAt });
}

/** Returns { habitId, date, minutes } for a valid, unexpired snooze token, else null. */
export function verifySnooze(secret, token, now = Date.now()) {
  const s = verifyAction(secret, token, 'snooze', now);
  return s && SNOOZE_CHOICES.includes(s.minutes) ? s : null;
}

export function signDone(secret, { habitId, date, expiresAt }) {
  return signAction(secret, { action: 'done', habitId, date, expiresAt });
}

const snoozeLabel = (m) => `Snooze ${m < 60 ? `${m} min` : `${m / 60} h`}`;

/**
 * ntfy `Actions` header value (ntfy shows at most 3 buttons, ASCII labels only):
 *   yes/no habits: Done, Snooze 30 min, Open
 *   numeric habits (a value is needed, so no Done): Snooze 30 min, Snooze 1 h, Open
 */
export function notificationActions(publicUrl, { doneToken, snoozeTokens }) {
  const base = publicUrl.replace(/\/+$/, '');
  const snooze = (m) => `http, ${snoozeLabel(m)}, ${base}/api/reminders/snooze/${snoozeTokens[m]}, method=POST, clear=true`;
  const buttons = doneToken
    ? [`http, Done, ${base}/api/entries/done/${doneToken}, method=POST, clear=true`, snooze(SNOOZE_CHOICES[0])]
    : SNOOZE_CHOICES.map(snooze);
  buttons.push(`view, Open, ${base}/`);
  return buttons.join('; ');
}
