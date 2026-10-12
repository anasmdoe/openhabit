// reminder-service: checks every minute for habits whose local reminder time
// just arrived and that are due today but not yet logged, then pushes to the
// user's ntfy topic. Read-only against the database; no public API beyond
// /healthz.
import express from 'express';
import pg from 'pg';
import { metricsHandler, registerCustom } from './metrics.js';

const PORT = process.env.PORT || 3006;
const TICK_MS = parseInt(process.env.TICK_MS, 10) || 60_000;

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://openhabit:openhabit@localhost:5432/openhabit',
  max: 5,
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

// ---- dedup: one reminder per habit per local day --------------------------
const fired = new Map(); // `${habitId}|${localDate}` -> ts
function pruneFired() {
  const cutoff = Date.now() - 2 * 86_400_000;
  for (const [k, ts] of fired) if (ts < cutoff) fired.delete(k);
}

function notify(url, title, message) {
  remindersSent.inc();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 4000);
  return fetch(url, {
    method: 'POST',
    headers: { Title: title, Priority: 'default', Tags: 'alarm_clock' },
    body: message,
    signal: ctrl.signal,
  }).catch(() => {}).finally(() => clearTimeout(t));
}

// ---- the tick --------------------------------------------------------------
export async function tick() {
  const { rows } = await pool.query(
    `SELECT h.id, h.name, h.type, h.unit, h.target::float AS target, h.target_type,
            h.schedule_type, h.frequency, h.active_days, h.reminder_time,
            u.ntfy_url, u.timezone
     FROM habits h
     JOIN users u ON u.id = h.user_id
     WHERE NOT h.archived AND h.reminder_time <> '' AND u.ntfy_url <> ''`
  );

  for (const h of rows) {
    const now = localNow(h.timezone);
    if (now.hm !== h.reminder_time) continue;
    const key = `${h.id}|${now.date}`;
    if (fired.has(key)) continue;

    if (h.schedule_type === 'per_week') {
      // remind only if this week's quota isn't met yet
      const ws = weekStart(now.date, now.dow);
      const { rows: ent } = await pool.query(
        `SELECT value::float AS value FROM entries
         WHERE habit_id = $1 AND date BETWEEN $2 AND $3`,
        [h.id, ws, now.date]
      );
      const doneThisWeek = ent.filter((e) => isCompletedVal(h, e.value)).length;
      const todayLogged = await pool.query(
        `SELECT value::float AS value FROM entries WHERE habit_id = $1 AND date = $2`,
        [h.id, now.date]
      );
      const today = todayLogged.rows[0]?.value;
      if (doneThisWeek >= h.frequency || isCompletedVal(h, today) || today === -1) {
        fired.set(key, Date.now());
        continue;
      }
      const left = h.frequency - doneThisWeek;
      await notify(h.ntfy_url, 'OpenHabit',
        `${h.name}: ${left} more time${left === 1 ? '' : 's'} this week — today counts.`);
      fired.set(key, Date.now());
      continue;
    }

    // fixed-day: only when scheduled today
    if (!h.active_days.includes(now.dow)) { fired.set(key, Date.now()); continue; }
    const { rows: ent } = await pool.query(
      `SELECT value::float AS value FROM entries WHERE habit_id = $1 AND date = $2`,
      [h.id, now.date]
    );
    const v = ent[0]?.value;
    if (isCompletedVal(h, v) || v === -1) { fired.set(key, Date.now()); continue; }

    const msg = h.type === 'numeric'
      ? `${h.name}: ${v != null ? `${v}/${h.target}` : `0/${h.target}`}${h.unit ? ` ${h.unit}` : ''} — still time today.`
      : `Don't break the chain — ${h.name} isn't logged yet.`;
    await notify(h.ntfy_url, 'OpenHabit', msg);
    fired.set(key, Date.now());
  }
  pruneFired();
}

// ---- healthz + loop --------------------------------------------------------
// reminder-specific series
const ticksTotal = registerCustom('openhabit_reminder_ticks_total', 'Reminder loop ticks executed.', 'counter');
const remindersSent = registerCustom('openhabit_reminders_sent_total', 'Reminder notifications pushed.', 'counter');
const tickErrors = registerCustom('openhabit_reminder_tick_errors_total', 'Reminder ticks that threw.', 'counter');
const lastTickGauge = registerCustom('openhabit_reminder_last_tick_timestamp', 'Unix time of the last completed tick.', 'gauge');

const app = express();
app.get('/metrics', await metricsHandler(pool, 'reminder-service'));
app.get('/healthz', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', service: 'reminder-service', firedToday: fired.size });
  } catch {
    res.status(500).json({ status: 'error' });
  }
});
app.listen(PORT, () => console.log(`reminder-service listening on :${PORT}, tick=${TICK_MS}ms`));

async function runTick() {
  try {
    await tick();
    ticksTotal.inc();
    lastTickGauge.set({}, Math.floor(Date.now() / 1000));
  } catch (e) {
    tickErrors.inc();
    console.error('tick failed:', e.message);
  }
}
runTick();
setInterval(runTick, TICK_MS);
