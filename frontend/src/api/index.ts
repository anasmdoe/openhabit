// Data layer with two adapters:
//   api   — talks to the microservices through /api/* (gateway or ingress)
//   local — localStorage, used when no backend is reachable (demo / offline)
import type { Entry, Habit, HabitDetail, Insights, Overview, WellnessDay } from '../lib/types';
import { computeHabitDetail, computeInsights, computeOverview, todayISO, addDays } from '../lib/stats';

export type DataMode = 'api' | 'local';

export interface HabitInput {
  name: string;
  question?: string;
  type?: 'boolean' | 'numeric';
  unit?: string;
  target?: number;
  targetType?: 'at_least' | 'at_most';
  color?: string;
  icon?: string;
  scheduleType?: 'weekdays' | 'per_week';
  frequency?: number;
  webhookUrl?: string;
  reminderTime?: string;
  activeDays?: number[];
}

export interface DataAdapter {
  mode: DataMode;
  listHabits(): Promise<Habit[]>;
  listArchived(): Promise<Habit[]>;
  reorderHabits(ids: string[]): Promise<void>;
  createHabit(input: HabitInput): Promise<Habit>;
  updateHabit(id: string, patch: Partial<HabitInput> & { archived?: boolean; position?: number }): Promise<Habit>;
  deleteHabit(id: string): Promise<void>;
  getEntries(from: string, to: string): Promise<Entry[]>;
  putEntry(entry: Entry): Promise<Entry>;
  deleteEntry(habitId: string, date: string): Promise<void>;
  putWellness(day: { date: string; mood?: number | null; sleepHours?: number | null }): Promise<WellnessDay>;
  getWellness(from: string, to: string): Promise<WellnessDay[]>;
  getOverview(year: number, month: number): Promise<Overview>;
  getHabitDetail(id: string): Promise<HabitDetail>;
  getInsights(days?: number): Promise<Insights>;
  bulkPutEntries(entries: Entry[]): Promise<number>;
}

// ---------------------------------------------------------------- api mode
export const API = '/api';
const TOKEN_KEY = 'openhabit.token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string | null) =>
  t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY);

export class AuthError extends Error {}

export interface User {
  id: string;
  email: string;
  name: string;
  ntfyUrl: string;
  timezone: string;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 401) throw new AuthError('unauthorized');
  if (!res.ok) {
    let message = `request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch { /* non-json */ }
    throw new Error(message);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

// ---- auth endpoints (api mode only) ------------------------------------
export const authApi = {
  register: (email: string, password: string, name: string) =>
    req<{ token: string; user: User }>('/auth/register', {
      method: 'POST', body: JSON.stringify({ email, password, name }),
    }),
  login: (email: string, password: string) =>
    req<{ token: string; user: User }>('/auth/login', {
      method: 'POST', body: JSON.stringify({ email, password }),
    }),
  me: () => req<User>('/auth/me'),
  config: () => req<{ registration: boolean; oidc: { enabled: boolean; name?: string } }>('/auth/config'),
  changePassword: (currentPassword: string, newPassword: string) =>
    req<User>('/auth/me', { method: 'PUT', body: JSON.stringify({ currentPassword, newPassword }) }),
  updateName: (name: string) =>
    req<User>('/auth/me', { method: 'PUT', body: JSON.stringify({ name }) }),
  updateProfile: (patch: { name?: string; ntfyUrl?: string; timezone?: string }) =>
    req<User>('/auth/me', { method: 'PUT', body: JSON.stringify(patch) }),
  deleteAccount: (password: string) =>
    req<void>('/auth/me', { method: 'DELETE', body: JSON.stringify({ password }) }),
};

// ---- offline write queue: failed writes are stored and replayed ----------
const QUEUE_KEY = 'openhabit.queue';
type QueuedOp =
  | { kind: 'entry'; entry: Entry }
  | { kind: 'deleteEntry'; habitId: string; date: string }
  | { kind: 'wellness'; day: { date: string; mood?: number | null; sleepHours?: number | null } };

const loadQueue = (): QueuedOp[] => {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]'); } catch { return []; }
};
const saveQueue = (q: QueuedOp[]) => localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
const enqueue = (op: QueuedOp) => saveQueue([...loadQueue(), op]);

// fetch throws TypeError on network failure; HTTP errors are real responses
const isNetworkError = (e: unknown) => e instanceof TypeError;

export async function flushQueue(): Promise<number> {
  const q = loadQueue();
  if (!q.length) return 0;
  let done = 0;
  for (const op of [...q]) {
    try {
      if (op.kind === 'entry') await req('/entries', { method: 'PUT', body: JSON.stringify(op.entry) });
      else if (op.kind === 'deleteEntry') await req(`/entries/${op.habitId}/${op.date}`, { method: 'DELETE' });
      else await req('/wellness', { method: 'PUT', body: JSON.stringify(op.day) });
      q.shift();
      done += 1;
      saveQueue(q);
    } catch (e) {
      if (isNetworkError(e)) break; // still offline: keep the rest
      q.shift(); // rejected by the server: drop it rather than loop forever
      saveQueue(q);
    }
  }
  return done;
}

export const queuedWrites = () => loadQueue().length;

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { flushQueue().catch(() => {}); });
}

// ---- collaboration API (api mode only) ---------------------------------
export const socialApi = {
  listGroups: () => req<import('../lib/types').Group[]>('/groups'),
  createGroup: (name: string, icon: string) =>
    req<import('../lib/types').Group>('/groups', { method: 'POST', body: JSON.stringify({ name, icon }) }),
  updateGroup: (id: string, patch: { name?: string; icon?: string }) =>
    req<import('../lib/types').Group>(`/groups/${id}`, { method: 'PUT', body: JSON.stringify(patch) }),
  deleteGroup: (id: string) => req<void>(`/groups/${id}`, { method: 'DELETE' }),
  leaveGroup: (id: string) => req<void>(`/groups/${id}/leave`, { method: 'POST' }),
  members: (id: string) => req<import('../lib/types').GroupMember[]>(`/groups/${id}/members`),
  invite: (id: string, email: string) =>
    req(`/groups/${id}/invites`, { method: 'POST', body: JSON.stringify({ email }) }),
  myInvites: () => req<import('../lib/types').GroupInvite[]>('/invites'),
  respondInvite: (id: string, action: 'accept' | 'decline') =>
    req(`/invites/${id}/${action}`, { method: 'POST' }),
  joinByCode: (code: string) => req<{ groupId: string }>('/join', { method: 'POST', body: JSON.stringify({ code }) }),
  getShares: (groupId: string) => req<string[]>(`/groups/${groupId}/shares`),
  setShares: (groupId: string, habitIds: string[]) =>
    req(`/groups/${groupId}/shares`, { method: 'PUT', body: JSON.stringify({ habitIds }) }),
  dashboard: (groupId: string) => req<import('../lib/types').GroupDashboard>(`/analytics/groups/${groupId}`),
  react: (groupId: string, toUser: string, habitId: string, emoji = '🔥') =>
    req(`/groups/${groupId}/reactions`, { method: 'POST', body: JSON.stringify({ toUser, habitId, emoji }) }),
  myReactions: () => req<import('../lib/types').Reaction[]>('/reactions'),
  createGroupHabit: (groupId: string, h: { name: string; icon?: string; color?: string; question?: string }) =>
    req(`/groups/${groupId}/habits`, { method: 'POST', body: JSON.stringify(h) }),
  deleteGroupHabit: (groupId: string, habitId: string) =>
    req<void>(`/groups/${groupId}/habits/${habitId}`, { method: 'DELETE' }),
  setMyGroupEntry: (groupId: string, habitId: string, date: string, value: 1 | -1 | null) =>
    req(`/groups/${groupId}/habits/${habitId}/my-entry`, {
      method: 'PUT', body: JSON.stringify({ date, value }),
    }),
};

const apiAdapter: DataAdapter = {
  mode: 'api',
  listHabits: () => req('/habits'),
  listArchived: async () => (await req<Habit[]>('/habits?archived=true')).filter((h) => h.archived),
  reorderHabits: (ids) => req('/habits/reorder', { method: 'PUT', body: JSON.stringify({ ids }) }),
  createHabit: (input) => req('/habits', { method: 'POST', body: JSON.stringify(input) }),
  updateHabit: (id, patch) => req(`/habits/${id}`, { method: 'PUT', body: JSON.stringify(patch) }),
  deleteHabit: (id) => req(`/habits/${id}`, { method: 'DELETE' }),
  getEntries: (from, to) => req(`/entries?from=${from}&to=${to}`),
  async putEntry(entry) {
    try {
      return await req('/entries', { method: 'PUT', body: JSON.stringify(entry) });
    } catch (e) {
      if (isNetworkError(e)) { enqueue({ kind: 'entry', entry }); return entry; }
      throw e;
    }
  },
  async deleteEntry(habitId, date) {
    try {
      await req(`/entries/${habitId}/${date}`, { method: 'DELETE' });
    } catch (e) {
      if (isNetworkError(e)) { enqueue({ kind: 'deleteEntry', habitId, date }); return; }
      throw e;
    }
  },
  async putWellness(day) {
    try {
      return await req('/wellness', { method: 'PUT', body: JSON.stringify(day) });
    } catch (e) {
      if (isNetworkError(e)) {
        enqueue({ kind: 'wellness', day });
        return { date: day.date, mood: day.mood ?? null, sleepHours: day.sleepHours ?? null };
      }
      throw e;
    }
  },
  getWellness: (from, to) => req(`/wellness?from=${from}&to=${to}`),
  getOverview: (year, month) => req(`/analytics/overview?year=${year}&month=${month}`),
  getHabitDetail: (id) => req(`/analytics/habits/${id}`),
  getInsights: (days = 90) => req(`/analytics/insights?days=${days}`),
  bulkPutEntries: async (entries) => {
    const r = await req<{ imported: number }>('/entries/bulk', {
      method: 'POST', body: JSON.stringify({ entries }),
    });
    return r.imported ?? entries.length;
  },
};

// -------------------------------------------------------------- local mode
const LS_KEY = 'openhabit.v2';

interface LocalDB {
  habits: Habit[];
  entries: Entry[];
  wellness: WellnessDay[];
}

function loadDB(): LocalDB {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* corrupted -> reseed */
  }
  const db = seedDemo();
  saveDB(db);
  return db;
}

const saveDB = (db: LocalDB) => localStorage.setItem(LS_KEY, JSON.stringify(db));
const uuid = () =>
  crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function seedDemo(): LocalDB {
  const today = todayISO();
  const mk = (
    name: string, question: string, type: 'boolean' | 'numeric', unit: string,
    target: number, color: string, icon: string, activeDays: number[], position: number,
    scheduleType: 'weekdays' | 'per_week' = 'weekdays', frequency = 3
  ): Habit => ({
    id: uuid(), name, question, type, unit, target, targetType: 'at_least',
    color, icon, scheduleType, frequency, webhookUrl: '', reminderTime: '', activeDays, position, archived: false,
    createdAt: `${addDays(today, -120)}T00:00:00Z`,
  });

  const habits = [
    mk('Wake up at 05:00', 'Did you wake up at 05:00?', 'boolean', '', 1, '#7FD1AE', 'sunrise', [1, 2, 3, 4, 5], 0),
    mk('Gym', 'Did you train today?', 'boolean', '', 1, '#5BB5E0', 'gym', [0, 1, 2, 3, 4, 5, 6], 1, 'per_week', 4),
    mk('Running', 'How many Km did you run?', 'numeric', 'Km', 3, '#E8A44C', 'run', [1, 3, 5, 6], 2),
    mk('Reading', 'How many pages did you read?', 'numeric', 'pages', 10, '#C792EA', 'book', [0, 1, 2, 3, 4, 5, 6], 3),
    mk('Day planning', 'Did you plan your day?', 'boolean', '', 1, '#E0685B', 'pen', [1, 2, 3, 4, 5], 4),
    mk('No sugar', 'Did you avoid sugar?', 'boolean', '', 1, '#63C7B2', 'food', [0, 1, 2, 3, 4, 5, 6], 5),
    mk('Meditation', 'How many minutes did you meditate?', 'numeric', 'min', 10, '#8FB4E3', 'meditate', [0, 1, 2, 3, 4, 5, 6], 6),
    mk('Social media detox', 'Did you stay off social media?', 'boolean', '', 1, '#D9A0C3', 'nophone', [0, 1, 2, 3, 4, 5, 6], 7),
  ];

  // deterministic pseudo-random completion patterns
  let s = 42;
  const rand = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const entries: Entry[] = [];
  const wellness: WellnessDay[] = [];
  const rates = [0.9, 0.75, 0.7, 0.85, 0.8, 0.6, 0.72, 0.55];

  for (let i = 120; i >= 0; i--) {
    const date = addDays(today, -i);
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    habits.forEach((h, hi) => {
      if (!h.activeDays.includes(weekday)) return;
      if (rand() > rates[hi]) return;
      let value = 1;
      if (h.type === 'numeric') {
        const factor = 0.6 + rand() * 1.2;
        value = Math.round(h.target * factor * 2) / 2;
      }
      entries.push({ habitId: h.id, date, value, notes: '' });
    });
    wellness.push({
      date,
      mood: Math.min(5, Math.max(1, Math.round(3 + (rand() - 0.45) * 3))),
      sleepHours: Math.round((6 + rand() * 2.5) * 2) / 2,
    });
  }
  return { habits, entries, wellness };
}

const localAdapter: DataAdapter = {
  mode: 'local',
  async listHabits() {
    return loadDB().habits.filter((h) => !h.archived).sort((a, b) => a.position - b.position);
  },
  async listArchived() {
    return loadDB().habits.filter((h) => h.archived).sort((a, b) => a.position - b.position);
  },
  async reorderHabits(ids) {
    const db = loadDB();
    ids.forEach((id, i) => {
      const h = db.habits.find((x) => x.id === id);
      if (h) h.position = i;
    });
    saveDB(db);
  },
  async createHabit(input) {
    const db = loadDB();
    const habit: Habit = {
      id: uuid(),
      name: input.name,
      question: input.question ?? '',
      type: input.type ?? 'boolean',
      unit: input.unit ?? '',
      target: input.target ?? 1,
      targetType: input.targetType ?? 'at_least',
      color: input.color ?? '#7FD1AE',
      icon: input.icon ?? '',
      scheduleType: input.scheduleType ?? 'weekdays',
      frequency: input.frequency ?? 3,
      webhookUrl: input.webhookUrl ?? '',
      reminderTime: input.reminderTime ?? '',
      activeDays: input.activeDays ?? [0, 1, 2, 3, 4, 5, 6],
      position: db.habits.length,
      archived: false,
      createdAt: new Date().toISOString(),
    };
    db.habits.push(habit);
    saveDB(db);
    return habit;
  },
  async updateHabit(id, patch) {
    const db = loadDB();
    const habit = db.habits.find((h) => h.id === id);
    if (!habit) throw new Error('habit not found');
    Object.assign(habit, patch);
    saveDB(db);
    return habit;
  },
  async deleteHabit(id) {
    const db = loadDB();
    db.habits = db.habits.filter((h) => h.id !== id);
    db.entries = db.entries.filter((e) => e.habitId !== id);
    saveDB(db);
  },
  async getEntries(from, to) {
    return loadDB().entries.filter((e) => e.date >= from && e.date <= to);
  },
  async putEntry(entry) {
    const db = loadDB();
    const i = db.entries.findIndex((e) => e.habitId === entry.habitId && e.date === entry.date);
    if (i >= 0) db.entries[i] = entry;
    else db.entries.push(entry);
    saveDB(db);
    return entry;
  },
  async deleteEntry(habitId, date) {
    const db = loadDB();
    db.entries = db.entries.filter((e) => !(e.habitId === habitId && e.date === date));
    saveDB(db);
  },
  async putWellness(day) {
    const db = loadDB();
    const existing = db.wellness.find((w) => w.date === day.date);
    if (existing) {
      if (day.mood !== undefined && day.mood !== null) existing.mood = day.mood;
      if (day.sleepHours !== undefined && day.sleepHours !== null) existing.sleepHours = day.sleepHours;
      saveDB(db);
      return existing;
    }
    const row: WellnessDay = { date: day.date, mood: day.mood ?? null, sleepHours: day.sleepHours ?? null };
    db.wellness.push(row);
    saveDB(db);
    return row;
  },
  async getWellness(from, to) {
    const db = loadDB();
    return db.wellness.filter((w) => w.date >= from && w.date <= to);
  },
  async getOverview(year, month) {
    const db = loadDB();
    return computeOverview(db.habits, db.entries, db.wellness, year, month);
  },
  async getHabitDetail(id) {
    const db = loadDB();
    const habit = db.habits.find((h) => h.id === id);
    if (!habit) throw new Error('habit not found');
    return computeHabitDetail(habit, db.entries);
  },
  async getInsights(days = 90) {
    const db = loadDB();
    return computeInsights(db.habits, db.entries, db.wellness, days);
  },
  async bulkPutEntries(entries) {
    const db = loadDB();
    const key = (e: Entry) => `${e.habitId}|${e.date}`;
    const idx = new Map(db.entries.map((e, i) => [key(e), i]));
    for (const e of entries) {
      const i = idx.get(key(e));
      if (i != null) db.entries[i] = e;
      else db.entries.push(e);
    }
    saveDB(db);
    return entries.length;
  },
};

// ------------------------------------------------------------- detection
export async function detectAdapter(): Promise<DataAdapter> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(`${API}/habits`, {
      signal: ctrl.signal,
      headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
    });
    clearTimeout(t);
    if (res.ok || res.status === 401) return apiAdapter;
  } catch {
    /* backend not reachable */
  }
  return localAdapter;
}

export function resetDemoData() {
  localStorage.removeItem(LS_KEY);
}
