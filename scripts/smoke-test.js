#!/usr/bin/env node
// End-to-end smoke test: starts every service against a real Postgres, each
// logged in as its own least-privilege role, and drives the main user flows.
// Fails on any unexpected status, 5xx, or "permission denied" in service logs.
//
// Prerequisites: db/init.sql applied, role passwords set (scripts/set-db-passwords.sh),
// `npm ci` done in each service. Connection via PGHOST/PGPORT/PGDATABASE and the
// <SERVICE>_DB_PASSWORD variables (same names as .env).
const { spawn } = require('child_process');
const crypto = require('crypto');
const http = require('http');
const path = require('path');

const root = path.join(__dirname, '..');
const host = process.env.PGHOST || 'localhost';
const port = process.env.PGPORT || '5432';
const db = process.env.PGDATABASE || 'openhabit';
const JWT_SECRET = crypto.randomBytes(48).toString('base64');

const SERVICES = {
  auth: 3911, habit: 3912, tracking: 3913, analytics: 3914, social: 3915, reminder: 3916,
};

const procs = [];
const logs = {};
const failures = [];

function dbUrl(name) {
  const pw = process.env[`${name.toUpperCase()}_DB_PASSWORD`];
  if (!pw) throw new Error(`${name.toUpperCase()}_DB_PASSWORD is not set`);
  return `postgres://${name}_svc:${encodeURIComponent(pw)}@${host}:${port}/${db}`;
}

function start(name) {
  logs[name] = '';
  const p = spawn(process.execPath, ['src/index.js'], {
    cwd: path.join(root, 'services', `${name}-service`),
    env: { ...process.env, PORT: String(SERVICES[name]), DATABASE_URL: dbUrl(name), JWT_SECRET, TICK_MS: '300' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  p.stdout.on('data', (d) => { logs[name] += d; });
  p.stderr.on('data', (d) => { logs[name] += d; });
  procs.push(p);
}

async function waitHealthy(name) {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`http://localhost:${SERVICES[name]}/healthz`);
      if (r.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`${name}-service did not become healthy:\n${logs[name]}`);
}

/** Calls a service and records a failure unless the status is in `expect`. */
async function call(svc, method, url, { token, body, expect = [200, 201, 204] } = {}) {
  const res = await fetch(`http://localhost:${SERVICES[svc]}${url}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  const ok = expect.includes(res.status);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${res.status} ${svc.padEnd(9)} ${method} ${url}`);
  if (!ok) failures.push(`${svc} ${method} ${url} -> ${res.status} ${text.slice(0, 200)}`);
  return json ?? {};
}

const today = new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

async function main() {
  // Catches reminder pushes so the ntfy path is exercised without the internet.
  let ntfyHits = 0;
  const ntfy = http.createServer((req, res) => { ntfyHits++; req.resume(); res.end('ok'); });
  await new Promise((r) => ntfy.listen(0, r));
  const ntfyUrl = `http://localhost:${ntfy.address().port}/openhabit-smoke`;

  for (const name of Object.keys(SERVICES)) start(name);
  await Promise.all(Object.keys(SERVICES).map(waitHealthy));

  // ---- auth --------------------------------------------------------------
  const tag = crypto.randomBytes(4).toString('hex');
  const reg = (who) => call('auth', 'POST', '/auth/register', {
    body: { email: `${who}-${tag}@smoke.test`, password: 'smoke-password-1', name: who },
  });
  const a = await reg('alice');
  const b = await reg('bob');
  const A = a.token;
  const B = b.token;
  await call('auth', 'POST', '/auth/login', { body: { email: `alice-${tag}@smoke.test`, password: 'smoke-password-1' } });
  await call('auth', 'GET', '/auth/me', { token: A });
  await call('auth', 'PUT', '/auth/me', { token: A, body: { ntfyUrl, timezone: 'UTC' } });
  const tok = await call('auth', 'POST', '/auth/tokens', { token: A, body: { name: 'smoke' } });
  const T = tok.token;
  await call('auth', 'GET', '/auth/tokens', { token: A });
  await call('auth', 'GET', '/auth/me', { token: T });
  await call('auth', 'POST', '/auth/tokens', { token: T, body: { name: 'nope' }, expect: [403] });

  // ---- habits ------------------------------------------------------------
  const h1 = await call('habit', 'POST', '/habits', {
    token: A, body: { name: 'Read', activeDays: [0, 1, 2, 3, 4, 5, 6] },
  });
  const h2 = await call('habit', 'POST', '/habits', {
    token: A, body: { name: 'Gym', scheduleType: 'per_week', frequency: 3 },
  });
  await call('habit', 'GET', '/habits', { token: A });
  await call('habit', 'GET', '/habits', { token: T });
  await call('habit', 'GET', `/habits/${h1.id}`, { token: A });
  await call('habit', 'PUT', `/habits/${h1.id}`, { token: A, body: { question: 'Did you read?' } });
  await call('habit', 'PUT', '/habits/reorder', { token: A, body: { ids: [h2.id, h1.id] } });
  await call('habit', 'GET', `/habits/${h1.id}`, { token: B, expect: [404] });

  // ---- entries & wellness ------------------------------------------------
  await call('tracking', 'PUT', '/entries', { token: A, body: { habitId: h1.id, date: today, value: 1, notes: 'smoke' } });
  await call('tracking', 'PUT', '/entries', { token: T, body: { habitId: h2.id, date: today, value: 1 } });
  await call('tracking', 'POST', '/entries/bulk', {
    token: A,
    body: { entries: [1, 2, 3].map((n) => ({ habitId: h1.id, date: daysAgo(n), value: 1 })) },
  });
  await call('tracking', 'GET', `/entries?from=${daysAgo(30)}&to=${today}`, { token: A });
  await call('tracking', 'DELETE', `/entries/${h2.id}/${today}`, { token: A });
  await call('tracking', 'PUT', '/wellness', { token: A, body: { date: today, mood: 4, sleepHours: 7.5 } });
  await call('tracking', 'GET', `/wellness?from=${daysAgo(30)}&to=${today}`, { token: A });
  await call('tracking', 'PUT', '/entries', { token: B, body: { habitId: h1.id, date: today, value: 1 }, expect: [404] });

  // ---- analytics ---------------------------------------------------------
  await call('analytics', 'GET', '/analytics/overview', { token: A });
  await call('analytics', 'GET', '/analytics/overview', { token: T });
  await call('analytics', 'GET', `/analytics/habits/${h1.id}`, { token: A });
  await call('analytics', 'GET', `/analytics/habits/${h2.id}`, { token: A });
  await call('analytics', 'GET', '/analytics/insights', { token: A });

  // ---- groups ------------------------------------------------------------
  const g = await call('social', 'POST', '/groups', { token: A, body: { name: 'Smoke crew' } });
  await call('social', 'POST', '/join', { token: B, body: { code: g.inviteCode } });
  await call('social', 'GET', '/groups', { token: B });
  await call('social', 'GET', `/groups/${g.id}/members`, { token: A });
  await call('social', 'PUT', `/groups/${g.id}`, { token: A, body: { name: 'Smoke crew 2' } });
  await call('social', 'PUT', `/groups/${g.id}/shares`, { token: A, body: { habitIds: [h1.id] } });
  await call('social', 'GET', `/groups/${g.id}/shares`, { token: A });
  const gh = await call('social', 'POST', `/groups/${g.id}/habits`, { token: A, body: { name: 'Walk' } });
  await call('social', 'PUT', `/groups/${g.id}/habits/${gh.id}/my-entry`, { token: A, body: { date: today, value: 1 } });
  await call('social', 'PUT', `/groups/${g.id}/habits/${gh.id}/my-entry`, { token: T, body: { date: today, value: 1 } });
  await call('social', 'POST', `/groups/${g.id}/reactions`, {
    token: B, body: { toUser: a.user.id, habitId: h1.id, emoji: '🔥' },
  });
  await call('social', 'GET', '/reactions', { token: A });
  await call('analytics', 'GET', `/analytics/groups/${g.id}`, { token: A });
  await call('analytics', 'GET', `/analytics/groups/${g.id}`, { token: B });

  const c = await reg('carol');
  const C = c.token;
  await call('social', 'POST', `/groups/${g.id}/invites`, { token: A, body: { email: `carol-${tag}@smoke.test` } });
  const invites = await call('social', 'GET', '/invites', { token: C });
  const inviteId = (Array.isArray(invites) ? invites : invites.invites ?? [])[0]?.id;
  if (inviteId) await call('social', 'POST', `/invites/${inviteId}/accept`, { token: C });
  else failures.push('social GET /invites returned no invite for carol');

  await call('social', 'POST', `/groups/${g.id}/leave`, { token: B });
  await call('social', 'DELETE', `/groups/${g.id}/habits/${gh.id}`, { token: A });

  // ---- reminders: the tick runs every 300 ms and fires on an exact HH:MM ----
  // An unchecked habit due "now" must produce one ntfy push; re-aim it if the
  // minute rolls over while we wait.
  const due = await call('habit', 'POST', '/habits', { token: A, body: { name: 'Stretch' } });
  for (let i = 0; i < 10 && !ntfyHits; i++) {
    await call('habit', 'PUT', `/habits/${due.id}`, { token: A, body: { reminderTime: new Date().toISOString().slice(11, 16) } });
    await new Promise((r) => setTimeout(r, 700));
  }
  const metrics = await (await fetch(`http://localhost:${SERVICES.reminder}/metrics`)).text();
  const metric = (n) => Number((metrics.match(new RegExp(`^${n}(?:\\{[^}]*\\})? (\\S+)`, 'm')) || [])[1] ?? NaN);
  const ticks = metric('openhabit_reminder_ticks_total');
  const tickErrors = metric('openhabit_reminder_tick_errors_total');
  const remindersOk = ticks > 0 && tickErrors === 0 && ntfyHits > 0;
  console.log(`${remindersOk ? 'ok  ' : 'FAIL'} reminder ticks=${ticks} errors=${tickErrors} ntfy pushes=${ntfyHits}`);
  if (!remindersOk) failures.push(`reminder: ticks=${ticks} errors=${tickErrors} ntfy pushes=${ntfyHits}`);

  // ---- teardown flows: token revoke, group & account deletion ---------------
  await call('auth', 'DELETE', `/auth/tokens/${tok.id}`, { token: A });
  await call('habit', 'GET', '/habits', { token: T, expect: [401] });
  await call('social', 'DELETE', `/groups/${g.id}`, { token: A });
  await call('habit', 'DELETE', `/habits/${h2.id}`, { token: A });
  for (const t of [A, B, C]) {
    await call('auth', 'DELETE', '/auth/me', { token: t, body: { password: 'smoke-password-1' } });
  }

  ntfy.close();
}

function finish(code) {
  for (const p of procs) p.kill();
  for (const [name, log] of Object.entries(logs)) {
    if (/permission denied/i.test(log)) {
      failures.push(`${name}-service logged a permission error:\n${log.split('\n').filter((l) => /permission denied/i.test(l)).join('\n')}`);
    }
  }
  if (failures.length) {
    console.error(`\n${failures.length} failure(s):\n- ${failures.join('\n- ')}`);
    process.exit(1);
  }
  console.log('\nsmoke test passed');
  process.exit(code);
}

main().then(() => finish(0), (e) => { failures.push(e.stack || String(e)); finish(1); });
