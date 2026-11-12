// reminder-service: checks every minute for habits whose local reminder time
// has arrived and that are due today but not yet logged, then pushes to the
// user's ntfy topic. Sends are recorded in reminders_sent (one per habit per
// local day), so restarts and extra replicas never double-send. Public API:
// POST /reminders/snooze/:token, the signed link behind the notification's
// snooze buttons.
import express from 'express';
import pg from 'pg';
import { metricsHandler, registerCustom } from './metrics.js';
import { isDue, inQuietHours, signSnooze, verifySnooze, signDone, notificationActions, SNOOZE_CHOICES } from './reminders.js';
import { sendPush } from './webpush.js';
import { mailEnabled, sendMail, PUBLIC_URL as MAIL_PUBLIC_URL } from './mailer.js';
import { buildDigest, defaultWeek, digestMessage } from './digest.js';

const PORT = process.env.PORT || 3006;
const TICK_MS = parseInt(process.env.TICK_MS, 10) || 60_000;
// Where phones reach the app (e.g. https://habits.example.com). Without it the
// notifications carry no snooze buttons, since the links would be unreachable.
const PUBLIC_URL = (process.env.PUBLIC_URL || '').trim();

// Web Push (reminders straight to the installed app/browser): enabled when the
// VAPID key pair is set (scripts/init-env.sh generates one).
const VAPID = process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY ? {
  publicKey: process.env.VAPID_PUBLIC_KEY,
  privateKey: process.env.VAPID_PRIVATE_KEY,
  subject: process.env.VAPID_SUBJECT || (/^https:/.test(PUBLIC_URL) ? PUBLIC_URL : 'mailto:openhabit@localhost'),
} : null;

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32 || /change-me/i.test(JWT_SECRET)) {
  console.error('FATAL: JWT_SECRET must be a random string of at least 32 characters, shared by all services (e.g. `openssl rand -base64 48`).');
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://openhabit:openhabit@localhost:5432/openhabit',
  max: Number(process.env.PG_POOL_MAX) || 5,
});

// ---- timezone-aware "now" ------------------------------------------------
const DOW = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function localNow(timeZone) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', weekday: 'short',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    }).formatToParts(new Date());
    const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
    return {
      date: `${p.year}-${p.month}-${p.day}`,
      hm: `${p.hour}:${p.minute}`,
      dow: DOW[p.weekday] ?? 0,
    };
  } catch {
    return localNow('UTC'); // unknown tz stored somehow: fall back
  }
}

const addDaysISO = (s, n) => {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// Monday of the week containing the given local date
function weekStart(dateStr, dowOfDate) {
  return addDaysISO(dateStr, -((dowOfDate + 6) % 7));
}

const isCompletedVal = (h, v) => {
  if (v == null || v === -1) return false;
  if (h.type === 'boolean') return v >= 1;
  return h.target_type === 'at_most' ? v <= h.target : v >= h.target;
};

// ---- metrics ---------------------------------------------------------------
const ticksTotal = registerCustom('openhabit_reminder_ticks_total', 'Reminder loop ticks executed.', 'counter');
const remindersSent = registerCustom('openhabit_reminders_sent_total', 'Reminder notifications pushed.', 'counter');
const snoozesTotal = registerCustom('openhabit_reminder_snoozes_total', 'Reminders snoozed from a notification.', 'counter');
const tickErrors = registerCustom('openhabit_reminder_tick_errors_total', 'Reminder ticks that threw.', 'counter');
const lastTickGauge = registerCustom('openhabit_reminder_last_tick_timestamp', 'Unix time of the last completed tick.', 'gauge');

// One log line per push (habit id and outcome only; topic URLs and push
// endpoints stay out of logs): the way to see delivery problems where /metrics
// isn't scraped (AWS).
function notifyNtfy(habitId, url, title, message, actions, tags = 'alarm_clock') {
  remindersSent.inc();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 4000);
  return fetch(url, {
    method: 'POST',
    headers: { Title: title, Priority: 'default', Tags: tags, ...(actions ? { Actions: actions } : {}) },
    body: message,
    signal: ctrl.signal,
  })
    .then((r) => console.log(`reminder push habit=${habitId} status=${r.status}`))
    .catch((e) => console.warn(`reminder push habit=${habitId} failed: ${e.name === 'AbortError' ? 'timeout' : e.message}`))
    .finally(() => clearTimeout(t));
}

async function notifyWebPush(habitId, sub, payload) {
  remindersSent.inc();
  try {
    const status = await sendPush(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, VAPID,
      { ttl: 6 * 3600, urgency: 'high' });
    console.log(`reminder webpush habit=${habitId} status=${status}`);
    // the browser unsubscribed or the subscription expired: forget it
    if (status === 404 || status === 410) await pool.query('DELETE FROM push_subscriptions WHERE id = $1', [sub.id]);
  } catch (e) {
    console.warn(`reminder webpush habit=${habitId} failed: ${e.name === 'AbortError' ? 'timeout' : e.message}`);
  }
}

/** Signed one-tap links for a reminder (Done only for yes/no habits; numeric ones need a value). */
function linksFor(h, date) {
  const habitId = h.id;
  const expiresAt = Date.now() + 24 * 3_600_000;
  return {
    doneToken: h.type === 'boolean' ? signDone(JWT_SECRET, { habitId, date, expiresAt }) : null,
    snoozeTokens: Object.fromEntries(SNOOZE_CHOICES.map((minutes) =>
      [minutes, signSnooze(JWT_SECRET, { habitId, date, minutes, expiresAt })])),
  };
}

/** Sends one reminder to the user's ntfy topic and to every Web Push subscription. */
async function deliver(h, date, title, message) {
  const links = linksFor(h, date);
  const sends = [];
  // ntfy buttons need absolute URLs the phone can reach
  if (h.ntfy_url) sends.push(notifyNtfy(h.id, h.ntfy_url, title, message, PUBLIC_URL ? notificationActions(PUBLIC_URL, links) : undefined));
  if (VAPID) {
    const { rows: subs } = await pool.query(
      'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1', [h.user_id]);
    // the service worker calls these same-origin paths (browsers show at most 2 buttons)
    const actions = links.doneToken
      ? [{ action: 'done', title: 'Done', url: `/api/entries/done/${links.doneToken}` },
        { action: 'snooze', title: 'Snooze 30 min', url: `/api/reminders/snooze/${links.snoozeTokens[30]}` }]
      : SNOOZE_CHOICES.map((m) => ({
        action: `snooze${m}`, title: m < 60 ? `Snooze ${m} min` : `Snooze ${m / 60} h`, url: `/api/reminders/snooze/${links.snoozeTokens[m]}`,
      }));
    const payload = { title, body: message, tag: `habit-${h.id}`, url: '/', actions };
    for (const sub of subs) sends.push(notifyWebPush(h.id, sub, payload));
  }
  await Promise.all(sends);
}

/** Message for a habit that still needs doing today, or null if it's done/skipped/quota met. */
async function pendingMessage(h, now) {
  if (h.schedule_type === 'per_week') {
    const ws = weekStart(now.date, now.dow);
    const { rows: ent } = await pool.query(
      `SELECT date::text AS date, value::float AS value FROM entries
       WHERE habit_id = $1 AND date BETWEEN $2 AND $3`,
      [h.id, ws, now.date]
    );
    const doneThisWeek = ent.filter((e) => isCompletedVal(h, e.value)).length;
    const today = ent.find((e) => e.date === now.date)?.value;
    if (doneThisWeek >= h.frequency || isCompletedVal(h, today) || today === -1) return null;
    const left = h.frequency - doneThisWeek;
    return `${h.name}: ${left} more time${left === 1 ? '' : 's'} this week — today counts.`;
  }

  // fixed-day: only when scheduled today
  if (!h.active_days.includes(now.dow)) return null;
  const { rows: ent } = await pool.query(
    `SELECT value::float AS value FROM entries WHERE habit_id = $1 AND date = $2`,
    [h.id, now.date]
  );
  const v = ent[0]?.value;
  if (isCompletedVal(h, v) || v === -1) return null;
  return h.type === 'numeric'
    ? `${h.name}: ${v != null ? `${v}/${h.target}` : `0/${h.target}`}${h.unit ? ` ${h.unit}` : ''} — still time today.`
    : `Don't break the chain — ${h.name} isn't logged yet.`;
}


// ---- weekly review -----------------------------------------------------------
// Opt-in (users.weekly_review). On Sunday evening, local time (18:00 to 22:00, so a missed tick
// still sends), each opted-in user gets one digest of the week that is ending: Web Push, ntfy and email.
// The send is claimed in weekly_reviews_sent first, so replicas and retries never double-send.
const REVIEW_FROM = '18:00';
const REVIEW_UNTIL = '22:00';
const CLOCK = process.env.OPENHABIT_TEST_CLOCK; // tests only: a fixed UTC "now" for the review, e.g. 2026-10-18T19:00:00Z

function reviewNow(timeZone) {
  if (!CLOCK) return localNow(timeZone);
  const d = new Date(CLOCK);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}`, dow: DOW[p.weekday] ?? 0 };
}

async function loadDigest(userId, weekStart, today) {
  const { rows: habits } = await pool.query(
    `SELECT h.id, h.name, h.type, h.target::float AS target, h.target_type AS "targetType",
            h.schedule_type AS "scheduleType", h.frequency, h.active_days AS "activeDays", h.kind,
            h.streak_freezes AS "streakFreezes",
            to_char(LEAST(h.created_at::date, COALESCE((SELECT MIN(e.date) FROM entries e WHERE e.habit_id = h.id), h.created_at::date)), 'YYYY-MM-DD') AS "createdDate"
     FROM habits h WHERE h.user_id = $1 AND NOT h.archived`, [userId]);
  const from = addDaysISO(weekStart, -130);
  const { rows: ents } = await pool.query(
    `SELECT e.habit_id AS "habitId", to_char(e.date, 'YYYY-MM-DD') AS date, e.value::float AS value
     FROM entries e JOIN habits h ON h.id = e.habit_id
     WHERE h.user_id = $1 AND e.date BETWEEN $2 AND $3`, [userId, from, today]);
  const valuesByHabit = new Map();
  for (const e of ents) {
    if (!valuesByHabit.has(e.habitId)) valuesByHabit.set(e.habitId, new Map());
    valuesByHabit.get(e.habitId).set(e.date, e.value);
  }
  return buildDigest({ habits, valuesByHabit, weekStart, today });
}

export async function weeklyReviews() {
  const { rows: users } = await pool.query(
    'SELECT id, email, name, timezone, ntfy_url, quiet_start, quiet_end FROM users WHERE weekly_review');
  for (const u of users) {
    const now = reviewNow(u.timezone);
    if (now.dow !== 0 || now.hm < REVIEW_FROM || now.hm > REVIEW_UNTIL) continue;
    if (inQuietHours(now.hm, u.quiet_start, u.quiet_end)) continue;
    const weekStartDate = defaultWeek(now.date);
    const claim = await pool.query(
      'INSERT INTO weekly_reviews_sent (user_id, week_start) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING 1', [u.id, weekStartDate]);
    if (!claim.rowCount) continue;
    try {
      const msg = digestMessage(await loadDigest(u.id, weekStartDate, now.date), { name: u.name, appUrl: MAIL_PUBLIC_URL || PUBLIC_URL });
      const sends = [];
      if (u.ntfy_url) sends.push(notifyNtfy('weekly-review', u.ntfy_url, msg.pushTitle, msg.pushBody, undefined, 'chart_with_upwards_trend'));
      if (VAPID) {
        const { rows: subs } = await pool.query('SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1', [u.id]);
        for (const sub of subs) sends.push(notifyWebPush('weekly-review', sub, { title: msg.pushTitle, body: msg.pushBody, tag: 'weekly-review', url: '/', actions: [] }));
      }
      if (mailEnabled && u.email) {
        sends.push(sendMail({ to: u.email, subject: msg.subject, text: msg.text })
          .then(() => console.log('weekly review email sent'))
          .catch((e) => console.warn(`weekly review email failed: ${e.message}`)));
      }
      await Promise.all(sends);
    } catch (e) {
      console.error(`weekly review failed: ${e.message}`);
    }
  }
}
// ---- the tick --------------------------------------------------------------
export async function tick() {
  await weeklyReviews().catch((e) => console.error('weekly reviews failed:', e.message));
  const { rows } = await pool.query(
    `SELECT h.id, h.user_id, h.name, h.type, h.unit, h.target::float AS target, h.target_type,
            h.schedule_type, h.frequency, h.active_days, h.reminder_time, h.cue,
            (SELECT a.name FROM habits a WHERE a.id = h.after_habit_id) AS after_name,
            u.ntfy_url, u.timezone, u.quiet_start, u.quiet_end
     FROM habits h
     JOIN users u ON u.id = h.user_id
     WHERE NOT h.archived AND h.reminder_time <> '' AND h.kind = 'build'
       AND (u.ntfy_url <> '' OR EXISTS (SELECT 1 FROM push_subscriptions ps WHERE ps.user_id = u.id))`
  );
  if (!rows.length) return;

  // today's (and yesterday's, for far-east/west zones) bookkeeping rows
  const { rows: sentRows } = await pool.query(
    `SELECT habit_id, slot, local_date::text AS date, snoozed_until <= now() AS snooze_due
     FROM reminders_sent WHERE local_date >= current_date - 1`
  );
  const sent = new Map(sentRows.map((r) => [`${r.habit_id}|${r.date}|${r.slot}`, r]));

  // a habit has up to 3 reminder times; each is its own slot, claimed once a day
  const slots = rows.flatMap((h) => h.reminder_time.split(',').map((time, slot) => ({ h, time, slot })));
  for (const { h, time, slot } of slots) {
    const now = localNow(h.timezone);
    const row = sent.get(`${h.id}|${now.date}|${slot}`);
    const snoozed = Boolean(row?.snooze_due);
    if (row ? !snoozed : !isDue(time, now.hm)) continue;
    // Quiet hours hold reminders back; a snoozed one goes out once they end.
    if (inQuietHours(now.hm, h.quiet_start, h.quiet_end)) continue;

    const msg = await pendingMessage(h, now);
    if (!msg) {
      // logged in the meantime: drop the snooze so we stop re-checking it
      if (snoozed) await pool.query(
        'UPDATE reminders_sent SET snoozed_until = NULL WHERE habit_id = $1 AND local_date = $2 AND slot = $3',
        [h.id, now.date, slot]);
      continue;
    }

    // Claim the send first; only the instance whose claim succeeds pushes.
    const claim = snoozed
      ? await pool.query(
        `UPDATE reminders_sent SET snoozed_until = NULL, sent_at = now()
         WHERE habit_id = $1 AND local_date = $2 AND slot = $3 AND snoozed_until <= now() RETURNING 1`, [h.id, now.date, slot])
      : await pool.query(
        `INSERT INTO reminders_sent (habit_id, local_date, slot) VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING RETURNING 1`, [h.id, now.date, slot]);
    if (!claim.rowCount) continue;

    await deliver(h, now.date, snoozed ? 'OpenHabit (snoozed)' : 'OpenHabit', [msg, h.after_name ? `After ${h.after_name}` : '', h.cue].filter(Boolean).join('\n'));
  }
}

async function pruneSent() {
  await pool.query(`DELETE FROM reminders_sent WHERE local_date < current_date - 7`);
}

// ---- http: health, metrics, snooze links -----------------------------------
const app = express();
app.get('/metrics', await metricsHandler(pool, 'reminder-service'));
app.get('/healthz', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', service: 'reminder-service' });
  } catch {
    res.status(500).json({ status: 'error' });
  }
});

// Hit by the ntfy app's action button (POST, no session): the signed token is
// the authorisation. Answers in plain text because ntfy may show it.
app.post('/reminders/snooze/:token', async (req, res) => {
  const s = verifySnooze(JWT_SECRET, req.params.token);
  if (!s) return res.status(403).type('text').send('This snooze link is invalid or has expired.');
  try {
    const { rowCount } = await pool.query(
      // the notification being answered is the habit's most recent send that day
      `UPDATE reminders_sent SET snoozed_until = now() + make_interval(mins => $3)
       WHERE habit_id = $1 AND local_date = $2
         AND slot = (SELECT slot FROM reminders_sent WHERE habit_id = $1 AND local_date = $2
                     ORDER BY sent_at DESC LIMIT 1)`,
      [s.habitId, s.date, s.minutes]
    );
    if (!rowCount) return res.status(404).type('text').send('Nothing to snooze.');
    snoozesTotal.inc();
    res.type('text').send(`Snoozed for ${s.minutes < 60 ? `${s.minutes} minutes` : `${s.minutes / 60} hour`}.`);
  } catch (e) {
    console.error('snooze failed:', e.message);
    res.status(500).type('text').send('Could not snooze, please try again.');
  }
});

let ticks = 0;
async function runTick() {
  try {
    await tick();
    if (ticks++ % 60 === 0) await pruneSent();
    ticksTotal.inc();
    lastTickGauge.set({}, Math.floor(Date.now() / 1000));
  } catch (e) {
    tickErrors.inc();
    console.error('tick failed:', e.message);
  }
}

// On AWS Lambda, src/lambda.js serves `app` instead (see services/_shared/lambda.js)
// and EventBridge Scheduler calls onSchedule() in place of the interval below.
export { app };
export async function onSchedule() {
  await tick(); // throws, so a failed tick shows up as a Lambda error
  await pruneSent();
}
if (process.env.OPENHABIT_RUNTIME !== 'lambda') {
  app.listen(PORT, () => console.log(`reminder-service listening on :${PORT}, tick=${TICK_MS}ms`));
  runTick();
  setInterval(runTick, TICK_MS);
}
