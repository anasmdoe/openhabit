import express from 'express';
import pg from 'pg';
import { metricsMiddleware, metricsHandler } from './metrics.js';
import crypto from 'node:crypto';

const PORT = process.env.PORT || 3001;
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://openhabit:openhabit@localhost:5432/openhabit',
  max: 10,
});

const app = express();
app.use(metricsMiddleware('habit-service'));
app.use(express.json());

// ---- auth: verify JWTs issued by auth-service (shared JWT_SECRET) ------
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

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

function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const payload = verifyToken(h.startsWith('Bearer ') ? h.slice(7) : null);
  if (!payload) return res.status(401).json({ error: 'unauthorized' });
  req.userId = payload.sub;
  next();
}


// ---- helpers ----------------------------------------------------------
const HABIT_COLS = `id, name, question, type, unit, target::float AS target,
  target_type AS "targetType", color, icon, schedule_type AS "scheduleType",
  frequency, webhook_url AS "webhookUrl", reminder_time AS "reminderTime", active_days AS "activeDays",
  position, archived, created_at AS "createdAt"`;

const asyncH = (fn) => (req, res, next) => fn(req, res, next).catch(next);

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
    reminderTime: (v) => typeof v === 'string' && (v === '' || /^([01]\d|2[0-3]):[0-5]\d$/.test(v)),
    activeDays: (v) => Array.isArray(v) && v.length > 0 && v.every((d) => Number.isInteger(d) && d >= 0 && d <= 6),
    position: (v) => Number.isInteger(v),
    archived: (v) => typeof v === 'boolean',
  };
  for (const [key, check] of Object.entries(fields)) {
    if (body[key] === undefined) {
      if (!partial && key === 'name') errors.push('name is required');
      continue;
    }
    if (!check(body[key])) errors.push(`invalid ${key}`);
    else out[key] = body[key];
  }
  return { errors, out };
}

// ---- routes -----------------------------------------------------------
app.get('/metrics', await metricsHandler(pool, 'habit-service'));

app.get('/healthz', asyncH(async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ status: 'ok', service: 'habit-service' });
}));

app.use(auth);

app.get('/habits', asyncH(async (req, res) => {
  const includeArchived = req.query.archived === 'true';
  const { rows } = await pool.query(
    `SELECT ${HABIT_COLS} FROM habits WHERE user_id = $1 ${includeArchived ? '' : 'AND NOT archived'} ORDER BY position, created_at`,
    [req.userId]
  );
  res.json(rows);
}));

app.get('/habits/:id', asyncH(async (req, res) => {
  const { rows } = await pool.query(`SELECT ${HABIT_COLS} FROM habits WHERE id = $1 AND user_id = $2`, [req.params.id, req.userId]);
  if (!rows.length) return res.status(404).json({ error: 'habit not found' });
  res.json(rows[0]);
}));

app.post('/habits', asyncH(async (req, res) => {
  const { errors, out } = validateHabit(req.body);
  if (errors.length) return res.status(400).json({ errors });
  const { rows } = await pool.query(
    `INSERT INTO habits (user_id, name, question, type, unit, target, target_type, color, icon,
       schedule_type, frequency, webhook_url, reminder_time, active_days, position)
     VALUES ($10, $1, $2, $3, $4, $5, $6, $7, $11, $12, $13, $14, $15, $8,
       COALESCE($9, (SELECT COALESCE(MAX(position), -1) + 1 FROM habits WHERE user_id = $10)))
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
  const colMap = {
    name: 'name', question: 'question', type: 'type', unit: 'unit', target: 'target',
    targetType: 'target_type', color: 'color', icon: 'icon', activeDays: 'active_days',
    scheduleType: 'schedule_type', frequency: 'frequency', webhookUrl: 'webhook_url',
    reminderTime: 'reminder_time',
    position: 'position', archived: 'archived',
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
  console.error(err);
  res.status(500).json({ error: 'internal error' });
});

app.listen(PORT, () => console.log(`habit-service listening on :${PORT}`));
