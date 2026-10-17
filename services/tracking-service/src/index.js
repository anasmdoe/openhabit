import express from 'express';
import pg from 'pg';
import { metricsMiddleware, metricsHandler } from './metrics.js';
import { verifyAction } from './actions.js';
import { signingSecret, signBody } from './webhook.js';
import crypto from 'node:crypto';

const PORT = process.env.PORT || 3002;
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://openhabit:openhabit@localhost:5432/openhabit',
  max: Number(process.env.PG_POOL_MAX) || 10,
});

const app = express();
app.use(metricsMiddleware('tracking-service'));
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


const asyncH = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (s) => typeof s === 'string' && DATE_RE.test(s) && !Number.isNaN(Date.parse(s));

const ENTRY_COLS = `e.habit_id AS "habitId", to_char(e.date, 'YYYY-MM-DD') AS date, e.value::float AS value, e.notes`;

app.get('/metrics', await metricsHandler(pool, 'tracking-service'));

app.get('/healthz', asyncH(async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ status: 'ok', service: 'tracking-service' });
}));

// "Done" button on a reminder notification (POST from the ntfy app, no session):
// the signed token is the authorisation. Answers in plain text because ntfy may
// show it. Only yes/no habits get the button (numeric ones need a value).
app.post('/entries/done/:token', asyncH(async (req, res) => {
  const a = verifyAction(JWT_SECRET, req.params.token, 'done');
  if (!a) return res.status(403).type('text').send('This link is invalid or has expired.');
  const { rows } = await pool.query(
    `SELECT user_id AS "userId", name FROM habits WHERE id = $1 AND type = 'boolean' AND kind = 'build' AND NOT archived`,
    [a.habitId]
  );
  if (!rows.length) return res.status(404).type('text').send('Habit not found.');
  await pool.query(
    `INSERT INTO entries (habit_id, date, value) VALUES ($1, $2, 1)
     ON CONFLICT (habit_id, date) DO UPDATE SET value = 1`,
    [a.habitId, a.date]
  );
  await completionWebhook(a.habitId, rows[0].userId, a.date, 1);
  res.type('text').send(`Done: ${rows[0].name} (${a.date}).`);
}));

app.use(auth);

// ---- entries ----------------------------------------------------------
// GET /entries?from=YYYY-MM-DD&to=YYYY-MM-DD[&habitId=uuid]
app.get('/entries', asyncH(async (req, res) => {
  const { from, to, habitId } = req.query;
  if (!isDate(from) || !isDate(to)) return res.status(400).json({ error: 'from and to (YYYY-MM-DD) are required' });
  const params = [from, to, req.userId];
  let sql = `SELECT ${ENTRY_COLS} FROM entries e
             JOIN habits h ON h.id = e.habit_id AND h.user_id = $3
             WHERE e.date BETWEEN $1 AND $2`;
  if (habitId) {
    params.push(habitId);
    sql += ` AND e.habit_id = $4`;
  }
  sql += ' ORDER BY e.date';
  const { rows } = await pool.query(sql, params);
  res.json(rows);
}));

// Completion webhook (3s cap). Point it at anything that accepts a POST — an
// ntfy topic URL gives instant push notifications. Logs the outcome (habit id
// and status; never the URL). Returns a promise that never rejects.
function fireWebhook(habitId, url, payload, secret) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 3000);
  const body = JSON.stringify(payload);
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'OpenHabit-Webhook/1',
      'X-OpenHabit-Event': payload.event,
      'X-OpenHabit-Delivery': payload.id,
      'X-OpenHabit-Signature': signBody(secret, body),
    },
    body,
    signal: ctrl.signal,
  })
    .then((r) => console.log(`webhook habit=${habitId} status=${r.status}`))
    .catch((e) => console.warn(`webhook habit=${habitId} failed: ${e.name === 'AbortError' ? 'timeout' : e.message}`))
    .finally(() => clearTimeout(t));
}
// Fire-and-forget in a long-running process; on AWS Lambda the function is
// frozen once the response is sent, so the webhook must finish first.
const AWAIT_WEBHOOKS = process.env.OPENHABIT_RUNTIME === 'lambda';

/** Sends the habit's webhook if `value` completes it (skips never do). */
async function completionWebhook(habitId, userId, date, value) {
  if (value === -1) return;
  const { rows } = await pool.query(
    `SELECT name, type, target::float AS target, target_type AS "targetType", webhook_url AS url,
            (SELECT webhook_secret_version FROM users WHERE id = $2) AS "secretVersion"
     FROM habits WHERE id = $1 AND user_id = $2 AND webhook_url <> '' AND kind = 'build'`,
    [habitId, userId]
  );
  if (!rows.length) return;
  const h = rows[0];
  const completed = h.type === 'boolean'
    ? value >= 1
    : h.targetType === 'at_most' ? value <= h.target : value >= h.target;
  if (!completed) return;
  const sent = fireWebhook(habitId, h.url, {
    id: crypto.randomUUID(), event: 'habit.completed', created: new Date().toISOString(),
    habitId, habit: h.name, date, value,
    message: `${h.name} completed (${date})`,
  }, signingSecret(JWT_SECRET, userId, h.secretVersion ?? 1));
  if (AWAIT_WEBHOOKS) await sent;
}

// PUT /entries  body: { habitId, date, value, notes? }  (upsert)
app.put('/entries', asyncH(async (req, res) => {
  const { habitId, date, value, notes } = req.body;
  if (!habitId || !isDate(date)) return res.status(400).json({ error: 'habitId and date are required' });
  if (typeof value !== 'number' || Number.isNaN(value)) return res.status(400).json({ error: 'numeric value is required' });
  const { rows } = await pool.query(
    `INSERT INTO entries AS e (habit_id, date, value, notes)
     SELECT $1, $2, $3, $4
     WHERE EXISTS (SELECT 1 FROM habits WHERE id = $1 AND user_id = $5)
     ON CONFLICT (habit_id, date) DO UPDATE SET value = EXCLUDED.value, notes = EXCLUDED.notes
     RETURNING ${ENTRY_COLS}`,
    [habitId, date, value, typeof notes === 'string' ? notes : '', req.userId]
  );
  if (!rows.length) return res.status(404).json({ error: 'habit not found' });
  await completionWebhook(habitId, req.userId, date, value);
  res.json(rows[0]);
}));

// DELETE /entries/:habitId/:date
app.delete('/entries/:habitId/:date', asyncH(async (req, res) => {
  const { habitId, date } = req.params;
  if (!isDate(date)) return res.status(400).json({ error: 'invalid date' });
  const { rowCount } = await pool.query(
    'DELETE FROM entries e USING habits h WHERE h.id = e.habit_id AND h.user_id = $3 AND e.habit_id = $1 AND e.date = $2',
    [habitId, date, req.userId]
  );
  if (!rowCount) return res.status(404).json({ error: 'entry not found' });
  res.status(204).end();
}));

// Bulk import: POST /entries/bulk  body: { entries: [{habitId,date,value,notes?}] }
app.post('/entries/bulk', asyncH(async (req, res) => {
  const { entries } = req.body;
  if (!Array.isArray(entries)) return res.status(400).json({ error: 'entries array required' });
  const client = await pool.connect();
  let count = 0;
  try {
    await client.query('BEGIN');
    for (const e of entries) {
      if (!e.habitId || !isDate(e.date) || typeof e.value !== 'number') continue;
      const r = await client.query(
        `INSERT INTO entries (habit_id, date, value, notes)
         SELECT $1, $2, $3, $4
         WHERE EXISTS (SELECT 1 FROM habits WHERE id = $1 AND user_id = $5)
         ON CONFLICT (habit_id, date) DO UPDATE SET value = EXCLUDED.value, notes = EXCLUDED.notes`,
        [e.habitId, e.date, e.value, e.notes || '', req.userId]
      );
      count += r.rowCount;
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  res.json({ imported: count });
}));

// ---- wellness ---------------------------------------------------------
// GET /wellness?from&to
app.get('/wellness', asyncH(async (req, res) => {
  const { from, to } = req.query;
  if (!isDate(from) || !isDate(to)) return res.status(400).json({ error: 'from and to (YYYY-MM-DD) are required' });
  const { rows } = await pool.query(
    `SELECT to_char(date, 'YYYY-MM-DD') AS date, mood, sleep_hours::float AS "sleepHours"
     FROM wellness WHERE user_id = $3 AND date BETWEEN $1 AND $2 ORDER BY date`,
    [from, to, req.userId]
  );
  res.json(rows);
}));

// PUT /wellness  body: { date, mood?, sleepHours? } (upsert; null clears)
app.put('/wellness', asyncH(async (req, res) => {
  const { date, mood, sleepHours } = req.body;
  if (!isDate(date)) return res.status(400).json({ error: 'date is required' });
  if (mood != null && !(Number.isInteger(mood) && mood >= 1 && mood <= 5))
    return res.status(400).json({ error: 'mood must be an integer 1-5' });
  if (sleepHours != null && !(typeof sleepHours === 'number' && sleepHours >= 0 && sleepHours <= 24))
    return res.status(400).json({ error: 'sleepHours must be 0-24' });
  const { rows } = await pool.query(
    `INSERT INTO wellness (user_id, date, mood, sleep_hours) VALUES ($4, $1, $2, $3)
     ON CONFLICT (user_id, date) DO UPDATE SET
       mood = COALESCE(EXCLUDED.mood, wellness.mood),
       sleep_hours = COALESCE(EXCLUDED.sleep_hours, wellness.sleep_hours)
     RETURNING to_char(date, 'YYYY-MM-DD') AS date, mood, sleep_hours::float AS "sleepHours"`,
    [date, mood ?? null, sleepHours ?? null, req.userId]
  );
  res.json(rows[0]);
}));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'internal error' });
});

// On AWS Lambda, src/lambda.js serves `app` instead (see services/_shared/lambda.js).
export { app };
if (process.env.OPENHABIT_RUNTIME !== 'lambda') {
  app.listen(PORT, () => console.log(`tracking-service listening on :${PORT}`));
}
