import express from 'express';
import pg from 'pg';
import { metricsMiddleware, metricsHandler } from './metrics.js';
import crypto from 'node:crypto';
import { mailEnabled, sendMail, verifyMessage, resetMessage } from './mail.js';
import { oidcEnabled, oidcInfo, authorizeUrl, handleCallback, postLoginUri } from './oidc.js';

const PORT = process.env.PORT || 3004;
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32 || /change-me/i.test(JWT_SECRET)) {
  console.error('FATAL: JWT_SECRET must be a random string of at least 32 characters, shared by all services (e.g. `openssl rand -base64 48`).');
  process.exit(1);
}
const TOKEN_TTL_S = 60 * 60 * 24 * 30; // 30 days
const ALLOW_REGISTRATION = process.env.ALLOW_REGISTRATION !== 'false';
// with email on, optionally refuse sign-in until the address is confirmed
const REQUIRE_VERIFIED = process.env.REQUIRE_EMAIL_VERIFICATION === 'true' && mailEnabled;

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://openhabit:openhabit@localhost:5432/openhabit',
  max: Number(process.env.PG_POOL_MAX) || 10,
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

// ---- brute-force protection: 10 attempts / 15 min per IP+email ---------
const attempts = new Map(); // key -> { count, resetAt }
const RATE_MAX = 10;
const RATE_WINDOW_MS = 15 * 60 * 1000;

function rateLimited(key, max = RATE_MAX) {
  const now = Date.now();
  const rec = attempts.get(key);
  if (!rec || rec.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  rec.count += 1;
  return rec.count > max;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of attempts) if (v.resetAt < now) attempts.delete(k);
}, 60_000).unref();

const PUBLIC_USER = `id, email, name, ntfy_url AS "ntfyUrl", timezone,
  quiet_start AS "quietStart", quiet_end AS "quietEnd", created_at AS "createdAt",
  (email_verified_at IS NOT NULL) AS "emailVerified"`;
const VALID_TZ = new Set([...Intl.supportedValuesOf('timeZone'), 'UTC']);
const validHm = (v) => typeof v === 'string' && (v === '' || /^([01]\d|2[0-3]):[0-5]\d$/.test(v));
const validNtfy = (v) => typeof v === 'string' && v.length <= 300 && (v === '' || /^https?:\/\//.test(v));
const validEmail = (e) => typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254;
const validPassword = (p) => typeof p === 'string' && p.length >= 8 && p.length <= 128;


// ---- one-time email links (verify / reset) ------------------------------
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const LINK_TTL = { verify: 24 * 3600, reset: 3600 }; // seconds

/** Issues a link token (invalidating earlier unused ones of the same kind) and emails it. */
async function issueEmailToken(user, kind) {
  const token = crypto.randomBytes(32).toString('base64url');
  await pool.query(`UPDATE email_tokens SET used_at = now() WHERE user_id = $1 AND kind = $2 AND used_at IS NULL`, [user.id, kind]);
  await pool.query(
    `INSERT INTO email_tokens (user_id, kind, email, token_hash, expires_at) VALUES ($1, $2, $3, $4, now() + ($5 || ' seconds')::interval)`,
    [user.id, kind, user.email, sha256(token), String(LINK_TTL[kind])]
  );
  const msg = (kind === 'verify' ? verifyMessage : resetMessage)(user.name, token);
  await sendMail({ to: user.email, ...msg });
}

/** Consumes a link token atomically; returns its row, or null when unknown, used or expired. */
async function consumeEmailToken(token, kind) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
  const { rows } = await pool.query(
    `UPDATE email_tokens SET used_at = now()
     WHERE token_hash = $1 AND kind = $2 AND used_at IS NULL AND expires_at > now()
     RETURNING user_id, email`,
    [sha256(token), kind]
  );
  return rows[0] ?? null;
}

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
    if (mailEnabled) await issueEmailToken(rows[0], 'verify').catch((e) => console.error('verification email failed:', e.message));
    if (REQUIRE_VERIFIED) return res.status(201).json({ verificationRequired: true, user: rows[0] });
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
  if (REQUIRE_VERIFIED && !user.emailVerified)
    return res.status(403).json({ error: 'confirm your email address first: check your inbox for the link', code: 'email_unverified' });
  res.json({ token: signToken(user), user });
}));

// ---- password reset and email verification ------------------------------
// Always answers 200 so the endpoint cannot be used to find out which emails have accounts.
app.post('/auth/forgot', asyncH(async (req, res) => {
  if (!mailEnabled) return res.status(501).json({ error: 'email is not set up on this server; ask its administrator to reset your password' });
  const { email } = req.body;
  if (!validEmail(email)) return res.status(400).json({ error: 'valid email required' });
  const addr = email.trim().toLowerCase();
  if (rateLimited(`forgot|${req.ip}`) || rateLimited(`forgot|${addr}`, 3)) return res.status(429).json({ error: 'too many requests: try again in a few minutes' });
  const { rows } = await pool.query(`SELECT id, email, name FROM users WHERE email = $1 AND password_hash IS NOT NULL`, [addr]);
  if (rows.length) await issueEmailToken(rows[0], 'reset').catch((e) => console.error('reset email failed:', e.message));
  res.json({ ok: true });
}));

app.post('/auth/reset', asyncH(async (req, res) => {
  const { token, password } = req.body;
  if (!validPassword(password)) return res.status(400).json({ error: 'password must be at least 8 characters' });
  if (rateLimited(`reset|${req.ip}`)) return res.status(429).json({ error: 'too many attempts: try again in a few minutes' });
  const row = await consumeEmailToken(token, 'reset');
  if (!row) return res.status(400).json({ error: 'this link is invalid or has expired: request a new one' });
  const hash = await hashPassword(password);
  // choosing a password through the emailed link also proves the inbox is theirs
  await pool.query(`UPDATE users SET password_hash = $1, email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $2 AND email = $3`, [hash, row.user_id, row.email]);
  await pool.query(`UPDATE email_tokens SET used_at = now() WHERE user_id = $1 AND kind = 'reset' AND used_at IS NULL`, [row.user_id]);
  res.json({ ok: true });
}));

app.post('/auth/verify', asyncH(async (req, res) => {
  if (rateLimited(`verify|${req.ip}`)) return res.status(429).json({ error: 'too many attempts: try again in a few minutes' });
  const row = await consumeEmailToken(req.body.token, 'verify');
  if (!row) return res.status(400).json({ error: 'this link is invalid or has expired: request a new one from your account menu' });
  await pool.query(`UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1 AND email = $2`, [row.user_id, row.email]);
  res.json({ ok: true });
}));

// control-plane routes require a real session, not an API token — a leaked
// automation token must not be able to mint tokens or take over the account
const requireSession = (req, res, next) =>
  req.authMethod === 'token'
    ? res.status(403).json({ error: 'this action requires signing in (API tokens cannot manage the account)' })
    : next();

app.post('/auth/verify/send', auth, requireSession, asyncH(async (req, res) => {
  if (!mailEnabled) return res.status(501).json({ error: 'email is not set up on this server' });
  if (rateLimited(`verify-send|${req.userId}`, 3)) return res.status(429).json({ error: 'too many requests: try again in a few minutes' });
  const { rows } = await pool.query(`SELECT id, email, name, email_verified_at FROM users WHERE id = $1`, [req.userId]);
  if (!rows.length) return res.status(401).json({ error: 'unauthorized' });
  if (rows[0].email_verified_at) return res.json({ ok: true, verified: true });
  await issueEmailToken(rows[0], 'verify');
  res.json({ ok: true, verified: false });
}));

// ---- personal API tokens ------------------------------------------------
const MAX_TOKENS_PER_USER = 20;

app.get('/auth/tokens', auth, requireSession, asyncH(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, name, prefix, last_used_at AS "lastUsedAt", created_at AS "createdAt"
     FROM api_tokens WHERE user_id = $1 ORDER BY created_at DESC`,
    [req.userId]
  );
  res.json(rows);
}));

app.post('/auth/tokens', auth, requireSession, asyncH(async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 60) : '';
  if (!name) return res.status(400).json({ error: 'a name is required (e.g. "Shortcuts on my phone")' });
  const { rows: cnt } = await pool.query(
    'SELECT count(*)::int AS n FROM api_tokens WHERE user_id = $1', [req.userId]);
  if (cnt[0].n >= MAX_TOKENS_PER_USER) return res.status(429).json({ error: 'token limit reached' });

  const token = 'oh_' + crypto.randomBytes(32).toString('base64url');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const { rows } = await pool.query(
    `INSERT INTO api_tokens (user_id, name, token_hash, prefix)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, prefix, created_at AS "createdAt"`,
    [req.userId, name, hash, token.slice(0, 12) + '…']
  );
  // the plaintext token is returned exactly once
  res.status(201).json({ ...rows[0], token });
}));

app.delete('/auth/tokens/:id', auth, requireSession, asyncH(async (req, res) => {
  const { rowCount } = await pool.query(
    'DELETE FROM api_tokens WHERE id = $1 AND user_id = $2',
    [req.params.id, req.userId]
  );
  if (!rowCount) return res.status(404).json({ error: 'token not found' });
  res.status(204).end();
}));

// ---- Web Push subscriptions (reminders on this device) --------------------
// The browser subscribes with the server's VAPID public key; reminder-service
// delivers to every subscription of the user. Endpoints must be HTTPS URLs of
// a known push service (PUSH_ENDPOINT_HOSTS), so reminders can't be pointed
// at arbitrary hosts.
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const PUSH_HOSTS = (process.env.PUSH_ENDPOINT_HOSTS
  || 'fcm.googleapis.com,push.services.mozilla.com,push.apple.com,notify.windows.com')
  .split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
const MAX_PUSH_SUBSCRIPTIONS = 10;
const B64URL = /^[A-Za-z0-9_-]+$/;

function validPushEndpoint(endpoint) {
  let u;
  try { u = new URL(endpoint); } catch { return false; }
  const host = u.hostname.toLowerCase();
  const allowed = PUSH_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  const local = host === 'localhost' || host === '127.0.0.1'; // only if listed (tests)
  return allowed && (u.protocol === 'https:' || (local && u.protocol === 'http:')) && endpoint.length <= 1000;
}

app.get('/auth/push/key', auth, (_req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY || null });
});

app.post('/auth/push/subscriptions', auth, requireSession, asyncH(async (req, res) => {
  if (!VAPID_PUBLIC_KEY) return res.status(404).json({ error: 'push notifications are not configured on this server' });
  const { endpoint, keys } = req.body ?? {};
  if (typeof endpoint !== 'string' || !validPushEndpoint(endpoint))
    return res.status(400).json({ error: 'unsupported push endpoint' });
  const p256dh = keys?.p256dh;
  const authKey = keys?.auth;
  if (typeof p256dh !== 'string' || !B64URL.test(p256dh) || Buffer.from(p256dh, 'base64url').length !== 65
    || typeof authKey !== 'string' || !B64URL.test(authKey) || Buffer.from(authKey, 'base64url').length !== 16)
    return res.status(400).json({ error: 'invalid subscription keys' });
  const { rows: cnt } = await pool.query(
    'SELECT count(*)::int AS n FROM push_subscriptions WHERE user_id = $1 AND endpoint <> $2', [req.userId, endpoint]);
  if (cnt[0].n >= MAX_PUSH_SUBSCRIPTIONS) return res.status(429).json({ error: 'too many devices; remove one first' });
  // a browser belongs to whoever signed in on it last
  await pool.query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES ($1, $2, $3, $4)
     ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
    [req.userId, endpoint, p256dh, authKey]
  );
  res.status(201).json({ ok: true });
}));

app.delete('/auth/push/subscriptions', auth, requireSession, asyncH(async (req, res) => {
  const endpoint = req.body?.endpoint;
  if (typeof endpoint !== 'string') return res.status(400).json({ error: 'endpoint is required' });
  await pool.query('DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2', [req.userId, endpoint]);
  res.status(204).end();
}));

// tells the SPA whether password login/registration and SSO are available
app.get('/auth/config', (_req, res) => {
  res.json({
    registration: ALLOW_REGISTRATION,
    mail: mailEnabled,
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
        `INSERT INTO users (email, name, oidc_iss, oidc_sub, email_verified_at) VALUES (lower($1), $2, $3, $4, now()) RETURNING ${PUBLIC_USER}`,
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
app.put('/auth/me', auth, requireSession, asyncH(async (req, res) => {
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
  const { quietStart, quietEnd } = req.body;
  if (quietStart !== undefined || quietEnd !== undefined) {
    if (!validHm(quietStart) || !validHm(quietEnd) || (quietStart === '') !== (quietEnd === ''))
      return res.status(400).json({ error: 'quiet hours need both a start and an end (HH:MM), or neither' });
    await pool.query('UPDATE users SET quiet_start = $1, quiet_end = $2 WHERE id = $3', [quietStart, quietEnd, req.userId]);
  }
  const { rows } = await pool.query(`SELECT ${PUBLIC_USER} FROM users WHERE id = $1`, [req.userId]);
  res.json(rows[0]);
}));

// delete account and (via FK cascade) all habits, entries, wellness
app.delete('/auth/me', auth, requireSession, asyncH(async (req, res) => {
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

// On AWS Lambda, src/lambda.js serves `app` instead (see services/_shared/lambda.js).
export { app };
if (process.env.OPENHABIT_RUNTIME !== 'lambda') {
  app.listen(PORT, () => console.log(`auth-service listening on :${PORT}`));
}
