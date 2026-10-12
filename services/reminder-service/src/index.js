// reminder-service: checks every minute for habits whose local reminder time
// has arrived and that are due today but not yet logged, then pushes to the
// user's ntfy topic. Sends are recorded in reminders_sent (one per habit per
// local day), so restarts and extra replicas never double-send. Public API:
// POST /reminders/snooze/:token, the signed link behind the notification's
// snooze buttons.
import express from 'express';
import pg from 'pg';
import { metricsHandler, registerCustom } from './metrics.js';
import { isDue, inQuietHours, signSnooze, verifySnooze, snoozeActions, SNOOZE_CHOICES } from './reminders.js';

const PORT = process.env.PORT || 3006;
const TICK_MS = parseInt(process.env.TICK_MS, 10) || 60_000;
// Where phones reach the app (e.g. https://habits.example.com). Without it the
// notifications carry no snooze buttons, since the links would be unreachable.
const PUBLIC_URL = (process.env.PUBLIC_URL || '').trim();

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

function notify(url, title, message, actions) {
  remindersSent.inc();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 4000);
  return fetch(url, {
    method: 'POST',
    headers: { Title: title, Priority: 'default', Tags: 'alarm_clock', ...(actions ? { Actions: actions } : {}) },
    body: message,
    signal: ctrl.signal,
  }).catch(() => {}).finally(() => clearTimeout(t));
}

function actionsFor(habitId, date) {
  if (!PUBLIC_URL) return undefined;
  const expiresAt = Date.now() + 24 * 3_600_000;
  const tokens = Object.fromEntries(SNOOZE_CHOICES.map((minutes) =>
    [minutes, signSnooze(JWT_SECRET, { habitId, date, minutes, expiresAt })]));
  return snoozeActions(PUBLIC_URL, tokens);
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

// ---- the tick --------------------------------------------------------------
export async function tick() {
  const { rows } = await pool.query(
    `SELECT h.id, h.name, h.type, h.unit, h.target::float AS target, h.target_type,
            h.schedule_type, h.frequency, h.active_days, h.reminder_time,
            u.ntfy_url, u.timezone, u.quiet_start, u.quiet_end
     FROM habits h
     JOIN users u ON u.id = h.user_id
     WHERE NOT h.archived AND h.reminder_time <> '' AND u.ntfy_url <> ''`
  );
  if (!rows.length) return;

  // today's (and yesterday's, for far-east/west zones) bookkeeping rows
  const { rows: sentRows } = await pool.query(
    `SELECT habit_id, local_date::text AS date, snoozed_until <= now() AS snooze_due
     FROM reminders_sent WHERE local_date >= current_date - 1`
  );
  const sent = new Map(sentRows.map((r) => [`${r.habit_id}|${r.date}`, r]));

  for (const h of rows) {
    const now = localNow(h.timezone);
    const row = sent.get(`${h.id}|${now.date}`);
    const snoozed = Boolean(row?.snooze_due);
    if (row ? !snoozed : !isDue(h.reminder_time, now.hm)) continue;
    // Quiet hours hold reminders back; a snoozed one goes out once they end.
    if (inQuietHours(now.hm, h.quiet_start, h.quiet_end)) continue;

    const msg = await pendingMessage(h, now);
    if (!msg) {
      // logged in the meantime: drop the snooze so we stop re-checking it
      if (snoozed) await pool.query(
        'UPDATE reminders_sent SET snoozed_until = NULL WHERE habit_id = $1 AND local_date = $2', [h.id, now.date]);
      continue;
    }

    // Claim the send first; only the instance whose claim succeeds pushes.
    const claim = snoozed
      ? await pool.query(
        `UPDATE reminders_sent SET snoozed_until = NULL, sent_at = now()
         WHERE habit_id = $1 AND local_date = $2 AND snoozed_until <= now() RETURNING 1`, [h.id, now.date])
      : await pool.query(
        `INSERT INTO reminders_sent (habit_id, local_date) VALUES ($1, $2)
         ON CONFLICT DO NOTHING RETURNING 1`, [h.id, now.date]);
    if (!claim.rowCount) continue;

    await notify(h.ntfy_url, snoozed ? 'OpenHabit (snoozed)' : 'OpenHabit', msg, actionsFor(h.id, now.date));
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
      `UPDATE reminders_sent SET snoozed_until = now() + make_interval(mins => $3)
       WHERE habit_id = $1 AND local_date = $2`,
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
