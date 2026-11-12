// Pure stat computations mirroring analytics-service exactly, so demo mode
// and offline fallbacks behave identically to the backend.
import type { Entry, Habit, HabitDetail, Insights, Overview, WellnessDay } from './types';
import { freezeDays, freezesLeft } from './streaks';

export const iso = (d: Date) => d.toISOString().slice(0, 10);
export const fromISO = (s: string) => new Date(`${s}T00:00:00Z`);
export const addDays = (s: string, n: number) => {
  const d = fromISO(s);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};
export const dow = (s: string) => fromISO(s).getUTCDay();
export const todayISO = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
export const monthRange = (year: number, month: number) => {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const endD = new Date(Date.UTC(year, month, 0));
  return { start, end: iso(endD), daysInMonth: endD.getUTCDate() };
};
export const weekKey = (s: string) => {
  const d = fromISO(s);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return iso(d);
};

// ---- semantics: value === -1 is the SKIP sentinel -----------------------
export const SKIP = -1;
export const isSkip = (v: number | null | undefined) => v === SKIP;

// Quit habits: an entry records a slip, so a day with none counts as done
// (callers keep future days out).
export const isQuit = (h: Pick<Habit, 'kind'>) => h.kind === 'quit';

export function isCompleted(habit: Habit, value: number | undefined | null): boolean {
  if (isSkip(value)) return false;
  if (isQuit(habit)) return value == null || value < 1;
  if (value == null) return false;
  if (habit.type === 'boolean') return value >= 1;
  return habit.targetType === 'at_most' ? value <= habit.target : value >= habit.target;
}

export const isFixedDay = (h: Habit) => h.scheduleType !== 'per_week';

const createdDate = (h: Habit) => h.createdAt.slice(0, 10);

function effectiveStart(h: Habit, entries: Entry[]): string {
  let start = createdDate(h);
  for (const e of entries) if (e.habitId === h.id && e.date < start) start = e.date;
  return start;
}

const scheduledFrom = (h: Habit, start: string, dateStr: string) =>
  isFixedDay(h) && h.activeDays.includes(dow(dateStr)) && dateStr >= start;

export const isScheduled = (h: Habit, dateStr: string) =>
  scheduledFrom(h, createdDate(h), dateStr);

const quotaFor = (freq: number, segDays: number) => Math.max(1, Math.round((freq * segDays) / 7));

export type EntryMap = Map<string, Map<string, Entry>>;

export function buildEntryMap(entries: Entry[]): EntryMap {
  const map: EntryMap = new Map();
  for (const e of entries) {
    if (!map.has(e.habitId)) map.set(e.habitId, new Map());
    map.get(e.habitId)!.set(e.date, e);
  }
  return map;
}

// ==========================================================================
export function computeOverview(
  habits: Habit[],
  entries: Entry[],
  wellness: WellnessDay[],
  year: number,
  month: number
): Overview {
  const { start, end, daysInMonth } = monthRange(year, month);
  const today = todayISO();
  const entryMap = buildEntryMap(entries);
  const active = habits.filter((h) => !h.archived);
  const starts = new Map(active.map((h) => [h.id, effectiveStart(h, entries)]));

  const days: Overview['days'] = [];
  const weekCount = Math.ceil(daysInMonth / 7);
  const weeks = new Map<number, { scheduled: number; completed: number }>();
  for (let w = 1; w <= weekCount; w++) weeks.set(w, { scheduled: 0, completed: 0 });

  let goal = 0;
  let completedTotal = 0;
  const perHabit = active.map((h) => ({
    h, goal: 0, actual: 0, sum: 0, weekCnt: new Map<number, number>(),
  }));

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = addDays(start, d - 1);
    const weekIdx = Math.floor((d - 1) / 7) + 1;
    let scheduled = 0;
    let completed = 0;
    for (const p of perHabit) {
      const entry = entryMap.get(p.h.id)?.get(dateStr);
      const value = entry?.value;
      if (value != null && !isSkip(value) && p.h.type === 'numeric' && value >= 0) p.sum += value;
      if (!isFixedDay(p.h)) {
        if (isCompleted(p.h, value) && dateStr >= starts.get(p.h.id)!) {
          p.weekCnt.set(weekIdx, (p.weekCnt.get(weekIdx) ?? 0) + 1);
        }
        continue;
      }
      if (!scheduledFrom(p.h, starts.get(p.h.id)!, dateStr)) continue;
      if (isSkip(value)) continue;
      p.goal += 1;
      goal += 1;
      scheduled += 1;
      if (isCompleted(p.h, value) && (!isQuit(p.h) || dateStr <= today)) {
        completed += 1;
        completedTotal += 1;
        p.actual += 1;
      }
    }
    const w = weeks.get(weekIdx)!;
    w.scheduled += scheduled;
    w.completed += completed;
    days.push({
      date: dateStr, dow: dow(dateStr), scheduled, completed,
      pct: scheduled ? Math.round((completed / scheduled) * 100) : null,
      isFuture: dateStr > today,
    });
  }

  for (const p of perHabit) {
    if (isFixedDay(p.h)) continue;
    if (starts.get(p.h.id)! > end) continue;
    for (let w = 1; w <= weekCount; w++) {
      const segDays = Math.min(7, daysInMonth - (w - 1) * 7);
      const quota = quotaFor(p.h.frequency, segDays);
      const got = Math.min(p.weekCnt.get(w) ?? 0, quota);
      p.goal += quota;
      p.actual += got;
      goal += quota;
      completedTotal += got;
      const wk = weeks.get(w)!;
      wk.scheduled += quota;
      wk.completed += got;
    }
  }

  const habitsOut = perHabit.map((p) => ({
    id: p.h.id, name: p.h.name, color: p.h.color, icon: p.h.icon,
    type: p.h.type, unit: p.h.unit, target: p.h.target, activeDays: p.h.activeDays,
    goal: p.goal, actual: p.actual, left: Math.max(0, p.goal - p.actual),
    sum: Math.round(p.sum * 10) / 10,
    pct: p.goal ? Math.round((p.actual / p.goal) * 100) : 0,
  }));

  return {
    year, month, start, end, daysInMonth,
    goal, completed: completedTotal, left: Math.max(0, goal - completedTotal),
    overallPct: goal ? Math.round((completedTotal / goal) * 100) : 0,
    days,
    weeks: [...weeks.entries()].map(([week, w]) => ({
      week, pct: w.scheduled ? Math.round((w.completed / w.scheduled) * 100) : 0,
    })),
    habits: habitsOut,
    topHabits: [...habitsOut].sort((a, b) => b.pct - a.pct).slice(0, 10)
      .map(({ id, name, color, pct }) => ({ id, name, color, pct })),
    wellness: wellness.filter((w) => w.date >= start && w.date <= end),
  };
}

// ==========================================================================
export function computeHabitDetail(habit: Habit, entries: Entry[]): HabitDetail {
  const today = todayISO();
  const created = effectiveStart(habit, entries);
  const from = created < addDays(today, -365) ? addDays(today, -365) : created;
  const entryMap = buildEntryMap(entries).get(habit.id) ?? new Map<string, Entry>();

  const streaks: HabitDetail['bestStreaks'] = [];
  let currentStreak = 0;
  const wd = Array.from({ length: 7 }, () => ({ scheduled: 0, completed: 0 }));
  const scoreSeries: { date: string; score: number }[] = [];
  let freezeInfo = freezeDays(habit, () => undefined, from, today, created); // empty unless protection applies

  if (isFixedDay(habit)) {
    freezeInfo = freezeDays(habit, (d) => entryMap.get(d)?.value, from, today, created);
    let cur: { start: string; end: string; length: number } | null = null;
    let score = 0;
    const DECAY = Math.pow(0.5, 1 / 13);
    for (let d = from; d <= today; d = addDays(d, 1)) {
      if (!scheduledFrom(habit, created, d)) continue;
      const value = entryMap.get(d)?.value;
      if (isSkip(value)) continue;
      const done = isCompleted(habit, value);
      if (!done && d === today && !isQuit(habit)) continue; // today is still open (a slip, though, counts)
      wd[dow(d)].scheduled += 1;
      if (done) {
        wd[dow(d)].completed += 1;
        if (!cur) cur = { start: d, end: d, length: 1 };
        else { cur.end = d; cur.length += 1; }
      } else if (freezeInfo.frozen.has(d)) {
        // a freeze keeps the run going (the day itself still counts as missed for the score)
      } else if (cur) {
        streaks.push(cur);
        cur = null;
      }
      score = score * DECAY + (done ? 1 - DECAY : 0);
      scoreSeries.push({ date: d, score: Math.round(score * 1000) / 10 });
    }
    if (cur) streaks.push(cur);
    currentStreak = cur ? cur.length : 0;
  } else {
    const W = Math.pow(0.5, 1 / 4);
    let score = 0;
    let cur: { start: string; end: string; length: number } | null = null;
    const thisWeek = weekKey(today);
    const cnt = new Map<string, number>();
    for (const [d, e] of entryMap) {
      if (isCompleted(habit, e.value)) {
        cnt.set(weekKey(d), (cnt.get(weekKey(d)) ?? 0) + 1);
        wd[dow(d)].completed += 1;
      }
    }
    for (let wk = weekKey(from); wk <= thisWeek; wk = addDays(wk, 7)) {
      const met = (cnt.get(wk) ?? 0) >= habit.frequency;
      if (wk === thisWeek) {
        if (met) {
          if (!cur) cur = { start: wk, end: wk, length: 1 };
          else { cur.end = wk; cur.length += 1; }
          score = score * W + (1 - W);
          scoreSeries.push({ date: wk, score: Math.round(score * 1000) / 10 });
        }
        break;
      }
      if (met) {
        if (!cur) cur = { start: wk, end: wk, length: 1 };
        else { cur.end = wk; cur.length += 1; }
      } else if (cur) {
        streaks.push(cur);
        cur = null;
      }
      score = score * W + (met ? 1 - W : 0);
      scoreSeries.push({ date: wk, score: Math.round(score * 1000) / 10 });
    }
    if (cur) streaks.push(cur);
    currentStreak = cur ? cur.length : 0;
    const maxCnt = Math.max(1, ...wd.map((x) => x.completed));
    wd.forEach((x) => { x.scheduled = maxCnt; });
  }

  const hist = new Map<string, { completions: number; sum: number }>();
  for (const [date, entry] of entryMap) {
    if (isSkip(entry.value)) continue;
    const key = date.slice(0, 7);
    if (!hist.has(key)) hist.set(key, { completions: 0, sum: 0 });
    const h = hist.get(key)!;
    // quit habits: entries are slips, so the history counts slips
    if (isQuit(habit) ? entry.value >= 1 : isCompleted(habit, entry.value)) h.completions += 1;
    if (habit.type === 'numeric' && entry.value >= 0) h.sum += entry.value;
  }

  return {
    habit: { ...habit, createdDate: created },
    streakUnit: isFixedDay(habit) ? 'days' : 'weeks',
    currentStreak,
    bestStreaks: [...streaks].sort((a, b) => b.length - a.length).slice(0, 5),
    weekdayFrequency: wd.map((w, i) => ({
      dow: i,
      pct: w.scheduled ? Math.round((w.completed / w.scheduled) * 100) : 0,
    })),
    history: [...hist.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, h]) => ({ month, completions: h.completions, sum: Math.round(h.sum * 10) / 10 })),
    scoreSeries: isFixedDay(habit)
      ? scoreSeries.filter((_, i) => i % 3 === 0 || i === scoreSeries.length - 1)
      : scoreSeries,
    entries: [...entryMap.entries()]
      .map(([date, e]) => ({ date, value: e.value }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    frozenDates: [...freezeInfo.frozen].sort(),
    freezesLeft: freezesLeft(habit, freezeInfo.used, today),
  };
}

// ==========================================================================
export function computeInsights(
  habits: Habit[],
  entries: Entry[],
  wellness: WellnessDay[],
  span = 90
): Insights {
  const today = todayISO();
  const from = addDays(today, -(span - 1));
  const entryMap = buildEntryMap(entries);
  const active = habits.filter((h) => !h.archived);
  const starts = new Map(active.map((h) => [h.id, effectiveStart(h, entries)]));
  const moodByDate = new Map(wellness.filter((w) => w.mood != null).map((w) => [w.date, w.mood!]));
  const sleepByDate = new Map(wellness.filter((w) => w.sleepHours != null).map((w) => [w.date, w.sleepHours!]));

  const moodImpact: Insights['moodImpact'] = [];
  for (const h of active) {
    let doneSum = 0, doneN = 0, missSum = 0, missN = 0;
    for (let d = from; d <= today; d = addDays(d, 1)) {
      const mood = moodByDate.get(d);
      if (mood == null || d < starts.get(h.id)!) continue;
      const value = entryMap.get(h.id)?.get(d)?.value;
      if (isSkip(value)) continue;
      if (isFixedDay(h) && !h.activeDays.includes(dow(d))) continue;
      if (isCompleted(h, value)) { doneSum += mood; doneN += 1; }
      else { missSum += mood; missN += 1; }
    }
    if (doneN >= 5 && missN >= 5) {
      const avgDone = doneSum / doneN;
      const avgMiss = missSum / missN;
      moodImpact.push({
        habitId: h.id, name: h.name, color: h.color, icon: h.icon,
        avgMoodDone: Math.round(avgDone * 10) / 10,
        avgMoodMissed: Math.round(avgMiss * 10) / 10,
        diff: Math.round((avgDone - avgMiss) * 10) / 10,
        nDone: doneN, nMissed: missN,
      });
    }
  }
  moodImpact.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  const buckets = [
    { id: 'short', label: 'under 6h', min: 0, max: 6, scheduled: 0, completed: 0 },
    { id: 'ok', label: '6–7.5h', min: 6, max: 7.5, scheduled: 0, completed: 0 },
    { id: 'good', label: '7.5h or more', min: 7.5, max: 25, scheduled: 0, completed: 0 },
  ];
  for (let d = from; d <= today; d = addDays(d, 1)) {
    const sleep = sleepByDate.get(d);
    if (sleep == null) continue;
    const bucket = buckets.find((b) => sleep >= b.min && sleep < b.max);
    if (!bucket) continue;
    for (const h of active) {
      if (!scheduledFrom(h, starts.get(h.id)!, d)) continue;
      const value = entryMap.get(h.id)?.get(d)?.value;
      if (isSkip(value)) continue;
      bucket.scheduled += 1;
      if (isCompleted(h, value)) bucket.completed += 1;
    }
  }

  return {
    span,
    moodDays: moodByDate.size,
    moodImpact: moodImpact.slice(0, 5),
    sleepCompletion: buckets.map((b) => ({
      id: b.id, label: b.label, days: b.scheduled,
      pct: b.scheduled ? Math.round((b.completed / b.scheduled) * 100) : null,
    })),
  };
}
