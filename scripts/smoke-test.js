#!/usr/bin/env node
// End-to-end smoke test: starts every service against a real Postgres, each
// logged in as its own least-privilege role, and drives the main user flows.
// Fails on any unexpected status, 5xx, or "permission denied" in service logs.
//
//   node scripts/smoke-test.js           services as HTTP servers (docker/k8s shape)
//   node scripts/smoke-test.js --lambda  the same flows through each service's AWS
//                                        Lambda handler (API Gateway v2 events, and
//                                        EventBridge Scheduler events for reminders)
//   node scripts/smoke-test.js --url https://<api-id>.execute-api.<region>.amazonaws.com
//                                        the same API flows against a live deployment;
//                                        reminder pushes aren't observable from here, so
//                                        it invokes the reminder Lambda directly (aws CLI,
//                                        SMOKE_REMINDER_FUNCTION) and checks the frontend
//
// Prerequisites: db/init.sql applied, role passwords set (db/set-db-passwords.sh),
// `npm ci` done in each service, `psql` on PATH. Connection via the PG* variables
// (an admin login, used only to fast-forward a snooze) and the <SERVICE>_DB_PASSWORD
// variables (same names as .env).
const { spawn, execFileSync } = require('child_process');
const { pathToFileURL } = require('url');
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
  reminder2: 3917, // a second reminder-service replica: sends must still happen once
};
const serviceDir = (name) => name.replace(/\d+$/, '');

const LAMBDA = process.argv.includes('--lambda');
const urlArg = process.argv.indexOf('--url');
const REMOTE = urlArg > -1 ? process.argv[urlArg + 1].replace(/\/+$/, '') : '';
const handlers = {};
let schedulerErrors = 0;
const procs = [];
const logs = {};
const failures = [];

function dbUrl(name) {
  name = serviceDir(name);
  const pw = process.env[`${name.toUpperCase()}_DB_PASSWORD`];
  if (!pw) throw new Error(`${name.toUpperCase()}_DB_PASSWORD is not set`);
  return `postgres://${name}_svc:${encodeURIComponent(pw)}@${host}:${port}/${db}`;
}

function start(name) {
  logs[name] = '';
  const p = spawn(process.execPath, ['src/index.js'], {
    cwd: path.join(root, 'services', `${serviceDir(name)}-service`),
    env: {
      ...process.env, PORT: String(SERVICES[name]), DATABASE_URL: dbUrl(name), JWT_SECRET, TICK_MS: '300',
      PUBLIC_URL: 'https://habits.smoke.test',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  p.stdout.on('data', (d) => { logs[name] += d; });
  p.stderr.on('data', (d) => { logs[name] += d; });
  procs.push(p);
}

/** Lambda mode: import each service's handler with that service's own environment. */
async function loadHandlers() {
  logs.lambda = '';
  const origError = console.error;
  console.error = (...a) => { logs.lambda += `${a.join(' ')}\n`; origError(...a); };
  for (const name of Object.keys(SERVICES).filter((n) => n === serviceDir(n))) {
    Object.assign(process.env, {
      DATABASE_URL: dbUrl(name), JWT_SECRET, PUBLIC_URL: 'https://habits.smoke.test', PG_POOL_MAX: '2',
    });
    // SMOKE_LAMBDA_DIR=<dir> runs the unpacked deploy zips (<dir>/<svc>/src/lambda.js)
    const file = process.env.SMOKE_LAMBDA_DIR
      ? path.resolve(process.env.SMOKE_LAMBDA_DIR, name, 'src', 'lambda.js')
      : path.join(root, 'services', `${name}-service`, 'src', 'lambda.js');
    handlers[name] = (await import(pathToFileURL(file).href)).handler;
  }
}

/** One request to a service, as an HTTP call or as an API Gateway v2 Lambda event. */
async function request(svc, method, url, headers = {}, body) {
  if (REMOTE) {
    const res = await fetch(`${REMOTE}/api${url}`, { method, headers, body });
    return { status: res.status, text: await res.text() };
  }
  if (!LAMBDA) {
    const res = await fetch(`http://localhost:${SERVICES[svc]}${url}`, { method, headers, body });
    return { status: res.status, text: await res.text() };
  }
  const [rawPath, rawQueryString = ''] = url.split('?');
  const out = await handlers[serviceDir(svc)]({
    version: '2.0',
    rawPath: `/api${rawPath}`,
    rawQueryString,
    headers: Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])),
    requestContext: { http: { method, path: `/api${rawPath}`, sourceIp: '203.0.113.7' } },
    body,
    isBase64Encoded: false,
  });
  return { status: out.statusCode, text: Buffer.from(out.body ?? '', out.isBase64Encoded ? 'base64' : 'utf8').toString() };
}

/** Lambda mode: EventBridge Scheduler stand-in, delivering each tick twice at once
 * (the scheduler is at-least-once, so the handler must not double-send). */
function startScheduler() {
  let running = true;
  (async () => {
    while (running) {
      const ev = { source: 'aws.scheduler', 'detail-type': 'Scheduled Event' };
      const results = await Promise.allSettled([handlers.reminder(ev), handlers.reminder(ev)]);
      for (const r of results) {
        if (r.status === 'rejected') { schedulerErrors++; console.error('scheduled tick failed:', r.reason); }
      }
      await sleep(300);
    }
  })();
  return () => { running = false; };
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
  const res = await request(svc, method, url, {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
  }, body !== undefined ? JSON.stringify(body) : undefined);
  const { text } = res;
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  const ok = expect.includes(res.status);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${res.status} ${svc.padEnd(9)} ${method} ${url}`);
  if (!ok) failures.push(`${svc} ${method} ${url} -> ${res.status} ${text.slice(0, 200)}`);
  return json ?? {};
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(pred, ms = 6000) {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(100)) if (pred()) return true;
  return pred();
}
function check(ok, label) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
  if (!ok) failures.push(label);
}
/** UTC 'HH:MM' shifted by `min` minutes (the test user's timezone is UTC). */
const hhmm = (min = 0) => new Date(Date.now() + min * 60_000).toISOString().slice(11, 16);
const today = new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

async function main() {
  // Catches reminder pushes so the ntfy path is exercised without the internet.
  const pushes = [];
  const ntfy = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      pushes.push({ title: req.headers.title, actions: req.headers.actions ?? '', body });
      res.end('ok');
    });
  });
  const pushesFor = (habit, title = 'OpenHabit') => pushes.filter((p) => p.body.includes(habit) && p.title === title);
  await new Promise((r) => ntfy.listen(0, r));
  const ntfyUrl = `http://localhost:${ntfy.address().port}/openhabit-smoke`;

  let stopScheduler = () => {};
  if (REMOTE) {
    // nothing to start
  } else if (LAMBDA) {
    await loadHandlers();
    stopScheduler = startScheduler();
  } else {
    for (const name of Object.keys(SERVICES)) start(name);
    await Promise.all(Object.keys(SERVICES).map(waitHealthy));
  }
  console.log(`mode: ${REMOTE ? `live deployment ${REMOTE}` : LAMBDA ? 'AWS Lambda handlers' : 'HTTP services'}`);

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

  if (REMOTE) await remoteChecks(A, T);
  else {
    // ---- reminders (two replicas tick every 300 ms) --------------------------
    // A habit due now and not logged gets exactly one push, even with two
    // replicas racing for it; reminders_sent makes the claim atomic.
    const due = await call('habit', 'POST', '/habits', { token: A, body: { name: 'Stretch', reminderTime: hhmm() } });
    check(await waitFor(() => pushesFor('Stretch').length > 0), 'reminder: due habit pushed');
    await sleep(1500);
    check(pushesFor('Stretch').length === 1,
      `reminder: exactly one push across ${LAMBDA ? 'duplicate scheduler deliveries' : '2 replicas'} (got ${pushesFor('Stretch').length})`);

    // Buttons: signed links (Done, Snooze 30 min) plus Open; the ntfy app POSTs them.
    const push = pushesFor('Stretch')[0] ?? { actions: '' };
    const linkFor = (p, kind) => (p.actions.match(new RegExp(`https://habits\\.smoke\\.test/api/${kind}/([^,\\s]+)`)) || [])[1];
    const snooze30 = linkFor(push, 'reminders/snooze');
    const done = linkFor(push, 'entries/done');
    check(Boolean(snooze30 && done) && /view, Open, https:\/\/habits\.smoke\.test\//.test(push.actions),
      `reminder: notification has Done, Snooze and Open buttons (${push.actions.split('; ').map((a) => a.split(', ')[1]).join(', ')})`);
    await call('reminder', 'POST', `/reminders/snooze/${snooze30}x`, { expect: [403] });
    await call('reminder', 'POST', `/reminders/snooze/${done}`, { expect: [403] }); // links are bound to their action
    await call('tracking', 'POST', `/entries/done/${snooze30}`, { expect: [403] });
    await call('reminder', 'POST', `/reminders/snooze/${snooze30}`);
    // fast-forward the 30 minutes, then exactly one "snoozed" re-send must follow
    execFileSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-c',
      `UPDATE reminders_sent SET snoozed_until = now() - interval '1 second' WHERE habit_id = '${due.id}'`]);
    check(await waitFor(() => pushesFor('Stretch', 'OpenHabit (snoozed)').length > 0), 'reminder: snoozed reminder re-sent');
    await sleep(1000);
    check(pushesFor('Stretch', 'OpenHabit (snoozed)').length === 1, 'reminder: snoozed reminder re-sent exactly once');

    // Done from the notification marks today complete, no login needed.
    const doneAgain = linkFor(pushesFor('Stretch', 'OpenHabit (snoozed)')[0] ?? { actions: '' }, 'entries/done');
    await call('tracking', 'POST', `/entries/done/${doneAgain}`);
    const entries = await call('tracking', 'GET', `/entries?from=${today}&to=${today}`, { token: A });
    check((Array.isArray(entries) ? entries : []).some((e) => e.habitId === due.id && e.value === 1),
      'reminder: Done button marked the habit complete for today');

    // Quiet hours hold reminders back; one still in its catch-up window goes out
    // once they are cleared.
    await call('auth', 'PUT', '/auth/me', { token: A, body: { quietStart: hhmm(-1), quietEnd: hhmm(60) } });
    await call('auth', 'PUT', '/auth/me', { token: A, body: { quietStart: '22:00', quietEnd: '' }, expect: [400] });
    await call('habit', 'POST', '/habits', { token: A, body: { name: 'Hush', reminderTime: hhmm() } });
    await sleep(1500);
    check(pushesFor('Hush').length === 0, 'reminder: nothing sent during quiet hours');
    await call('auth', 'PUT', '/auth/me', { token: A, body: { quietStart: '', quietEnd: '' } });
    check(await waitFor(() => pushesFor('Hush').length === 1), 'reminder: sent after quiet hours were cleared');

    const metrics = (await request('reminder', 'GET', '/metrics')).text;
    const metric = (n) => Number((metrics.match(new RegExp(`^${n}(?:\\{[^}]*\\})? (\\S+)`, 'm')) || [])[1] ?? NaN);
    const ticks = metric('openhabit_reminder_ticks_total');
    const tickErrors = metric('openhabit_reminder_tick_errors_total');
    if (LAMBDA) check(schedulerErrors === 0, `reminder: scheduled invocations without errors (errors=${schedulerErrors})`);
    else check(ticks > 0 && tickErrors === 0, `reminder: ticks=${ticks} errors=${tickErrors}`);
    check(metric('openhabit_reminder_snoozes_total') === 1, 'reminder: snooze counted in metrics');
  }

  // ---- teardown flows: token revoke, group & account deletion ---------------
  await call('auth', 'DELETE', `/auth/tokens/${tok.id}`, { token: A });
  await call('habit', 'GET', '/habits', { token: T, expect: [401] });
  await call('social', 'DELETE', `/groups/${g.id}`, { token: A });
  await call('habit', 'DELETE', `/habits/${h2.id}`, { token: A });
  for (const t of [A, B, C]) {
    await call('auth', 'DELETE', '/auth/me', { token: t, body: { password: 'smoke-password-1' } });
  }

  stopScheduler();
  ntfy.close();
}

/** Live deployment: reminder Lambda, snooze route, quiet-hours API, frontend, no /metrics. */
async function remoteChecks(A) {
  const fn = process.env.SMOKE_REMINDER_FUNCTION;
  if (fn) {
    // two concurrent runs, like an at-least-once double delivery from EventBridge
    // fileb:// works with both AWS CLI v1 and v2 (v2 would need --cli-binary-format for inline JSON)
    const payload = path.join(require('os').tmpdir(), 'openhabit-smoke-payload.json');
    require('fs').writeFileSync(payload, '{"source":"openhabit.smoke"}');
    const invoke = () => new Promise((resolve) => {
      const p = spawn('aws', ['lambda', 'invoke', '--function-name', fn, '--payload', `fileb://${payload}`,
        '--query', 'FunctionError', '--output', 'text', '/dev/null']);
      let out = '';
      p.stdout.on('data', (d) => { out += d; });
      p.stderr.on('data', (d) => { out += d; });
      p.on('close', (code) => resolve({ code, out: out.trim() }));
    });
    const runs = await Promise.all([invoke(), invoke()]);
    check(runs.every((r) => r.code === 0 && r.out === 'None'),
      `reminder Lambda: 2 concurrent scheduled runs without errors (${runs.map((r) => r.out || r.code).join(', ')})`);
  } else {
    console.log('skip reminder Lambda invocation (set SMOKE_REMINDER_FUNCTION)');
  }
  await call('reminder', 'POST', '/reminders/snooze/not-a-valid-token', { expect: [403] });
  await call('tracking', 'POST', '/entries/done/not-a-valid-token', { expect: [403] });
  await call('auth', 'PUT', '/auth/me', { token: A, body: { quietStart: '22:00', quietEnd: '07:00' } });
  await call('auth', 'PUT', '/auth/me', { token: A, body: { quietStart: '22:00', quietEnd: '' }, expect: [400] });

  const page = await fetch(`${REMOTE}/`);
  const html = await page.text();
  check(page.status === 200 && /<div id="root"/.test(html), `frontend: / serves the app (${page.status})`);
  check(/default-src 'self'/.test(page.headers.get('content-security-policy') ?? ''), 'frontend: CSP header present');
  const spa = await fetch(`${REMOTE}/some/client/route`);
  check(spa.status === 200 && (await spa.text()) === html, 'frontend: unknown paths fall back to index.html');
  const asset = (html.match(/\/assets\/[^"]+\.js/) || [])[0];
  const js = asset ? await fetch(`${REMOTE}${asset}`) : null;
  check(js?.status === 200 && /immutable/.test(js.headers.get('cache-control') ?? ''), `frontend: ${asset} served with immutable caching`);
  const metrics = await (await fetch(`${REMOTE}/api/metrics`)).text();
  check(!metrics.includes('openhabit_http_requests_total'), 'metrics are not publicly exposed');
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
