import express from 'express';
import pg from 'pg';
import { metricsMiddleware, metricsHandler } from './metrics.js';
import crypto from 'node:crypto';
import { oidcEnabled, oidcInfo, authorizeUrl, handleCallback, postLoginUri } from './oidc.js';

const PORT = process.env.PORT || 3004;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const TOKEN_TTL_S = 60 * 60 * 24 * 30; // 30 days
const ALLOW_REGISTRATION = process.env.ALLOW_REGISTRATION !== 'false';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://openhabit:openhabit@localhost:5432/openhabit',
  max: 10,
});

const app = express();
app.use(metricsMiddleware('auth-service'));
app.use(express.json());
const asyncH = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// ---- password hashing (scrypt) -----------------------------------------
const scrypt = (pw, salt) =>
  new Promise((resolve, reject) =>
    crypto.scrypt(pw, salt, 64, (err, buf) => (err ? reject(err) : resolve(buf)))
  );

async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(pw, salt);
  return `s1$${salt.toString('base64')}$${hash.toString('base64')}`;
}

async function verifyPassword(pw, stored) {
  if (!stored) return false; // SSO-only account: no password set
  const [v, saltB64, hashB64] = stored.split('$');
  if (v !== 's1') return false;
  const hash = await scrypt(pw, Buffer.from(saltB64, 'base64'));
  const expected = Buffer.from(hashB64, 'base64');
  return hash.length === expected.length && crypto.timingSafeEqual(hash, expected);
}

// ---- JWT (HS256) --------------------------------------------------------
const b64url = (buf) => Buffer.from(buf).toString('base64url');

function signToken(user) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(JSON.stringify({
    sub: user.id, email: user.email, name: user.name, iat: now, exp: now + TOKEN_TTL_S,
  }));
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
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
  } catch {
    return null;
  }
}

function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const payload = verifyToken(h.startsWith('Bearer ') ? h.slice(7) : null);
  if (!payload) return res.status(401).json({ error: 'unauthorized' });
  req.userId = payload.sub;
  next();
}

// ---- brute-force protection: 10 attempts / 15 min per IP+email ---------
const attempts = new Map(); // key -> { count, resetAt }
const RATE_MAX = 10;
const RATE_WINDOW_MS = 15 * 60 * 1000;

function rateLimited(key) {
  const now = Date.now();
  const rec = attempts.get(key);
  if (!rec || rec.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  rec.count += 1;
  return rec.count > RATE_MAX;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of attempts) if (v.resetAt < now) attempts.delete(k);
}, 60_000).unref();

const PUBLIC_USER = `id, email, name, ntfy_url AS "ntfyUrl", timezone, created_at AS "createdAt"`;
const VALID_TZ = new Set([...Intl.supportedValuesOf('timeZone'), 'UTC']);
const validNtfy = (v) => typeof v === 'string' && v.length <= 300 && (v === '' || /^https?:\/\//.test(v));
const validEmail = (e) => typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254;
const validPassword = (p) => typeof p === 'string' && p.length >= 8 && p.length <= 128;

// ---- routes -------------------------------------------------------------
app.get('/metrics', await metricsHandler(pool, 'auth-service'));

app.get('/healthz', asyncH(async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ status: 'ok', service: 'auth-service' });
}));

app.post('/auth/register', asyncH(async (req, res) => {
  if (!ALLOW_REGISTRATION) return res.status(403).json({ error: 'registration is disabled' });
  const { email, password, name } = req.body;
  if (!validEmail(email)) return res.status(400).json({ error: 'valid email required' });
  if (!validPassword(password)) return res.status(400).json({ error: 'password must be at least 8 characters' });
  const passwordHash = await hashPassword(password);
  try {
    const { rows } = await pool.query(
      `INSERT INTO users (email, name, password_hash) VALUES (lower($1), $2, $3) RETURNING ${PUBLIC_USER}`,
      [email.trim(), typeof name === 'string' ? name.trim().slice(0, 100) : '', passwordHash]
    );
    res.status(201).json({ token: signToken(rows[0]), user: rows[0] });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'an account with this email already exists' });
    throw e;
  }
}));

app.post('/auth/login', asyncH(async (req, res) => {
  const { email, password } = req.body;
  if (!validEmail(email) || typeof password !== 'string')
    return res.status(400).json({ error: 'email and password required' });
  const rateKey = `${req.ip}|${String(email).toLowerCase()}`;
  if (rateLimited(rateKey))
    return res.status(429).json({ error: 'too many attempts — try again in a few minutes' });
  const { rows } = await pool.query(
    `SELECT ${PUBLIC_USER}, password_hash FROM users WHERE email = lower($1)`,
    [email.trim()]
  );
  const invalid = () => res.status(401).json({ error: 'invalid email or password' });
  if (!rows.length) return invalid();
  const ok = await verifyPassword(password, rows[0].password_hash);
  if (!ok) return invalid();
  const { password_hash, ...user } = rows[0];
  res.json({ token: signToken(user), user });
}));

// tells the SPA whether password login/registration and SSO are available
app.get('/auth/config', (_req, res) => {
  res.json({
    registration: ALLOW_REGISTRATION,
    oidc: oidcInfo.enabled ? { enabled: true, name: oidcInfo.name } : { enabled: false },
  });
});

// ---- OIDC / SSO ---------------------------------------------------------
// 1) browser hits this; we redirect to the identity provider
app.get('/auth/oidc/login', asyncH(async (_req, res) => {
  if (!oidcEnabled) return res.status(404).json({ error: 'SSO is not configured' });
  res.redirect(await authorizeUrl());
}));

// 2) provider redirects back here with ?code&state; we exchange, upsert, and
//    hand the SPA our own JWT via a short-lived URL fragment
app.get('/auth/oidc/callback', asyncH(async (req, res) => {
  if (!oidcEnabled) return res.status(404).json({ error: 'SSO is not configured' });
  const { code, state, error } = req.query;
  const fail = (msg) => res.redirect(`${postLoginUri}#sso_error=${encodeURIComponent(msg)}`);
  if (error) return fail(String(error));
  if (!code || !state) return fail('missing code/state');

  let claims;
  try {
    claims = await handleCallback(String(code), String(state));
  } catch (e) {
    return fail(e.message || 'sso failed');
  }
  if (!claims.email) return fail('provider did not return an email');

  // Upsert: match by (iss, sub) first; else adopt an existing same-email account
  // (linking a password account to SSO); else create a new SSO-only user.
  let user;
  const byIdent = await pool.query(
    `SELECT ${PUBLIC_USER} FROM users WHERE oidc_iss = $1 AND oidc_sub = $2`,
    [claims.iss, claims.sub]
  );
  if (byIdent.rows.length) {
    user = byIdent.rows[0];
  } else {
    const byEmail = await pool.query('SELECT id FROM users WHERE email = lower($1)', [claims.email]);
    if (byEmail.rows.length) {
      const upd = await pool.query(
        `UPDATE users SET oidc_iss = $1, oidc_sub = $2 WHERE id = $3 RETURNING ${PUBLIC_USER}`,
        [claims.iss, claims.sub, byEmail.rows[0].id]
      );
      user = upd.rows[0];
    } else {
      if (!ALLOW_REGISTRATION) return fail('registration is disabled');
      const ins = await pool.query(
        `INSERT INTO users (email, name, oidc_iss, oidc_sub) VALUES (lower($1), $2, $3, $4) RETURNING ${PUBLIC_USER}`,
        [claims.email, claims.name.slice(0, 100), claims.iss, claims.sub]
      );
      user = ins.rows[0];
    }
  }
  const token = signToken(user);
  res.redirect(`${postLoginUri}#sso_token=${encodeURIComponent(token)}`);
}));

app.get('/auth/me', auth, asyncH(async (req, res) => {
  const { rows } = await pool.query(`SELECT ${PUBLIC_USER} FROM users WHERE id = $1`, [req.userId]);
  if (!rows.length) return res.status(401).json({ error: 'unauthorized' });
  res.json(rows[0]);
}));

// change name and/or password
app.put('/auth/me', auth, asyncH(async (req, res) => {
  const { name, currentPassword, newPassword } = req.body;
  if (newPassword !== undefined) {
    if (!validPassword(newPassword)) return res.status(400).json({ error: 'new password must be at least 8 characters' });
    const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.userId]);
    if (!rows.length || !(await verifyPassword(currentPassword ?? '', rows[0].password_hash)))
      return res.status(401).json({ error: 'current password is incorrect' });
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [await hashPassword(newPassword), req.userId]);
  }
  if (typeof name === 'string') {
    await pool.query('UPDATE users SET name = $1 WHERE id = $2', [name.trim().slice(0, 100), req.userId]);
  }
  const { ntfyUrl, timezone } = req.body;
  if (ntfyUrl !== undefined) {
    if (!validNtfy(ntfyUrl)) return res.status(400).json({ error: 'ntfy URL must be http(s) or empty' });
    await pool.query('UPDATE users SET ntfy_url = $1 WHERE id = $2', [ntfyUrl.trim(), req.userId]);
  }
  if (timezone !== undefined) {
    if (typeof timezone !== 'string' || !VALID_TZ.has(timezone))
      return res.status(400).json({ error: 'unknown timezone' });
    await pool.query('UPDATE users SET timezone = $1 WHERE id = $2', [timezone, req.userId]);
  }
  const { rows } = await pool.query(`SELECT ${PUBLIC_USER} FROM users WHERE id = $1`, [req.userId]);
  res.json(rows[0]);
}));

// delete account and (via FK cascade) all habits, entries, wellness
app.delete('/auth/me', auth, asyncH(async (req, res) => {
  const { password } = req.body ?? {};
  const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.userId]);
  if (!rows.length || !(await verifyPassword(password ?? '', rows[0].password_hash)))
    return res.status(401).json({ error: 'password confirmation required' });
  await pool.query('DELETE FROM users WHERE id = $1', [req.userId]);
  res.status(204).end();
}));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'internal error' });
});

app.listen(PORT, () => console.log(`auth-service listening on :${PORT}`));
