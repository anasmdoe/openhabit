import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer, findHabit } from '../src/server.js';
import { createApi } from '../src/api.js';

// A tiny in-memory OpenHabit API behind a fake fetch, so the tools run end to end.
function fakeOpenHabit() {
  const habits = [
    { id: 'h1', name: 'Reading', type: 'numeric', unit: 'pages', target: 10, targetType: 'at_least', kind: 'build', scheduleType: 'weekdays', activeDays: [0, 1, 2, 3, 4, 5, 6], frequency: 3, category: 'Mind', archived: false },
    { id: 'h2', name: 'Gym', type: 'boolean', unit: '', target: 1, targetType: 'at_least', kind: 'build', scheduleType: 'per_week', activeDays: [0, 1, 2, 3, 4, 5, 6], frequency: 4, category: '', archived: false },
    { id: 'h3', name: 'Gym stretching', type: 'boolean', unit: '', target: 1, targetType: 'at_least', kind: 'build', scheduleType: 'weekdays', activeDays: [1, 3], frequency: 3, category: '', archived: false },
  ];
  const entries = new Map(); // `${habitId}|${date}` -> { value, notes }
  const calls = [];
  const fetchImpl = async (url, init) => {
    const u = new URL(url);
    const path = u.pathname.replace(/^\/api\/v1/, '');
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method: init.method, path, body, auth: init.headers.Authorization });
    const json = (status, data) => ({ ok: status < 400, status, text: async () => JSON.stringify(data) });
    if (init.method === 'GET' && path === '/habits') return json(200, habits);
    if (init.method === 'GET' && path === '/entries') {
      const from = u.searchParams.get('from');
      return json(200, [...entries].filter(([k]) => k.endsWith(`|${from}`)).map(([k, e]) => ({ habitId: k.split('|')[0], date: from, ...e })));
    }
    if (init.method === 'PUT' && path === '/entries') { entries.set(`${body.habitId}|${body.date}`, { value: body.value, notes: body.notes ?? '' }); return json(200, body); }
    if (init.method === 'DELETE' && path.startsWith('/entries/')) { const [, , id, d] = path.split('/'); entries.delete(`${id}|${d}`); return { ok: true, status: 204, text: async () => '' }; }
    if (init.method === 'GET' && path === '/analytics/today') {
      const d = u.searchParams.get('today');
      const list = habits.map((h) => { const e = entries.get(`${h.id}|${d}`); return { ...h, value: e?.value ?? null, completed: !!e && e.value >= h.target, skipped: e?.value === -1, streak: 3 }; });
      return json(200, { date: d, total: list.length, done: list.filter((h) => h.completed).length, habits: list });
    }
    if (init.method === 'POST' && path === '/habits') { const h = { id: 'h9', archived: false, ...body }; habits.push(h); return json(201, h); }
    if (init.method === 'PUT' && path === '/wellness') return json(200, body);
    return json(404, { error: `no route ${init.method} ${path}` });
  };
  return { fetchImpl, entries, calls };
}

async function connect(fake) {
  const server = createServer(createApi({ baseUrl: 'https://habits.example.com/', token: 'oh_test', fetchImpl: fake.fetchImpl }));
  const client = new Client({ name: 'test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}

const textOf = (r) => r.content.map((c) => c.text).join('\n');

test('lists the tools with read-only hints on the read tools', async () => {
  const client = await connect(fakeOpenHabit());
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  assert.deepEqual(names, ['clear_habit', 'create_habit', 'goals', 'habit_stats', 'list_habits', 'log_habit', 'log_wellness', 'patterns', 'skip_habit', 'today', 'weekly_review']);
  assert.equal(tools.find((t) => t.name === 'today').annotations.readOnlyHint, true);
  assert.equal(tools.find((t) => t.name === 'clear_habit').annotations.destructiveHint, true);
});

test('log_habit marks a yes/no habit done and adds to a measurable one, keeping the note', async () => {
  const fake = fakeOpenHabit();
  const client = await connect(fake);
  let r = await client.callTool({ name: 'log_habit', arguments: { habit: 'gym', date: '2026-11-07' } });
  assert.match(textOf(r), /Gym on 2026-11-07: done/);
  assert.equal(fake.entries.get('h2|2026-11-07').value, 1);

  await client.callTool({ name: 'log_habit', arguments: { habit: 'reading', value: 6, date: '2026-11-07', note: 'chapter 3' } });
  r = await client.callTool({ name: 'log_habit', arguments: { habit: 'Reading', add: 5, date: '2026-11-07' } });
  assert.match(textOf(r), /11 pages of 10 pages/);
  assert.deepEqual(fake.entries.get('h1|2026-11-07'), { value: 11, notes: 'chapter 3' });
  assert.ok(fake.calls.every((c) => c.auth === 'Bearer oh_test'));
});

test('a measurable habit without an amount, an unknown or an ambiguous name are explained, not guessed', async () => {
  const client = await connect(fakeOpenHabit());
  let r = await client.callTool({ name: 'log_habit', arguments: { habit: 'Reading' } });
  assert.equal(r.isError, true);
  assert.match(textOf(r), /say how much/);
  r = await client.callTool({ name: 'log_habit', arguments: { habit: 'Swimming' } });
  assert.match(textOf(r), /No habit called "Swimming"/);
  r = await client.callTool({ name: 'skip_habit', arguments: { habit: 'gy' } });
  assert.match(textOf(r), /matches several habits/);
});

test('today summarises the day', async () => {
  const fake = fakeOpenHabit();
  const client = await connect(fake);
  await client.callTool({ name: 'log_habit', arguments: { habit: 'Gym', date: '2026-11-07' } });
  const r = await client.callTool({ name: 'today', arguments: { date: '2026-11-07' } });
  assert.match(textOf(r), /2026-11-07: 1 of 3 done/);
  assert.match(textOf(r), /- Gym: done, 3-day streak/);
  assert.match(textOf(r), /- Reading: open \(0 pages of 10 pages\)/);
});

test('skip, clear, wellness and create go to the right endpoints', async () => {
  const fake = fakeOpenHabit();
  const client = await connect(fake);
  await client.callTool({ name: 'skip_habit', arguments: { habit: 'Gym stretching', date: '2026-11-07' } });
  assert.equal(fake.entries.get('h3|2026-11-07').value, -1);
  await client.callTool({ name: 'clear_habit', arguments: { habit: 'Gym stretching', date: '2026-11-07' } });
  assert.equal(fake.entries.has('h3|2026-11-07'), false);
  let r = await client.callTool({ name: 'log_wellness', arguments: {} });
  assert.equal(r.isError, true);
  await client.callTool({ name: 'log_wellness', arguments: { mood: 4, sleepHours: 7.5, date: '2026-11-07' } });
  assert.deepEqual(fake.calls.at(-1).body, { date: '2026-11-07', mood: 4, sleepHours: 7.5 });
  r = await client.callTool({ name: 'create_habit', arguments: { name: 'Swim', timesPerWeek: 2 } });
  assert.match(textOf(r), /Created "Swim"/);
  assert.deepEqual(fake.calls.at(-1).body, { name: 'Swim', type: 'boolean', scheduleType: 'per_week', frequency: 2 });
});

test('findHabit prefers an exact name over a partial match', () => {
  const hs = [{ id: '1', name: 'Gym' }, { id: '2', name: 'Gym stretching' }];
  assert.equal(findHabit(hs, 'gym').id, '1');
  assert.equal(findHabit(hs, 'stretch').id, '2');
  assert.equal(findHabit(hs, '2').id, '2');
});

test('the client refuses to start without a server or token', () => {
  assert.throws(() => createApi({ baseUrl: '', token: 'x' }), /OPENHABIT_URL/);
  assert.throws(() => createApi({ baseUrl: 'https://x', token: '' }), /OPENHABIT_TOKEN/);
});
