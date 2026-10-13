import { create } from 'zustand';
import type { DataAdapter, HabitInput, User } from './api';
import { API, AuthError, authApi, detectAdapter, getToken, resetDemoData, setToken } from './api';
import type { Entry, Group, GroupDashboard, GroupInvite, Habit, HabitDetail, Insights, Overview, Reaction } from './lib/types';
import { SKIP, addDays, computeOverview, isCompleted, isSkip, monthRange, todayISO } from './lib/stats';
import { quickCurrentStreak } from './lib/periods';
import { flushQueue, socialApi } from './api';
import { loadPrefs, savePrefs } from './lib/feedback';
import type { FeedbackPrefs } from './lib/feedback';

export type Theme = 'system' | 'forest-dark' | 'pitch-black' | 'forest-light';
export const THEME_CYCLE: Theme[] = ['system', 'forest-dark', 'pitch-black', 'forest-light'];

export interface Toast { id: number; message: string; undo?: () => void }

const ENTRY_LOOKBACK = 120; // days of entries kept in memory for grid + streaks

interface AppState {
  adapter: DataAdapter | null;
  ready: boolean;
  theme: Theme;
  toast: Toast | null;
  showToast(message: string, undo?: () => void): void;
  dismissToast(): void;
  habits: Habit[];
  entries: Entry[]; // rolling window, last ENTRY_LOOKBACK days
  overview: Overview | null; // current month (for the dashboard panels)
  detail: HabitDetail | null;
  detailOpen: boolean;
  editorHabit: Habit | 'new' | null;
  archived: Habit[];
  archivedOpen: boolean;
  journalOpen: boolean;
  openJournal(): void;
  closeJournal(): void;
  paletteOpen: boolean;
  setPaletteOpen(open: boolean): void;
  accent: string | null;
  setAccent(hex: string | null): void;
  insights: Insights | null;
  // collaboration
  groupsOpen: boolean;
  groups: Group[];
  invites: GroupInvite[];
  reactions: Reaction[];
  activeGroupId: string | null;
  groupDashboard: GroupDashboard | null;
  openGroups(): Promise<void>;
  closeGroups(): void;
  loadSocial(): Promise<void>;
  createGroup(name: string, icon: string): Promise<void>;
  openGroupDashboard(id: string): Promise<void>;
  joinByCode(code: string): Promise<string | null>;
  respondInvite(id: string, action: 'accept' | 'decline'): Promise<void>;
  reactTo(groupId: string, toUser: string, habitId: string, emoji?: string): Promise<void>;
  cheersSeenAt: string;
  celebration: { habitName: string; color: string; len: number } | null;
  dismissCelebration(): void;
  setSkip(habit: Habit, date: string, skip: boolean): Promise<void>;
  setNote(habit: Habit, date: string, notes: string): Promise<void>;
  user: User | null;
  authRequired: boolean;
  authConfig: { registration: boolean; oidc: { enabled: boolean; name?: string } } | null;
  ssoError: string | null;
  loginWithSSO(): void;
  gridYear: number;
  gridMonth: number; // 1-12, the month shown in the habit grid
  categoryFilter: string; // '' = all categories (Today + grid)
  feedback: FeedbackPrefs;
  setFeedback(p: Partial<FeedbackPrefs>): void;
  /** bumped whenever mood or sleep is saved, so views built from it can refetch */
  wellnessVersion: number;
  /** Phone navigation: which part of the app the bottom tab bar shows. Wider screens show everything. */
  view: AppView;
  /** +1 when the last tab change moved right (towards Groups), -1 when it moved left: drives the slide-in. */
  viewDir: 1 | -1;
  setView(v: AppView): void;
  /** Switch tab; Groups also loads its data. */
  goView(v: AppView): void;
  setCategoryFilter(c: string): void;

  shiftGridMonth(delta: number): Promise<void>;
  reorderHabits(ids: string[]): Promise<void>;

  login(email: string, password: string): Promise<void>;
  register(email: string, password: string, name: string): Promise<void>;
  logout(): void;
  changePassword(current: string, next: string): Promise<void>;
  updateName(name: string): Promise<void>;
  updateProfile(patch: { name?: string; ntfyUrl?: string; timezone?: string; quietStart?: string; quietEnd?: string }): Promise<void>;
  deleteAccount(password: string): Promise<void>;
  init(): Promise<void>;
  openArchived(): Promise<void>;
  closeArchived(): void;
  pauseOpen: boolean;
  /** Habits ticked when the Take a break popup opens (null = all of them). */
  pausePreset: string[] | null;
  setPauseOpen(open: boolean, preset?: string[]): void;
  /** Vacation / sick days: skip every open day from..to for these habits. Returns days paused. */
  pauseHabits(habitIds: string[], from: string, to: string): Promise<number>;
  restoreHabit(id: string): Promise<void>;
  refresh(): Promise<void>;
  refreshOverview(): Promise<void>;
  toggleEntry(habit: Habit, date: string): Promise<void>;
  setNumericEntry(habit: Habit, date: string, value: number | null): Promise<void>;
  restoreEntry(habit: Habit, date: string, prev: Entry | undefined): Promise<void>;
  saveHabit(input: HabitInput, id?: string): Promise<void>;
  deleteHabit(id: string): Promise<void>;
  archiveHabit(id: string): Promise<void>;
  openDetail(id: string): Promise<void>;
  closeDetail(): void;
  /** Reload the open habit window after its entries changed from inside it. */
  refreshDetail(): Promise<void>;
  openEditor(habit: Habit | 'new'): void;
  closeEditor(): void;
  setTheme(theme: Theme): void;
  logWellness(date: string, mood: number | null, sleepHours: number | null): Promise<void>;
  resetDemo(): Promise<void>;
}

const THEME_KEY = 'openhabit.theme';
const ACCENT_KEY = 'openhabit.accent';

function applyAccent(hex: string | null) {
  const root = document.documentElement;
  if (!hex) {
    root.style.removeProperty('--mint');
    localStorage.removeItem(ACCENT_KEY);
    return;
  }
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return;
  root.style.setProperty('--mint', `${parseInt(m[1], 16)} ${parseInt(m[2], 16)} ${parseInt(m[3], 16)}`);
  localStorage.setItem(ACCENT_KEY, hex);
}

const darkQuery = () => (typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null);

/** The concrete palette for a preference ("system" follows the phone's light/dark setting). */
export function resolveTheme(theme: Theme): Exclude<Theme, 'system'> {
  if (theme !== 'system') return theme;
  return darkQuery()?.matches === false ? 'forest-light' : 'forest-dark';
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = resolveTheme(theme);
  localStorage.setItem(THEME_KEY, theme);
}

function syncTimezone(user: User | null) {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (user && tz && user.timezone !== tz) {
      authApi.updateProfile({ timezone: tz }).then((u) => useApp.setState({ user: u })).catch(() => {});
    }
  } catch { /* environments without Intl tz */ }
}

const MILESTONES = new Set([7, 30, 100, 365]);
const CATEGORY_KEY = 'openhabit.category';
const VIEW_KEY = 'openhabit.view';
export const VIEW_ORDER: AppView[] = ['today', 'habits', 'stats', 'groups'];
export type AppView = 'today' | 'habits' | 'stats' | 'groups';
export const isPhone = () => typeof matchMedia === 'function' && matchMedia('(max-width: 639px)').matches;

/** Habits in the selected category (all of them when the filter is empty or stale). */
export function visibleHabits(habits: Habit[], filter: string): Habit[] {
  if (!filter || !habits.some((h) => h.category === filter)) return habits;
  return habits.filter((h) => h.category === filter);
}

function maybeCelebrate(
  habit: Habit,
  entries: Entry[],
  set: (p: { celebration: { habitName: string; color: string; len: number } }) => void
) {
  const lookup = new Map(entries.map((e) => [`${e.habitId}|${e.date}`, e.value]));
  const len = quickCurrentStreak(habit, lookup);
  if (MILESTONES.has(len)) set({ celebration: { habitName: habit.name, color: habit.color, len } });
}

async function currentOverview(adapter: DataAdapter) {
  const now = new Date();
  return adapter.getOverview(now.getFullYear(), now.getMonth() + 1);
}

export const useApp = create<AppState>((set, get) => ({
  adapter: null,
  ready: false,
  theme: THEME_CYCLE.includes(localStorage.getItem(THEME_KEY) as Theme)
    ? (localStorage.getItem(THEME_KEY) as Theme)
    : 'system',
  toast: null,
  showToast(message, undo) {
    set({ toast: { id: Date.now(), message, undo } });
  },
  dismissToast: () => set({ toast: null }),
  habits: [],
  entries: [],
  overview: null,
  detail: null,
  detailOpen: false,
  editorHabit: null,
  archived: [],
  archivedOpen: false,
  journalOpen: false,
  openJournal: () => set({ journalOpen: true }),
  closeJournal: () => set({ journalOpen: false }),
  paletteOpen: false,
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  accent: localStorage.getItem(ACCENT_KEY),
  setAccent(hex) {
    applyAccent(hex);
    set({ accent: hex });
  },
  insights: null,
  groupsOpen: false,
  groups: [],
  invites: [],
  reactions: [],
  activeGroupId: null,
  groupDashboard: null,

  async openGroups() {
    // phones show Groups as a tab; wider screens keep it a popup
    if (isPhone()) get().setView('groups'); else set({ groupsOpen: true });
    await get().loadSocial();
    const now = new Date().toISOString();
    localStorage.setItem('openhabit.cheersSeen', now);
    set({ cheersSeenAt: now });
  },
  closeGroups: () => set({ groupsOpen: false, activeGroupId: null, groupDashboard: null }),

  async loadSocial() {
    const { adapter } = get();
    if (adapter?.mode !== 'api') return;
    try {
      const [groups, invites, reactions] = await Promise.all([
        socialApi.listGroups(),
        socialApi.myInvites(),
        socialApi.myReactions(),
      ]);
      set({ groups, invites, reactions });
    } catch { /* offline: leave as-is */ }
  },

  async createGroup(name, icon) {
    const g = await socialApi.createGroup(name, icon);
    set({ groups: [...get().groups, g] });
    await get().openGroupDashboard(g.id);
  },

  async openGroupDashboard(id) {
    set({ activeGroupId: id, groupDashboard: null });
    const dash = await socialApi.dashboard(id);
    set({ groupDashboard: dash });
  },

  async joinByCode(code) {
    try {
      const { groupId } = await socialApi.joinByCode(code);
      await get().loadSocial();
      return groupId;
    } catch { return null; }
  },

  async respondInvite(id, action) {
    await socialApi.respondInvite(id, action);
    await get().loadSocial();
  },

  cheersSeenAt: localStorage.getItem('openhabit.cheersSeen') ?? '1970-01-01',

  async reactTo(groupId, toUser, habitId, emoji = '🔥') {
    await socialApi.react(groupId, toUser, habitId, emoji).catch(() => {});
    if (get().activeGroupId === groupId) await get().openGroupDashboard(groupId);
  },

  celebration: null,
  dismissCelebration: () => set({ celebration: null }),
  user: null,
  authRequired: false,
  authConfig: null,
  ssoError: null,
  loginWithSSO() {
    // full-page navigation to the auth-service login route (via the gateway)
    window.location.href = `${API}/auth/oidc/login`;
  },
  gridYear: new Date().getFullYear(),
  gridMonth: new Date().getMonth() + 1,
  view: (() => {
    try { const v = localStorage.getItem(VIEW_KEY); return v === 'habits' || v === 'stats' ? v : 'today'; } catch { return 'today'; }
  })() as AppView,
  viewDir: 1,
  setView(v) {
    const { view } = get();
    if (v === view) return;
    // Groups is a live page, so it is not remembered as the tab to reopen on
    try { if (v !== 'groups') localStorage.setItem(VIEW_KEY, v); } catch { /* private mode */ }
    set({ view: v, viewDir: VIEW_ORDER.indexOf(v) >= VIEW_ORDER.indexOf(view) ? 1 : -1 });
    window.scrollTo({ top: 0 });
  },
  goView(v) {
    if (v === 'groups') { void get().openGroups(); return; }
    get().setView(v);
  },
  feedback: loadPrefs(),
  wellnessVersion: 0,
  setFeedback(p) {
    const next = { ...get().feedback, ...p };
    savePrefs(next);
    set({ feedback: next });
  },
  categoryFilter: (() => { try { return localStorage.getItem(CATEGORY_KEY) ?? ''; } catch { return ''; } })(),
  setCategoryFilter(c) {
    try { localStorage.setItem(CATEGORY_KEY, c); } catch { /* private mode */ }
    set({ categoryFilter: c });
  },

  async shiftGridMonth(delta) {
    const { gridYear, gridMonth } = get();
    const d = new Date(gridYear, gridMonth - 1 + delta, 1);
    set({ gridYear: d.getFullYear(), gridMonth: d.getMonth() + 1 });
    await get().refresh();
  },

  async reorderHabits(ids) {
    const { adapter, habits } = get();
    if (!adapter) return;
    const byId = new Map(habits.map((h) => [h.id, h]));
    set({ habits: ids.map((id) => byId.get(id)!).filter(Boolean) }); // optimistic
    await adapter.reorderHabits(ids).catch(() => {});
    await get().refresh();
  },

  async login(email, password) {
    const { token, user } = await authApi.login(email, password);
    setToken(token);
    set({ user, authRequired: false });
    syncTimezone(user);
    await get().refresh();
  },

  async register(email, password, name) {
    const { token, user } = await authApi.register(email, password, name);
    setToken(token);
    set({ user, authRequired: false });
    syncTimezone(user);
    await get().refresh();
  },

  logout() {
    setToken(null);
    set({
      user: null, authRequired: true,
      habits: [], entries: [], overview: null,
      detail: null, detailOpen: false, archived: [], archivedOpen: false,
    });
  },

  async changePassword(current, next) {
    await authApi.changePassword(current, next);
  },

  async updateName(name) {
    const user = await authApi.updateName(name);
    set({ user });
  },

  async updateProfile(patch) {
    const user = await authApi.updateProfile(patch);
    set({ user });
  },

  async deleteAccount(password) {
    await authApi.deleteAccount(password);
    get().logout();
  },

  async openArchived() {
    const { adapter } = get();
    if (!adapter) return;
    set({ archivedOpen: true, archived: await adapter.listArchived() });
  },

  closeArchived: () => set({ archivedOpen: false }),
  pauseOpen: false,
  pausePreset: null,
  setPauseOpen: (open, preset) => set({ pauseOpen: open, pausePreset: open ? preset ?? null : null }),
  async pauseHabits(habitIds, from, to) {
    const { adapter, entries } = get();
    if (!adapter || from > to) return 0;
    const taken = new Set(entries.map((e) => `${e.habitId}|${e.date}`));
    const batch: Entry[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) {
      for (const id of habitIds) {
        // never overwrite a day that already has a check-in, value or slip
        if (!taken.has(`${id}|${d}`)) batch.push({ habitId: id, date: d, value: SKIP, notes: '' });
      }
    }
    if (batch.length) await adapter.bulkPutEntries(batch);
    await get().refresh();
    return batch.length;
  },

  async restoreHabit(id) {
    const { adapter } = get();
    if (!adapter) return;
    await adapter.updateHabit(id, { archived: false });
    set({ archived: get().archived.filter((h) => h.id !== id) });
    await get().refresh();
  },

  async init() {
    applyTheme(get().theme);
    darkQuery()?.addEventListener?.('change', () => {
      if (get().theme === 'system') applyTheme('system');
    });
    applyAccent(get().accent);
    const adapter = await detectAdapter();
    set({ adapter });
    if (adapter.mode === 'api') {
      // returning from an SSO redirect? capture the token from the URL fragment
      const hash = window.location.hash;
      const tokenMatch = /sso_token=([^&]+)/.exec(hash);
      const errorMatch = /sso_error=([^&]+)/.exec(hash);
      if (tokenMatch) {
        setToken(decodeURIComponent(tokenMatch[1]));
        history.replaceState(null, '', window.location.pathname + window.location.search);
      } else if (errorMatch) {
        set({ ssoError: decodeURIComponent(errorMatch[1]) });
        history.replaceState(null, '', window.location.pathname + window.location.search);
      }
      // discover which auth methods this instance offers (best-effort)
      authApi.config().then((cfg) => set({ authConfig: cfg })).catch(() => {});
      if (getToken()) {
        try {
          const me = await authApi.me();
          set({ user: me });
          syncTimezone(me);
        } catch {
          setToken(null);
          set({ authRequired: true });
        }
      } else {
        set({ authRequired: true });
      }
    }
    set({ ready: true });
    if (!get().authRequired) {
      await get().refresh();
      get().loadSocial().catch(() => {});
    }
  },

  // overview that survives going offline: falls back to a local computation
  // from in-memory habits + entries (+ last-known wellness)
  async refreshOverview() {
    const { adapter } = get();
    if (!adapter) return;
    try {
      set({ overview: await currentOverview(adapter) });
    } catch (e) {
      if (e instanceof TypeError) {
        const { habits, entries, overview } = get();
        const now = new Date();
        set({
          overview: computeOverview(
            habits, entries, overview?.wellness ?? [],
            now.getFullYear(), now.getMonth() + 1
          ),
        });
        return;
      }
      throw e;
    }
  },

  async refresh() {
    const { adapter } = get();
    if (!adapter) return;
    try {
      if (adapter.mode === 'api') await flushQueue().catch(() => {});
      const today = todayISO();
      const { gridYear, gridMonth } = get();
      const grid = monthRange(gridYear, gridMonth);
      const from = grid.start < addDays(today, -(ENTRY_LOOKBACK - 1))
        ? grid.start
        : addDays(today, -(ENTRY_LOOKBACK - 1));
      const to = grid.end > today ? grid.end : today;
      const [overview, habits, entries, insights] = await Promise.all([
        currentOverview(adapter),
        adapter.listHabits(),
        adapter.getEntries(from, to),
        adapter.getInsights(90).catch(() => null),
      ]);
      set({ overview, habits, entries, insights });
    } catch (e) {
      if (e instanceof AuthError) {
        setToken(null);
        set({ user: null, authRequired: true });
        return;
      }
      if (e instanceof TypeError) {
        // offline: keep whatever state we have; recompute overview locally
        await get().refreshOverview();
        return;
      }
      throw e;
    }
  },

  async toggleEntry(habit, date) {
    const { adapter, entries } = get();
    if (!adapter) return;
    const existing = entries.find((e) => e.habitId === habit.id && e.date === date);
    const rest = entries.filter((e) => e !== existing);
    const undoTo = () => get().restoreEntry(habit, date, existing);
    if (!existing) {
      // none -> done
      const entry: Entry = { habitId: habit.id, date, value: 1 };
      const next = [...entries, entry];
      set({ entries: next });
      await adapter.putEntry(entry).catch(() => {});
      maybeCelebrate(habit, next, set);
      get().showToast(`${habit.name} marked done`, undoTo);
    } else if (!isSkip(existing.value) && isCompleted(habit, existing.value)) {
      // done -> skip
      const entry: Entry = { habitId: habit.id, date, value: SKIP, notes: existing.notes };
      set({ entries: [...rest, entry] });
      await adapter.putEntry(entry).catch(() => {});
      get().showToast(`${habit.name} skipped`, undoTo);
    } else {
      // skip (or stale value) -> none
      set({ entries: rest });
      await adapter.deleteEntry(habit.id, date).catch(() => {});
      get().showToast(`${habit.name} cleared`, undoTo);
    }
    await get().refreshOverview();
  },

  async restoreEntry(habit, date, prev) {
    const { adapter, entries } = get();
    if (!adapter) return;
    const rest = entries.filter((e) => !(e.habitId === habit.id && e.date === date));
    if (prev) {
      set({ entries: [...rest, prev] });
      await adapter.putEntry(prev).catch(() => {});
    } else {
      set({ entries: rest });
      await adapter.deleteEntry(habit.id, date).catch(() => {});
    }
    await get().refreshOverview();
  },

  async setSkip(habit, date, skip) {
    const { adapter, entries } = get();
    if (!adapter) return;
    const existing = entries.find((e) => e.habitId === habit.id && e.date === date);
    const rest = entries.filter((e) => e !== existing);
    get().showToast(skip ? `${habit.name} skipped` : `${habit.name} unskipped`, () => get().restoreEntry(habit, date, existing));
    if (skip) {
      const entry: Entry = { habitId: habit.id, date, value: SKIP, notes: existing?.notes ?? '' };
      set({ entries: [...rest, entry] });
      await adapter.putEntry(entry).catch(() => {});
    } else if (existing && isSkip(existing.value)) {
      set({ entries: rest });
      await adapter.deleteEntry(habit.id, date).catch(() => {});
    }
    await get().refreshOverview();
  },

  async setNote(habit, date, notes) {
    const { adapter, entries } = get();
    if (!adapter) return;
    const existing = entries.find((e) => e.habitId === habit.id && e.date === date);
    const rest = entries.filter((e) => e !== existing);
    const value = existing?.value ?? 0; // note on an unlogged day records value 0
    const entry: Entry = { habitId: habit.id, date, value, notes };
    set({ entries: [...rest, entry] });
    await adapter.putEntry(entry).catch(() => {});
  },

  async setNumericEntry(habit, date, value) {
    const { adapter, entries } = get();
    if (!adapter) return;
    const prevEntry = entries.find((e) => e.habitId === habit.id && e.date === date);
    const existingNotes = prevEntry?.notes ?? '';
    get().showToast(value == null ? `${habit.name} cleared` : `${habit.name} updated`, () => get().restoreEntry(habit, date, prevEntry));
    const rest = entries.filter((e) => !(e.habitId === habit.id && e.date === date));
    if (value == null) {
      set({ entries: rest });
      await adapter.deleteEntry(habit.id, date).catch(() => {});
    } else {
      const entry: Entry = { habitId: habit.id, date, value, notes: existingNotes };
      const next = [...rest, entry];
      set({ entries: next });
      await adapter.putEntry(entry).catch(() => {});
      maybeCelebrate(habit, next, set);
    }
    await get().refreshOverview();
  },

  async saveHabit(input, id) {
    const { adapter } = get();
    if (!adapter) return;
    if (id) await adapter.updateHabit(id, input);
    else await adapter.createHabit(input);
    set({ editorHabit: null });
    await get().refresh();
    if (id && get().detailOpen) {
      set({ detail: await adapter.getHabitDetail(id) });
    }
  },

  async deleteHabit(id) {
    const { adapter } = get();
    if (!adapter) return;
    await adapter.deleteHabit(id);
    set({
      detailOpen: false, detail: null, editorHabit: null,
      archived: get().archived.filter((h) => h.id !== id),
    });
    await get().refresh();
  },

  async archiveHabit(id) {
    const { adapter } = get();
    if (!adapter) return;
    await adapter.updateHabit(id, { archived: true });
    set({ detailOpen: false, detail: null, editorHabit: null });
    await get().refresh();
  },

  async openDetail(id) {
    const { adapter } = get();
    if (!adapter) return;
    set({ detailOpen: true, detail: null });
    set({ detail: await adapter.getHabitDetail(id) });
  },

  closeDetail: () => set({ detailOpen: false, detail: null }),
  async refreshDetail() {
    const { adapter, detail } = get();
    if (!adapter || !detail) return;
    const fresh = await adapter.getHabitDetail(detail.habit.id);
    if (get().detail?.habit.id === fresh.habit.id) set({ detail: fresh });
  },
  openEditor: (habit) => set({ editorHabit: habit }),
  closeEditor: () => set({ editorHabit: null }),

  setTheme(theme) {
    applyTheme(theme);
    set({ theme });
  },

  async logWellness(date, mood, sleepHours) {
    const { adapter } = get();
    if (!adapter) return;
    await adapter.putWellness({ date, mood, sleepHours });
    set((st) => ({ wellnessVersion: st.wellnessVersion + 1 }));
    await get().refreshOverview();
  },

  async resetDemo() {
    const { adapter } = get();
    if (adapter?.mode === 'local') {
      resetDemoData();
      await get().refresh();
    }
  },
}));

export const today = todayISO;
