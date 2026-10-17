import express from 'express';
import pg from 'pg';
import { metricsMiddleware, metricsHandler } from './metrics.js';
import crypto from 'node:crypto';

const PORT = process.env.PORT || 3001;
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://openhabit:openhabit@localhost:5432/openhabit',
  max: Number(process.env.PG_POOL_MAX) || 10,
});

const app = express();
app.use(metricsMiddleware('habit-service'));
app.use(express.json());

// ---- auth: verify JWTs issued by auth-service (shared JWT_SECRET) ------
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32 || /change-me/i.test(JWT_SECRET)) {
  console.error('FATAL: JWT_SECRET must be a random string of at least 32 characters, shared by all services (e.g. `openssl rand -base64 48`).');
  process.exit(1);
}

function verifyToken(token) {
  const parts = (token || '').split('.');
  if (parts.length !== 3) return null;
  const expected = crypto.createHmac('sha256', JWT_SECRET).update(`${parts[0]}.${parts[1]}`).digest();
  const given = Buffer.from(parts[2], 'base64url');
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    if (typeof payload.exp !== 'number' || payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch { return null; }
}

async function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const raw = h.startsWith('Bearer ') ? h.slice(7) : null;

  // personal API token (long-lived, "oh_" prefix)
  if (raw && raw.startsWith('oh_')) {
    try {
      const hash = crypto.createHash('sha256').update(raw).digest('hex');
      const { rows } = await pool.query(
        `SELECT t.id AS tid, u.id, u.email FROM api_tokens t
         JOIN users u ON u.id = t.user_id WHERE t.token_hash = $1`,
        [hash]
      );
      if (!rows.length) return res.status(401).json({ error: 'unauthorized' });
      req.userId = rows[0].id;
      req.email = rows[0].email;
      req.authMethod = 'token';
      // touch last_used_at at most once a minute (fire-and-forget)
      pool.query(
        `UPDATE api_tokens SET last_used_at = now()
         WHERE id = $1 AND (last_used_at IS NULL OR last_used_at < now() - interval '60 seconds')`,
        [rows[0].tid]
      ).catch(() => {});
      return next();
    } catch (e) {
      return next(e);
    }
  }

  // session JWT
  const payload = verifyToken(raw);
  if (!payload) return res.status(401).json({ error: 'unauthorized' });
  req.userId = payload.sub;
  req.email = payload.email;
  req.authMethod = 'jwt';
  next();
}


// ---- helpers ----------------------------------------------------------
const HABIT_COLS = `id, name, question, type, unit, target::float AS target,
  target_type AS "targetType", color, icon, schedule_type AS "scheduleType",
  frequency, webhook_url AS "webhookUrl", reminder_time AS "reminderTime", active_days AS "activeDays",
  position, archived, category, kind, cue, savings_per_day::float AS "savingsPerDay", savings_unit AS "savingsUnit", streak_freezes AS "streakFreezes", after_habit_id AS "afterHabitId",
  created_at AS "createdAt"`;

const asyncH = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Habit stacking: the anchor must be one of the user's own, non-quit habits and the chain must not loop
 * back to the habit itself. Returns an error message or null.
 */
async function checkStack(userId, selfId, afterId) {
  if (afterId == null) return null;
  if (afterId === selfId) return 'a habit cannot come after itself';
  const { rows } = await pool.query('SELECT kind FROM habits WHERE id = $1 AND user_id = $2', [afterId, userId]);
  if (!rows.length) return 'the habit to stack after was not found';
  if (rows[0].kind === 'quit') return 'a quit habit cannot be an anchor to stack after';
  if (selfId) {
    const loop = await pool.query(
      `WITH RECURSIVE chain AS (
         SELECT id, after_habit_id FROM habits WHERE id = $1 AND user_id = $3
         UNION
         SELECT h.id, h.after_habit_id FROM habits h JOIN chain c ON h.id = c.after_habit_id WHERE h.user_id = $3
       ) SELECT 1 FROM chain WHERE id = $2 LIMIT 1`, [afterId, selfId, userId]);
    if (loop.rowCount) return 'that would make a loop: the other habit already comes after this one';
  }
  return null;
}

function validateHabit(body, partial = false) {
  const errors = [];
  const out = {};
  const fields = {
    name: (v) => typeof v === 'string' && v.trim().length > 0,
    question: (v) => typeof v === 'string',
    type: (v) => ['boolean', 'numeric'].includes(v),
    unit: (v) => typeof v === 'string',
    target: (v) => typeof v === 'number' && v > 0,
    targetType: (v) => ['at_least', 'at_most'].includes(v),
    color: (v) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v),
    icon: (v) => typeof v === 'string' && v.length <= 32 && /^[a-z0-9-]*$/.test(v),
    scheduleType: (v) => ['weekdays', 'per_week'].includes(v),
    frequency: (v) => Number.isInteger(v) && v >= 1 && v <= 7,
    webhookUrl: (v) => typeof v === 'string' && v.length <= 500 && (v === '' || /^https?:\/\//.test(v)),
    // up to 3 distinct HH:MM times, comma-separated
    reminderTime: (v) => typeof v === 'string' && (v === '' || (() => {
      const times = v.split(',');
      return times.length <= 3 && new Set(times).size === times.length
        && times.every((t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t));
    })()),
    cue: (v) => typeof v === 'string' && v.trim().length <= 120,
    savingsPerDay: (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1_000_000,
    savingsUnit: (v) => typeof v === 'string' && v.trim().length <= 12,
    streakFreezes: (v) => Number.isInteger(v) && v >= 0 && v <= 3,
    afterHabitId: (v) => v === null || (typeof v === 'string' && UUID_RE.test(v)),
    activeDays: (v) => Array.isArray(v) && v.length > 0 && v.every((d) => Number.isInteger(d) && d >= 0 && d <= 6),
    position: (v) => Number.isInteger(v),
    archived: (v) => typeof v === 'boolean',
    category: (v) => typeof v === 'string' && v.trim().length <= 40,
    kind: (v) => ['build', 'quit'].includes(v),
  };
  for (const [key, check] of Object.entries(fields)) {
    if (body[key] === undefined) {
      if (!partial && key === 'name') errors.push('name is required');
      continue;
    }
    if (!check(body[key])) errors.push(`invalid ${key}`);
    else out[key] = typeof body[key] === 'string' && (key === 'category' || key === 'cue' || key === 'savingsUnit') ? body[key].trim() : body[key];
  }
  // a quit habit is yes/no and daily: logging it records a slip
  if (out.kind === 'quit' && (out.type === 'numeric' || out.scheduleType === 'per_week')) {
    errors.push('a quit habit is yes/no and scheduled by weekday');
  }
  return { errors, out };
}

// ---- routes -----------------------------------------------------------
app.get('/metrics', await metricsHandler(pool, 'habit-service'));

app.get('/healthz', asyncH(async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ status: 'ok', service: 'habit-service' });
}));


// ---- calendar feed (iCal) -----------------------------------------------
// A read-only subscription URL for Google/Apple/Outlook calendars. Calendar apps cannot send
// an Authorization header, so the URL carries an HMAC key derived from JWT_SECRET and the user id
// (rotating JWT_SECRET revokes every feed). It exposes habit names, cues and schedules only,
// never entries, notes or mood.
const feedKey = (userId) =>
  crypto.createHmac('sha256', JWT_SECRET).update(`ics-feed:${userId}`).digest('base64url').slice(0, 32);

const icsEscape = (t) => String(t).replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function icsFold(line) {
  const out = [];
  let rest = Buffer.from(line);
  while (rest.length > 75) {
    let cut = 75;
    while ((rest[cut] & 0xc0) === 0x80) cut -= 1; // never split a UTF-8 character
    out.push(rest.subarray(0, cut).toString());
    rest = Buffer.concat([Buffer.from(' '), rest.subarray(cut)]);
  }
  out.push(rest.toString());
  return out.join('\r\n');
}

const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
export function buildIcs(habits, now = new Date()) {
  const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');
  const stamp = `${now.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//OpenHabit//Habits//EN', 'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:OpenHabit', 'REFRESH-INTERVAL;VALUE=DURATION:PT6H'];
  for (const h of habits) {
    if (h.archived || h.kind === 'quit') continue;
    const days = h.schedule_type === 'per_week' ? [0, 1, 2, 3, 4, 5, 6] : h.active_days;
    const start = new Date(now);
    while (!days.includes(start.getUTCDay())) start.setUTCDate(start.getUTCDate() + 1);
    const time = (h.reminder_time || '').split(',').filter(Boolean).sort()[0];
    lines.push('BEGIN:VEVENT', `UID:${h.id}@openhabit`, `DTSTAMP:${stamp}`);
    if (time) {
      lines.push(`DTSTART:${ymd(start)}T${time.replace(':', '')}00`, 'DURATION:PT15M');
    } else {
      lines.push(`DTSTART;VALUE=DATE:${ymd(start)}`, 'DURATION:P1D');
    }
    lines.push(days.length === 7 ? 'RRULE:FREQ=DAILY' : `RRULE:FREQ=WEEKLY;BYDAY=${days.map((d) => BYDAY[d]).join(',')}`);
    lines.push(`SUMMARY:${icsEscape(h.name)}`);
    const note = [h.cue, h.schedule_type === 'per_week' ? `${h.frequency} times a week, any days` : ''].filter(Boolean).join(' - ');
    if (note) lines.push(`DESCRIPTION:${icsEscape(note)}`);
    if (!time) lines.push('TRANSP:TRANSPARENT'); // all-day habits should not mark you busy
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(icsFold).join('\r\n')}\r\n`;
}

app.get('/habits/feed.ics', asyncH(async (req, res) => {
  const u = String(req.query.u || '');
  const k = Buffer.from(String(req.query.k || ''));
  const want = Buffer.from(feedKey(u));
  if (!/^[0-9a-f-]{36}$/i.test(u) || k.length !== want.length || !crypto.timingSafeEqual(k, want)) {
    return res.status(404).type('text/plain').send('not found');
  }
  const { rows } = await pool.query(
    `SELECT id, name, cue, schedule_type, frequency, active_days, reminder_time, archived, kind
     FROM habits WHERE user_id = $1 AND NOT archived ORDER BY position, created_at`, [u]);
  res.set('Cache-Control', 'private, max-age=900').type('text/calendar; charset=utf-8').send(buildIcs(rows));
}));

app.use(auth);

app.get('/habits/feed-url', (req, res) => {
  res.json({ query: `u=${req.userId}&k=${feedKey(req.userId)}` });
});

app.get('/habits', asyncH(async (req, res) => {
  const includeArchived = req.query.archived === 'true';
  const { rows } = await pool.query(
    `SELECT ${HABIT_COLS} FROM habits WHERE user_id = $1 ${includeArchived ? '' : 'AND NOT archived'} ORDER BY position, created_at`,
    [req.userId]
  );
  res.json(rows);
}));

// ---- goals with deadlines ---------------------------------------------------
// "Read 20 books by December". The goal is only a target and a deadline on a habit; progress is derived
// from that habit's entries by analytics-service (GET /analytics/goals).
const GOAL_COLS = `g.id, g.habit_id AS "habitId", g.title, g.target::float AS target, g.unit,
  to_char(g.start_date, 'YYYY-MM-DD') AS "startDate", to_char(g.deadline, 'YYYY-MM-DD') AS deadline,
  g.completed_at AS "completedAt", g.created_at AS "createdAt"`;

function validateGoal(body, partial) {
  const errors = [];
  const out = {};
  const f = {
    habitId: (v) => typeof v === 'string' && UUID_RE.test(v),
    title: (v) => typeof v === 'string' && v.trim().length >= 1 && v.trim().length <= 120,
    target: (v) => typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 1_000_000,
    unit: (v) => typeof v === 'string' && v.trim().length <= 20,
    startDate: (v) => typeof v === 'string' && DATE_RE.test(v),
    deadline: (v) => typeof v === 'string' && DATE_RE.test(v),
    completed: (v) => typeof v === 'boolean',
  };
  for (const [k, check] of Object.entries(f)) {
    if (body[k] === undefined) {
      if (!partial && ['habitId', 'title', 'target', 'startDate', 'deadline'].includes(k)) errors.push(`${k} is required`);
      continue;
    }
    if (!check(body[k])) errors.push(`invalid ${k}`); else out[k] = typeof body[k] === 'string' ? body[k].trim() : body[k];
  }
  if (out.startDate && out.deadline && out.deadline < out.startDate) errors.push('the deadline must not be before the start date');
  return { errors, out };
}

app.get('/habits/goals', asyncH(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT ${GOAL_COLS} FROM goals g WHERE g.user_id = $1 ORDER BY (g.completed_at IS NOT NULL), g.deadline, g.created_at`, [req.userId]);
  res.json(rows);
}));

app.post('/habits/goals', asyncH(async (req, res) => {
  const { errors, out } = validateGoal(req.body, false);
  if (errors.length) return res.status(400).json({ errors });
  const { rows: cnt } = await pool.query('SELECT count(*)::int AS n FROM goals WHERE user_id = $1', [req.userId]);
  if (cnt[0].n >= 50) return res.status(400).json({ error: 'at most 50 goals' });
  const { rows } = await pool.query(
    `INSERT INTO goals (user_id, habit_id, title, target, unit, start_date, deadline)
     SELECT $1, h.id, $3, $4, $5, $6, $7 FROM habits h WHERE h.id = $2 AND h.user_id = $1
     RETURNING id`,
    [req.userId, out.habitId, out.title, out.target, out.unit ?? '', out.startDate, out.deadline]);
  if (!rows.length) return res.status(404).json({ error: 'habit not found' });
  const { rows: full } = await pool.query(`SELECT ${GOAL_COLS} FROM goals g WHERE g.id = $1`, [rows[0].id]);
  res.status(201).json(full[0]);
}));

app.put('/habits/goals/:id', asyncH(async (req, res) => {
  if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: 'goal not found' });
  const { errors, out } = validateGoal(req.body, true);
  if (errors.length) return res.status(400).json({ errors });
  const sets = [];
  const vals = [];
  const add = (col, val) => { vals.push(val); sets.push(`${col} = $${vals.length}`); };
  if (out.title !== undefined) add('title', out.title);
  if (out.target !== undefined) add('target', out.target);
  if (out.unit !== undefined) add('unit', out.unit);
  if (out.startDate !== undefined) add('start_date', out.startDate);
  if (out.deadline !== undefined) add('deadline', out.deadline);
  if (out.completed !== undefined) sets.push(out.completed ? 'completed_at = COALESCE(completed_at, now())' : 'completed_at = NULL');
  if (!sets.length) return res.status(400).json({ error: 'no valid fields to update' });
  vals.push(req.params.id, req.userId);
  const { rowCount } = await pool.query(`UPDATE goals SET ${sets.join(', ')} WHERE id = $${vals.length - 1} AND user_id = $${vals.length}`, vals)
    .catch((e) => { if (e.code === '23514') return { rowCount: -1 }; throw e; });
  if (rowCount === -1) return res.status(400).json({ error: 'the deadline must not be before the start date' });
  if (!rowCount) return res.status(404).json({ error: 'goal not found' });
  const { rows } = await pool.query(`SELECT ${GOAL_COLS} FROM goals g WHERE g.id = $1`, [req.params.id]);
  res.json(rows[0]);
}));

app.delete('/habits/goals/:id', asyncH(async (req, res) => {
  if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: 'goal not found' });
  const { rowCount } = await pool.query('DELETE FROM goals WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  if (!rowCount) return res.status(404).json({ error: 'goal not found' });
  res.status(204).end();
}));

app.get('/habits/:id', asyncH(async (req, res) => {
  const { rows } = await pool.query(`SELECT ${HABIT_COLS} FROM habits WHERE id = $1 AND user_id = $2`, [req.params.id, req.userId]);
  if (!rows.length) return res.status(404).json({ error: 'habit not found' });
  res.json(rows[0]);
}));

app.post('/habits', asyncH(async (req, res) => {
  const { errors, out } = validateHabit(req.body);
  if (errors.length) return res.status(400).json({ errors });
  if (out.kind === 'quit' && out.afterHabitId) return res.status(400).json({ errors: ['a habit to quit cannot be stacked after another'] });
  const stackErr = await checkStack(req.userId, null, out.afterHabitId ?? null);
  if (stackErr) return res.status(400).json({ errors: [stackErr] });
  const { rows } = await pool.query(
    `INSERT INTO habits (user_id, name, question, type, unit, target, target_type, color, icon,
       schedule_type, frequency, webhook_url, reminder_time, active_days, position, category, kind, cue,
       savings_per_day, savings_unit, streak_freezes, after_habit_id)
     VALUES ($10, $1, $2, $3, $4, $5, $6, $7, $11, $12, $13, $14, $15, $8,
       COALESCE($9, (SELECT COALESCE(MAX(position), -1) + 1 FROM habits WHERE user_id = $10)), $16, $17, $18, $19, $20, $21, $22)
     RETURNING ${HABIT_COLS}`,
    [
      out.name.trim(),
      out.question ?? '',
      out.type ?? 'boolean',
      out.unit ?? '',
      out.target ?? 1,
      out.targetType ?? 'at_least',
      out.color ?? '#7FD1AE',
      out.activeDays ?? [0, 1, 2, 3, 4, 5, 6],
      out.position ?? null,
      req.userId,
      out.icon ?? '',
      out.scheduleType ?? 'weekdays',
      out.frequency ?? 3,
      out.webhookUrl ?? '',
      out.reminderTime ?? '',
      out.category ?? '',
      out.kind ?? 'build',
      out.cue ?? '',
      out.savingsPerDay ?? 0,
      out.savingsUnit ?? '',
      out.streakFreezes ?? 1,
      out.afterHabitId ?? null,
    ]
  );
  res.status(201).json(rows[0]);
}));

app.put('/habits/reorder', asyncH(async (req, res) => {
  // body: { ids: [uuid, ...] } in desired order
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'ids array required' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < ids.length; i++) {
      await client.query('UPDATE habits SET position = $1 WHERE id = $2 AND user_id = $3', [i, ids[i], req.userId]);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  res.json({ ok: true });
}));

app.put('/habits/:id', asyncH(async (req, res) => {
  const { errors, out } = validateHabit(req.body, true);
  if (errors.length) return res.status(400).json({ errors });
  if (out.kind === 'quit' && out.afterHabitId) return res.status(400).json({ errors: ['a habit to quit cannot be stacked after another'] });
  if (out.afterHabitId !== undefined) {
    const stackErr = await checkStack(req.userId, req.params.id, out.afterHabitId);
    if (stackErr) return res.status(400).json({ errors: [stackErr] });
  }
  const colMap = {
    name: 'name', question: 'question', type: 'type', unit: 'unit', target: 'target',
    targetType: 'target_type', color: 'color', icon: 'icon', activeDays: 'active_days',
    scheduleType: 'schedule_type', frequency: 'frequency', webhookUrl: 'webhook_url',
    reminderTime: 'reminder_time',
    position: 'position', archived: 'archived', category: 'category', kind: 'kind', cue: 'cue', savingsPerDay: 'savings_per_day', savingsUnit: 'savings_unit', streakFreezes: 'streak_freezes', afterHabitId: 'after_habit_id',
  };
  const sets = [];
  const vals = [];
  for (const [key, val] of Object.entries(out)) {
    vals.push(key === 'name' ? val.trim() : val);
    sets.push(`${colMap[key]} = $${vals.length}`);
  }
  if (!sets.length) return res.status(400).json({ error: 'no valid fields to update' });
  vals.push(req.params.id, req.userId);
  const { rows } = await pool.query(
    `UPDATE habits SET ${sets.join(', ')}, updated_at = now() WHERE id = $${vals.length - 1} AND user_id = $${vals.length} RETURNING ${HABIT_COLS}`,
    vals
  );
  if (!rows.length) return res.status(404).json({ error: 'habit not found' });
  res.json(rows[0]);
}));

app.delete('/habits/:id', asyncH(async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM habits WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  if (!rowCount) return res.status(404).json({ error: 'habit not found' });
  res.status(204).end();
}));

// ---- error handling ---------------------------------------------------
app.use((err, _req, res, _next) => {
  // habits_kind_check: e.g. turning a quit habit numeric through a partial update
  if (err.code === '23514') return res.status(400).json({ errors: ['a quit habit is yes/no and scheduled by weekday'] });
  console.error(err);
  res.status(500).json({ error: 'internal error' });
});

// On AWS Lambda, src/lambda.js serves `app` instead (see services/_shared/lambda.js).
export { app };
if (process.env.OPENHABIT_RUNTIME !== 'lambda') {
  app.listen(PORT, () => console.log(`habit-service listening on :${PORT}`));
}
