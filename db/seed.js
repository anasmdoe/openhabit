#!/usr/bin/env node
// Seed demo habits + 4 months of entries through the public API.
// Usage: node db/seed.js [base-url] [email] [password]
//   default: http://localhost:8080/api demo@home.lab demo-password-123
// Registers the account if it doesn't exist, then seeds it.
const BASE = process.argv[2] || 'http://localhost:8080/api';
const EMAIL = process.argv[3] || 'demo@home.lab';
const PASSWORD = process.argv[4] || 'demo-password-123';
let TOKEN = null;

const HABITS = [
  { name: 'Wake up at 05:00', category: 'Morning', reminderTime: '05:00', cue: '', icon: 'sunrise', question: 'Did you wake up at 05:00?', type: 'boolean', color: '#7FD1AE', activeDays: [1, 2, 3, 4, 5], rate: 0.9 },
  { name: 'Gym', category: 'Fitness', reminderTime: '17:30', cue: '', icon: 'gym', scheduleType: 'per_week', frequency: 4, question: 'Did you train today?', type: 'boolean', color: '#5BB5E0', activeDays: [0, 1, 2, 3, 4, 6], rate: 0.75 },
  { name: 'Running', category: 'Fitness', reminderTime: '07:00', cue: '', icon: 'run', question: 'How many Km did you run?', type: 'numeric', unit: 'Km', target: 3, color: '#E8A44C', activeDays: [1, 3, 5, 6], rate: 0.7 },
  { name: 'Reading', category: 'Mind', reminderTime: '21:00', cue: 'After dinner, on the sofa', icon: 'book', question: 'How many pages did you read?', type: 'numeric', unit: 'pages', target: 10, color: '#C792EA', activeDays: [0, 1, 2, 3, 4, 5, 6], rate: 0.85 },
  { name: 'Day planning', category: 'Morning', reminderTime: '08:30', cue: '', icon: 'pen', question: 'Did you plan your day?', type: 'boolean', color: '#E0685B', activeDays: [1, 2, 3, 4, 5], rate: 0.8 },
  { name: 'No sugar', category: 'Health', reminderTime: '', cue: '', icon: 'food', question: 'Did you avoid sugar?', type: 'boolean', color: '#63C7B2', activeDays: [0, 1, 2, 3, 4, 5, 6], rate: 0.6 },
  { name: 'Meditation', category: 'Mind', reminderTime: '06:30', cue: 'Right after waking up, before the phone', icon: 'meditate', question: 'How many minutes did you meditate?', type: 'numeric', unit: 'min', target: 10, color: '#8FB4E3', activeDays: [0, 1, 2, 3, 4, 5, 6], rate: 0.72 },
  { name: 'Social media detox', kind: 'quit', savingsPerDay: 15, savingsUnit: 'min', category: 'Health', reminderTime: '', cue: 'When the urge hits: take a walk instead', icon: 'nophone', question: 'Did you stay off social media?', type: 'boolean', color: '#D9A0C3', activeDays: [0, 1, 2, 3, 4, 5, 6], rate: 0.55 },
];

let s = 42;
const rand = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const iso = (d) => d.toISOString().slice(0, 10);

async function req(path, method = 'GET', body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

async function authenticate() {
  try {
    const r = await req('/auth/register', 'POST', { email: EMAIL, password: PASSWORD, name: 'Demo' });
    TOKEN = r.token;
    console.log(`  registered ${EMAIL}`);
  } catch {
    const r = await req('/auth/login', 'POST', { email: EMAIL, password: PASSWORD });
    TOKEN = r.token;
    console.log(`  signed in as ${EMAIL}`);
  }
}

const DAYS = 120;

async function main() {
  console.log(`Seeding ${BASE} …`);
  await authenticate();
  const today = new Date();

  // Re-running on an account that already has the habits only brings their category, reminder time and
  // cue up to date (a quit habit created the old way is recreated, since its entries mean something else).
  const existing = await req('/habits');
  for (const def of HABITS) {
    const have = existing.find((h) => h.name === def.name);
    if (have && !(def.kind === 'quit' && have.kind !== 'quit')) {
      await req(`/habits/${have.id}`, 'PUT', { category: def.category, reminderTime: def.reminderTime, cue: def.cue });
      console.log(`  ${def.name}: already there, metadata updated`);
      continue;
    }
    if (have) await req(`/habits/${have.id}`, 'DELETE');
    const habit = await req('/habits', 'POST', {
      name: def.name, question: def.question, type: def.type,
      unit: def.unit || '', target: def.target || 1, color: def.color,
      icon: def.icon || '', scheduleType: def.scheduleType || 'weekdays',
      frequency: def.frequency || 3, activeDays: def.activeDays,
      category: def.category, reminderTime: def.reminderTime, cue: def.cue, kind: def.kind || 'build',
      ...(def.savingsPerDay ? { savingsPerDay: def.savingsPerDay, savingsUnit: def.savingsUnit } : {}),
    });
    const entries = [];
    for (let i = DAYS; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const date = iso(d);
      if (!def.activeDays.includes(d.getUTCDay())) continue;
      // a quit habit records slips: occasional, never today
      if (def.kind === 'quit' ? (i === 0 || rand() > 0.08) : rand() > def.rate) continue;
      let value = 1;
      if (def.type === 'numeric') value = Math.round(def.target * (0.6 + rand() * 1.2) * 2) / 2;
      entries.push({ habitId: habit.id, date, value });
    }
    await req('/entries/bulk', 'POST', { entries });
    console.log(`  ${def.name}: ${entries.length} entries`);
  }

  for (let i = DAYS; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    await req('/wellness', 'PUT', {
      date: iso(d),
      mood: Math.min(5, Math.max(1, Math.round(3 + (rand() - 0.45) * 3))),
      sleepHours: Math.round((6 + rand() * 2.5) * 2) / 2,
    });
  }
  console.log('  wellness: mood + sleep for every day');
  console.log(`Done. Sign in as ${EMAIL} / ${PASSWORD} and enjoy.`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
