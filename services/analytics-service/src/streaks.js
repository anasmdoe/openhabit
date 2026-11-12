// Streak and week helpers shared by analytics-service and reminder-service (the weekly review).
// Mirrors frontend/src/lib/streaks.ts and stats.ts; keep them in step. Habit objects use camelCase fields
// (activeDays, scheduleType, targetType, kind, streakFreezes) and `createdDate`, the effective start day.
export const iso = (d) => d.toISOString().slice(0, 10);
export const addDays = (s, n) => { const d = new Date(`${s}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
export const dow = (s) => new Date(`${s}T00:00:00Z`).getUTCDay();
export const isSkip = (v) => v === -1;
export const isFixedDay = (h) => h.scheduleType !== 'per_week';

/** Quit habits: an entry is a slip, so a day without one is clean. */
export function isCompleted(habit, value) {
  if (isSkip(value)) return false;
  if (habit.kind === 'quit') return value == null || value < 1;
  if (value == null) return false;
  if (habit.type === 'boolean') return value >= 1;
  return habit.targetType === 'at_most' ? value <= habit.target : value >= habit.target;
}

/** Streak protection applies to daily build habits with streakFreezes > 0. */
export const freezesEnabled = (h) => isFixedDay(h) && h.kind !== 'quit' && (h.streakFreezes ?? 0) > 0;

/**
 * Which missed days a streak freeze forgave: a miss straight after a completed day, at most
 * `streakFreezes` per calendar month, never two in a row. Skips and unscheduled days are ignored;
 * an open today is not a miss.
 */
export function freezeDays(habit, valueAt, from, today, habitStart = habit.createdDate) {
  const frozen = new Set();
  const used = new Map();
  if (!freezesEnabled(habit)) return { frozen, used };
  let prev = null;
  for (let d = from; d <= today; d = addDays(d, 1)) {
    if (d < habitStart || !habit.activeDays.includes(dow(d))) continue;
    const v = valueAt(d);
    if (isSkip(v)) continue;
    if (isCompleted(habit, v)) { prev = 'done'; continue; }
    if (d === today) continue;
    const month = d.slice(0, 7);
    if (prev === 'done' && (used.get(month) ?? 0) < habit.streakFreezes) {
      frozen.add(d);
      used.set(month, (used.get(month) ?? 0) + 1);
      prev = 'frozen';
    } else {
      prev = 'miss';
    }
  }
  return { frozen, used };
}
