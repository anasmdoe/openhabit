import express from 'express';
import pg from 'pg';
import { metricsMiddleware, metricsHandler } from './metrics.js';
import crypto from 'node:crypto';

const PORT = process.env.PORT || 3005;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const MAX_GROUPS_PER_USER = 20;
const MAX_MEMBERS_PER_GROUP = 50;

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://openhabit:openhabit@localhost:5432/openhabit',
  max: 10,
});

const app = express();
app.use(metricsMiddleware('social-service'));
app.use(express.json());
const asyncH = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// ---- auth ----------------------------------------------------------------
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

// ---- helpers -------------------------------------------------------------
const genCode = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
  let out = '';
  const bytes = crypto.randomBytes(8);
  for (let i = 0; i < 8; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
};

async function isMember(groupId, userId) {
  const { rows } = await pool.query(
    'SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2',
    [groupId, userId]
  );
  return rows[0]?.role ?? null;
}

app.get('/metrics', await metricsHandler(pool, 'social-service'));

app.get('/healthz', asyncH(async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ status: 'ok', service: 'social-service' });
}));

app.use(auth);

// ==========================================================================
// Groups
// ==========================================================================

// list my groups (with member count)
app.get('/groups', asyncH(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT g.id, g.name, g.icon, g.invite_code AS "inviteCode",
            g.owner_id AS "ownerId", gm.role,
            (SELECT count(*)::int FROM group_members WHERE group_id = g.id) AS "memberCount"
     FROM groups g
     JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = $1
     ORDER BY g.created_at`,
    [req.userId]
  );
  res.json(rows);
}));

// create a group; creator becomes owner + first member
app.post('/groups', asyncH(async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const icon = typeof req.body?.icon === 'string' ? req.body.icon.slice(0, 32) : '';
  if (!name || name.length > 80) return res.status(400).json({ error: 'name is required (max 80 chars)' });

  const { rows: cnt } = await pool.query('SELECT count(*)::int AS n FROM groups WHERE owner_id = $1', [req.userId]);
  if (cnt[0].n >= MAX_GROUPS_PER_USER) return res.status(429).json({ error: 'group limit reached' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let code;
    for (let i = 0; i < 5; i++) {
      code = genCode();
      const dup = await client.query('SELECT 1 FROM groups WHERE invite_code = $1', [code]);
      if (!dup.rows.length) break;
    }
    const { rows } = await client.query(
      `INSERT INTO groups (name, icon, owner_id, invite_code) VALUES ($1, $2, $3, $4)
       RETURNING id, name, icon, invite_code AS "inviteCode", owner_id AS "ownerId"`,
      [name, icon, req.userId, code]
    );
    await client.query(
      `INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [rows[0].id, req.userId]
    );
    await client.query('COMMIT');
    res.status(201).json({ ...rows[0], role: 'owner', memberCount: 1 });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}));

// rename / re-icon (owner only)
app.put('/groups/:id', asyncH(async (req, res) => {
  if ((await isMember(req.params.id, req.userId)) !== 'owner')
    return res.status(403).json({ error: 'only the owner can edit the group' });
  const sets = [];
  const vals = [];
  if (typeof req.body?.name === 'string' && req.body.name.trim()) {
    vals.push(req.body.name.trim().slice(0, 80));
    sets.push(`name = $${vals.length}`);
  }
  if (typeof req.body?.icon === 'string') {
    vals.push(req.body.icon.slice(0, 32));
    sets.push(`icon = $${vals.length}`);
  }
  if (!sets.length) return res.status(400).json({ error: 'nothing to update' });
  vals.push(req.params.id);
  const { rows } = await pool.query(
    `UPDATE groups SET ${sets.join(', ')} WHERE id = $${vals.length}
     RETURNING id, name, icon, invite_code AS "inviteCode", owner_id AS "ownerId"`,
    vals
  );
  res.json(rows[0]);
}));

// delete a group (owner only)
app.delete('/groups/:id', asyncH(async (req, res) => {
  if ((await isMember(req.params.id, req.userId)) !== 'owner')
    return res.status(403).json({ error: 'only the owner can delete the group' });
  await pool.query('DELETE FROM groups WHERE id = $1', [req.params.id]);
  res.status(204).end();
}));

// members of a group (any member may view)
app.get('/groups/:id/members', asyncH(async (req, res) => {
  if (!(await isMember(req.params.id, req.userId)))
    return res.status(403).json({ error: 'not a member' });
  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.email, gm.role, gm.joined_at AS "joinedAt"
     FROM group_members gm JOIN users u ON u.id = gm.user_id
     WHERE gm.group_id = $1 ORDER BY gm.joined_at`,
    [req.params.id]
  );
  res.json(rows);
}));

// leave a group (owner can't leave; must delete or transfer — kept simple: delete)
app.post('/groups/:id/leave', asyncH(async (req, res) => {
  const role = await isMember(req.params.id, req.userId);
  if (!role) return res.status(404).json({ error: 'not a member' });
  if (role === 'owner') return res.status(400).json({ error: 'owner must delete the group instead of leaving' });
  await pool.query('DELETE FROM group_members WHERE group_id = $1 AND user_id = $2', [req.params.id, req.userId]);
  // shares to this group are cleaned up by FK cascade on membership? No — clean explicitly:
  await pool.query(
    `DELETE FROM habit_shares hs USING habits h
     WHERE hs.habit_id = h.id AND h.user_id = $2 AND hs.group_id = $1`,
    [req.params.id, req.userId]
  );
  res.status(204).end();
}));

// ==========================================================================
// Invites
// ==========================================================================

// invite by email (owner or member)
app.post('/groups/:id/invites', asyncH(async (req, res) => {
  if (!(await isMember(req.params.id, req.userId)))
    return res.status(403).json({ error: 'not a member' });
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.status(400).json({ error: 'valid email required' });

  const { rows: mem } = await pool.query(
    `SELECT 1 FROM group_members gm JOIN users u ON u.id = gm.user_id
     WHERE gm.group_id = $1 AND lower(u.email) = $2`,
    [req.params.id, email]
  );
  if (mem.length) return res.status(409).json({ error: 'already a member' });

  const { rows } = await pool.query(
    `INSERT INTO group_invites (group_id, inviter_id, invitee_email)
     VALUES ($1, $2, $3)
     ON CONFLICT (group_id, invitee_email)
       DO UPDATE SET status = 'pending', inviter_id = EXCLUDED.inviter_id, created_at = now()
     RETURNING id, invitee_email AS "inviteeEmail", status`,
    [req.params.id, req.userId, email]
  );
  res.status(201).json(rows[0]);
}));

// my pending invites
app.get('/invites', asyncH(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT gi.id, gi.group_id AS "groupId", g.name AS "groupName", g.icon AS "groupIcon",
            u.name AS "inviterName", gi.created_at AS "createdAt"
     FROM group_invites gi
     JOIN groups g ON g.id = gi.group_id
     JOIN users u ON u.id = gi.inviter_id
     WHERE lower(gi.invitee_email) = lower($1) AND gi.status = 'pending'
     ORDER BY gi.created_at DESC`,
    [req.email]
  );
  res.json(rows);
}));

// accept / decline an invite
app.post('/invites/:id/:action', asyncH(async (req, res) => {
  const { id, action } = req.params;
  if (!['accept', 'decline'].includes(action)) return res.status(400).json({ error: 'bad action' });
  const { rows } = await pool.query(
    `SELECT group_id FROM group_invites
     WHERE id = $1 AND lower(invitee_email) = lower($2) AND status = 'pending'`,
    [id, req.email]
  );
  if (!rows.length) return res.status(404).json({ error: 'invite not found' });
  const groupId = rows[0].group_id;

  if (action === 'decline') {
    await pool.query(`UPDATE group_invites SET status = 'declined' WHERE id = $1`, [id]);
    return res.status(204).end();
  }
  const { rows: cnt } = await pool.query('SELECT count(*)::int AS n FROM group_members WHERE group_id = $1', [groupId]);
  if (cnt[0].n >= MAX_MEMBERS_PER_GROUP) return res.status(429).json({ error: 'group is full' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'member')
       ON CONFLICT DO NOTHING`,
      [groupId, req.userId]
    );
    await client.query(`UPDATE group_invites SET status = 'accepted' WHERE id = $1`, [id]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  res.status(201).json({ groupId });
}));

// join by invite code (link flow)
app.post('/join', asyncH(async (req, res) => {
  const code = typeof req.body?.code === 'string' ? req.body.code.trim().toUpperCase() : '';
  if (!code) return res.status(400).json({ error: 'invite code required' });
  const { rows } = await pool.query('SELECT id FROM groups WHERE invite_code = $1', [code]);
  if (!rows.length) return res.status(404).json({ error: 'invalid invite code' });
  const groupId = rows[0].id;
  if (await isMember(groupId, req.userId)) return res.json({ groupId }); // already in

  const { rows: cnt } = await pool.query('SELECT count(*)::int AS n FROM group_members WHERE group_id = $1', [groupId]);
  if (cnt[0].n >= MAX_MEMBERS_PER_GROUP) return res.status(429).json({ error: 'group is full' });
  await pool.query(
    `INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'member') ON CONFLICT DO NOTHING`,
    [groupId, req.userId]
  );
  res.status(201).json({ groupId });
}));

// ==========================================================================
// Sharing — which of MY habits are visible to a group
// ==========================================================================

// GET /groups/:id/shares -> array of my habitIds shared with this group
app.get('/groups/:id/shares', asyncH(async (req, res) => {
  if (!(await isMember(req.params.id, req.userId)))
    return res.status(403).json({ error: 'not a member' });
  const { rows } = await pool.query(
    `SELECT hs.habit_id AS "habitId" FROM habit_shares hs
     JOIN habits h ON h.id = hs.habit_id
     WHERE hs.group_id = $1 AND h.user_id = $2`,
    [req.params.id, req.userId]
  );
  res.json(rows.map((r) => r.habitId));
}));

// PUT /groups/:id/shares { habitIds: [...] } -> replace my share set for this group
app.put('/groups/:id/shares', asyncH(async (req, res) => {
  if (!(await isMember(req.params.id, req.userId)))
    return res.status(403).json({ error: 'not a member' });
  const ids = Array.isArray(req.body?.habitIds) ? req.body.habitIds : [];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // clear my existing shares for this group
    await client.query(
      `DELETE FROM habit_shares hs USING habits h
       WHERE hs.habit_id = h.id AND h.user_id = $2 AND hs.group_id = $1`,
      [req.params.id, req.userId]
    );
    // insert only habits I actually own
    for (const habitId of ids) {
      await client.query(
        `INSERT INTO habit_shares (habit_id, group_id)
         SELECT $1, $2 WHERE EXISTS (SELECT 1 FROM habits WHERE id = $1 AND user_id = $3)
         ON CONFLICT DO NOTHING`,
        [habitId, req.params.id, req.userId]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  res.json({ habitIds: ids });
}));

// ==========================================================================
// Group habits — one habit the whole group tracks together
// ==========================================================================

// create (any member)
app.post('/groups/:id/habits', asyncH(async (req, res) => {
  if (!(await isMember(req.params.id, req.userId)))
    return res.status(403).json({ error: 'not a member' });
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (!name || name.length > 80) return res.status(400).json({ error: 'name is required (max 80 chars)' });
  const icon = typeof req.body?.icon === 'string' && /^[a-z0-9-]*$/.test(req.body.icon)
    ? req.body.icon.slice(0, 32) : '';
  const color = typeof req.body?.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(req.body.color)
    ? req.body.color : '#7FD1AE';
  const question = typeof req.body?.question === 'string' ? req.body.question.trim().slice(0, 200) : '';
  const { rows: cnt } = await pool.query(
    'SELECT count(*)::int AS n FROM group_habits WHERE group_id = $1', [req.params.id]);
  if (cnt[0].n >= 20) return res.status(429).json({ error: 'group habit limit reached' });
  const { rows } = await pool.query(
    `INSERT INTO group_habits (group_id, name, question, icon, color, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, name, question, icon, color, created_by AS "createdBy"`,
    [req.params.id, name, question, icon, color, req.userId]
  );
  res.status(201).json(rows[0]);
}));

// delete (creator or group owner)
app.delete('/groups/:id/habits/:hid', asyncH(async (req, res) => {
  const role = await isMember(req.params.id, req.userId);
  if (!role) return res.status(403).json({ error: 'not a member' });
  const { rows } = await pool.query(
    'SELECT created_by FROM group_habits WHERE id = $1 AND group_id = $2',
    [req.params.hid, req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'not found' });
  if (rows[0].created_by !== req.userId && role !== 'owner')
    return res.status(403).json({ error: 'only the creator or group owner can delete this' });
  await pool.query('DELETE FROM group_habits WHERE id = $1', [req.params.hid]);
  res.status(204).end();
}));

// upsert/clear MY check-in for a date (value: 1 done, -1 skip, null clear)
app.put('/groups/:id/habits/:hid/my-entry', asyncH(async (req, res) => {
  if (!(await isMember(req.params.id, req.userId)))
    return res.status(403).json({ error: 'not a member' });
  const { date, value } = req.body ?? {};
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    return res.status(400).json({ error: 'date required (YYYY-MM-DD)' });
  if (date > new Date(Date.now() + 14 * 3600_000).toISOString().slice(0, 10))
    return res.status(400).json({ error: 'cannot log the future' });
  const { rows: gh } = await pool.query(
    'SELECT 1 FROM group_habits WHERE id = $1 AND group_id = $2',
    [req.params.hid, req.params.id]
  );
  if (!gh.length) return res.status(404).json({ error: 'group habit not found' });

  if (value === null) {
    await pool.query(
      'DELETE FROM group_habit_entries WHERE group_habit_id = $1 AND user_id = $2 AND date = $3',
      [req.params.hid, req.userId, date]
    );
    return res.status(204).end();
  }
  if (value !== 1 && value !== -1)
    return res.status(400).json({ error: 'value must be 1 (done), -1 (skip), or null (clear)' });
  await pool.query(
    `INSERT INTO group_habit_entries (group_habit_id, user_id, date, value)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (group_habit_id, user_id, date) DO UPDATE SET value = EXCLUDED.value`,
    [req.params.hid, req.userId, date, value]
  );
  res.json({ date, value });
}));

// ==========================================================================
// Reactions
// ==========================================================================

// react to another member's shared habit
app.post('/groups/:id/reactions', asyncH(async (req, res) => {
  if (!(await isMember(req.params.id, req.userId)))
    return res.status(403).json({ error: 'not a member' });
  const { toUser, habitId, emoji } = req.body ?? {};
  const e = typeof emoji === 'string' && emoji.length <= 8 ? emoji : '🔥';
  if (!toUser || !habitId) return res.status(400).json({ error: 'toUser and habitId required' });

  // the target habit must actually be shared with this group
  const { rows } = await pool.query(
    `SELECT 1 FROM habit_shares hs JOIN habits h ON h.id = hs.habit_id
     WHERE hs.group_id = $1 AND hs.habit_id = $2 AND h.user_id = $3`,
    [req.params.id, habitId, toUser]
  );
  if (!rows.length) return res.status(404).json({ error: 'habit not shared with this group' });

  await pool.query(
    `INSERT INTO reactions (group_id, from_user, to_user, habit_id, emoji)
     VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
    [req.params.id, req.userId, toUser, habitId, e]
  );
  res.status(201).json({ ok: true });
}));

// reactions I've received (bell feed)
app.get('/reactions', asyncH(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT r.emoji, r.created_at AS "createdAt", u.name AS "fromName",
            h.name AS "habitName", g.name AS "groupName"
     FROM reactions r
     JOIN users u ON u.id = r.from_user
     JOIN habits h ON h.id = r.habit_id
     JOIN groups g ON g.id = r.group_id
     WHERE r.to_user = $1
     ORDER BY r.created_at DESC LIMIT 30`,
    [req.userId]
  );
  res.json(rows);
}));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'internal error' });
});

app.listen(PORT, () => console.log(`social-service listening on :${PORT}`));
