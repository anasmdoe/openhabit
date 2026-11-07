// The OpenHabit MCP server: tools an AI assistant can call to read and log your habits.
// Everything goes through the public REST API with your personal API token, so the assistant can do
// exactly what that token can do (read everything, log entries, create habits; never touch the account).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');

/** The user's calendar day (the machine's timezone, or OPENHABIT_TZ). */
export function localDate(offsetDays = 0, tz = process.env.OPENHABIT_TZ) {
  const d = new Date(Date.now() + offsetDays * 864e5);
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz || undefined, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** Finds a habit by id, exact name, or a unique case-insensitive part of its name. */
export function findHabit(habits, query) {
  const q = String(query).trim().toLowerCase();
  const byId = habits.find((h) => h.id === query);
  if (byId) return byId;
  const exact = habits.filter((h) => h.name.toLowerCase() === q);
  if (exact.length === 1) return exact[0];
  const part = habits.filter((h) => h.name.toLowerCase().includes(q));
  if (part.length === 1) return part[0];
  const names = (part.length ? part : habits).map((h) => `"${h.name}"`).join(', ');
  throw new Error(part.length ? `"${query}" matches several habits: ${names}. Say which one.` : `No habit called "${query}". Your habits: ${names}.`);
}

const text = (t, structured) => ({ content: [{ type: 'text', text: t }], ...(structured ? { structuredContent: structured } : {}) });
const fail = (e) => ({ content: [{ type: 'text', text: e.message }], isError: true });
const tool = (fn) => async (args) => { try { return await fn(args ?? {}); } catch (e) { return fail(e); } };

const fmt = (v, unit) => `${Number.isInteger(v) ? v : Math.round(v * 100) / 100}${unit ? ` ${unit}` : ''}`;

export function createServer(api) {
  const server = new McpServer({ name: 'openhabit', version: '0.1.0' }, {
    instructions: 'OpenHabit is the user\'s self-hosted habit tracker. Use `today` to see what is due, `log_habit` to record ' +
      'something they did ("I ran 5 km", "drank a glass of water"), and the stats tools to answer questions about progress. ' +
      'Dates are the user\'s local calendar days (YYYY-MM-DD). Confirm before creating habits.',
  });
  const habits = async (all = false) => (await api.get('/habits')).filter((h) => all || !h.archived);

  server.registerTool('today', {
    title: 'Today',
    description: 'The habits due today (or on a given date), each with whether it is done, its value and current streak.',
    inputSchema: { date: DATE.optional().describe('Default: today') },
    annotations: { readOnlyHint: true },
  }, tool(async ({ date }) => {
    const d = date ?? localDate();
    const t = await api.get(`/analytics/today?today=${d}`);
    const lines = t.habits.map((h) => {
      const state = h.completed ? 'done' : h.skipped ? 'skipped' : 'open';
      const value = h.type === 'numeric' ? ` (${fmt(h.value ?? 0, h.unit)} of ${fmt(h.target, h.unit)})` : '';
      return `- ${h.name}: ${state}${value}${h.streak >= 2 ? `, ${h.streak}-day streak` : ''}`;
    });
    return text(`${t.date}: ${t.done} of ${t.total} done.\n${lines.join('\n') || 'Nothing is due.'}`, t);
  }));

  server.registerTool('list_habits', {
    title: 'List habits',
    description: 'All habits with their type, target, unit, schedule and category.',
    inputSchema: { includeArchived: z.boolean().optional() },
    annotations: { readOnlyHint: true },
  }, tool(async ({ includeArchived }) => {
    const list = await habits(includeArchived);
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const lines = list.map((h) => {
      const sched = h.scheduleType === 'per_week' ? `${h.frequency}× a week` : h.activeDays.length === 7 ? 'every day' : h.activeDays.map((d) => days[d]).join(' ');
      const what = h.kind === 'quit' ? 'quit habit (entries are slips)' : h.type === 'numeric' ? `${h.targetType === 'at_most' ? 'at most' : 'at least'} ${fmt(h.target, h.unit)}` : 'yes/no';
      return `- ${h.name} [${what}; ${sched}${h.category ? `; ${h.category}` : ''}${h.archived ? '; archived' : ''}]`;
    });
    return text(lines.join('\n') || 'No habits yet.', { habits: list });
  }));

  server.registerTool('log_habit', {
    title: 'Log a habit',
    description: 'Record a habit for a day. Yes/no habits are marked done. Measurable habits take `value` (the day\'s total), ' +
      'or `add` to add to what is already logged (for example one more glass of water). For a quit habit this records a slip.',
    inputSchema: {
      habit: z.string().describe('Habit name (or part of it) or id'),
      value: z.number().optional().describe('Total for the day (measurable habits)'),
      add: z.number().optional().describe('Amount to add to the day (measurable habits)'),
      date: DATE.optional().describe('Default: today'),
      note: z.string().max(500).optional().describe('Optional note for that day'),
    },
    annotations: { destructiveHint: false, idempotentHint: false },
  }, tool(async ({ habit, value, add, date, note }) => {
    const h = findHabit(await habits(), habit);
    const d = date ?? localDate();
    const [existing] = await api.get(`/entries?from=${d}&to=${d}&habitId=${h.id}`).then((r) => r.filter((e) => e.habitId === h.id));
    let v;
    if (h.type === 'numeric') {
      if (value == null && add == null) throw new Error(`${h.name} is measured in ${h.unit || 'units'}: say how much (value) or how much to add (add).`);
      const before = existing && existing.value > 0 ? existing.value : 0;
      v = value ?? before + add;
    } else {
      v = 1;
    }
    const notes = note ?? existing?.notes ?? '';
    await api.put('/entries', { habitId: h.id, date: d, value: v, notes });
    const done = h.kind === 'quit' ? 'slip recorded' : h.type === 'numeric' ? `${fmt(v, h.unit)} of ${fmt(h.target, h.unit)}` : 'done';
    return text(`${h.name} on ${d}: ${done}.`, { habitId: h.id, date: d, value: v });
  }));

  server.registerTool('skip_habit', {
    title: 'Skip a day',
    description: 'Excuse a habit for a day (sick, travelling): the streak survives and the day does not count.',
    inputSchema: { habit: z.string(), date: DATE.optional() },
    annotations: { destructiveHint: false, idempotentHint: true },
  }, tool(async ({ habit, date }) => {
    const h = findHabit(await habits(), habit);
    const d = date ?? localDate();
    await api.put('/entries', { habitId: h.id, date: d, value: -1 });
    return text(`${h.name} skipped on ${d}.`);
  }));

  server.registerTool('clear_habit', {
    title: 'Clear a day',
    description: 'Remove what was logged for a habit on a day (undo).',
    inputSchema: { habit: z.string(), date: DATE.optional() },
    annotations: { destructiveHint: true, idempotentHint: true },
  }, tool(async ({ habit, date }) => {
    const h = findHabit(await habits(), habit);
    const d = date ?? localDate();
    await api.del(`/entries/${h.id}/${d}`);
    return text(`${h.name}: ${d} cleared.`);
  }));

  server.registerTool('habit_stats', {
    title: 'Habit stats',
    description: 'Streaks, completion rates and totals for one habit.',
    inputSchema: { habit: z.string() },
    annotations: { readOnlyHint: true },
  }, tool(async ({ habit }) => {
    const h = findHabit(await habits(true), habit);
    const s = await api.get(`/analytics/habits/${h.id}`);
    const unit = s.streakUnit === 'weeks' ? 'week' : 'day';
    const total = s.history.reduce((n, m) => n + m.completions, 0);
    const recent = s.history.slice(-3).map((m) => `${m.month}: ${m.completions}${h.type === 'numeric' ? ` (${fmt(m.sum, h.unit)})` : ''}`);
    const days = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
    const best = [...s.weekdayFrequency].sort((a, b) => b.pct - a.pct)[0];
    const parts = [
      `${h.name}: current streak ${s.currentStreak} ${unit}s, best ${s.bestStreaks[0]?.length ?? 0}`,
      `${total} ${h.kind === 'quit' ? 'slips' : 'times'} in all`,
      recent.length ? `last months ${recent.join(', ')}` : null,
      best && best.pct > 0 ? `strongest on ${days[best.dow]} (${best.pct}%)` : null,
      s.freezesLeft ? `${s.freezesLeft} streak freeze(s) left this month` : null,
    ].filter(Boolean);
    const { entries, scoreSeries, ...summary } = s;
    return text(parts.join('; ') + '.', summary);
  }));

  server.registerTool('weekly_review', {
    title: 'Weekly review',
    description: 'Last week in a few lines: completion, change on the week before, best habit, the one with most room.',
    inputSchema: { week: DATE.optional().describe('Any date in the week to review') },
    annotations: { readOnlyHint: true },
  }, tool(async ({ week }) => {
    const r = await api.get(`/analytics/weekly-review?today=${localDate()}${week ? `&week=${week}` : ''}`);
    return text(r.message?.text ?? 'No review available.', r);
  }));

  server.registerTool('goals', {
    title: 'Goals',
    description: 'Goals with deadlines: progress, pace and whether they are on track.',
    annotations: { readOnlyHint: true },
  }, tool(async () => {
    const g = await api.get(`/analytics/goals?today=${localDate()}`);
    return text(g.map((x) => `- ${x.title} (${x.habit.name}, by ${x.deadline}): ${x.pct}%, ${x.status.replace('_', ' ')}. ${x.message}`).join('\n') || 'No goals yet.', { goals: g });
  }));

  server.registerTool('patterns', {
    title: 'Patterns',
    description: 'What the user\'s own data says: habits that go with longer sleep, and habits that go together. Only clear patterns with enough days are reported.',
    annotations: { readOnlyHint: true },
  }, tool(async () => {
    const p = await api.get(`/analytics/correlations?today=${localDate()}`);
    return text(p.found.length ? p.found.map((x) => `- ${x.text}`).join('\n')
      : `No clear patterns yet (${p.needed.trackedDays} tracked days, ${p.needed.sleepDays} with sleep).`, p);
  }));

  server.registerTool('log_wellness', {
    title: 'Log mood or sleep',
    description: 'Record mood (1 to 5) and/or hours of sleep for a day.',
    inputSchema: { mood: z.number().int().min(1).max(5).optional(), sleepHours: z.number().min(0).max(24).optional(), date: DATE.optional() },
    annotations: { destructiveHint: false, idempotentHint: true },
  }, tool(async ({ mood, sleepHours, date }) => {
    if (mood == null && sleepHours == null) throw new Error('Give a mood (1-5), hours of sleep, or both.');
    const d = date ?? localDate();
    await api.put('/wellness', { date: d, ...(mood != null ? { mood } : {}), ...(sleepHours != null ? { sleepHours } : {}) });
    return text(`Logged for ${d}:${mood != null ? ` mood ${mood}/5` : ''}${sleepHours != null ? ` sleep ${sleepHours} h` : ''}.`);
  }));

  server.registerTool('create_habit', {
    title: 'Create a habit',
    description: 'Create a new habit. Ask the user to confirm the details first.',
    inputSchema: {
      name: z.string().min(1).max(80),
      type: z.enum(['boolean', 'numeric']).optional().describe('boolean = yes/no (default), numeric = measured'),
      unit: z.string().max(20).optional(),
      target: z.number().positive().optional(),
      days: z.array(z.number().int().min(0).max(6)).optional().describe('Weekdays it is due, 0 = Sunday. Default: every day'),
      timesPerWeek: z.number().int().min(1).max(7).optional().describe('Instead of fixed days: N times a week, any days'),
      reminderTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().describe('HH:MM'),
      category: z.string().max(40).optional(),
      kind: z.enum(['build', 'quit']).optional().describe('quit = a habit to break'),
    },
    annotations: { destructiveHint: false, idempotentHint: false },
  }, tool(async (a) => {
    const body = {
      name: a.name, type: a.type ?? 'boolean', unit: a.unit, target: a.target, category: a.category, kind: a.kind,
      reminderTime: a.reminderTime,
      ...(a.timesPerWeek ? { scheduleType: 'per_week', frequency: a.timesPerWeek } : { activeDays: a.days ?? [0, 1, 2, 3, 4, 5, 6] }),
    };
    for (const k of Object.keys(body)) if (body[k] === undefined) delete body[k];
    const h = await api.post('/habits', body);
    return text(`Created "${h.name}".`, { habit: h });
  }));

  return server;
}
