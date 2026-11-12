// Streak protection ("freezes"). A daily build habit with streakFreezes > 0 may have up to that many
// missed days per calendar month forgiven: a miss that comes straight after a completed day keeps the
// streak alive instead of resetting it. A second miss in a row is never forgiven (the day before it was
// a freeze, not a completion), so a freeze covers one sick day, not a week off (use Skip or Take a break
// for that). The same walk runs in analytics-service so the numbers match; nothing is stored, the freezes
// are derived from the entries, so correcting a past day always gives a consistent answer.
import type { Habit } from './types';
import { addDays, dow, isCompleted, isFixedDay, isQuit, isSkip } from './stats';

export const freezesEnabled = (h: Habit) => isFixedDay(h) && !isQuit(h) && (h.streakFreezes ?? 0) > 0;

export interface FreezeResult {
  /** Missed days whose streak was saved by a freeze. */
  frozen: Set<string>;
  /** Freezes used per month ("YYYY-MM"). */
  used: Map<string, number>;
}

/**
 * Walks the scheduled days from `from` to `today` and decides which misses are frozen.
 * Days before the habit existed, unscheduled days and skips are ignored; today, if still open, is not a miss.
 */
export function freezeDays(
  habit: Habit,
  valueAt: (date: string) => number | null | undefined,
  from: string,
  today: string,
  habitStart = habit.createdAt.slice(0, 10),
): FreezeResult {
  const frozen = new Set<string>();
  const used = new Map<string, number>();
  if (!freezesEnabled(habit)) return { frozen, used };
  const allowed = habit.streakFreezes;
  let prev: 'done' | 'frozen' | 'miss' | null = null;
  for (let d = from; d <= today; d = addDays(d, 1)) {
    if (d < habitStart || !habit.activeDays.includes(dow(d))) continue;
    const v = valueAt(d);
    if (isSkip(v)) continue;
    if (isCompleted(habit, v)) { prev = 'done'; continue; }
    if (d === today) continue; // still open
    const month = d.slice(0, 7);
    if (prev === 'done' && (used.get(month) ?? 0) < allowed) {
      frozen.add(d);
      used.set(month, (used.get(month) ?? 0) + 1);
      prev = 'frozen';
    } else {
      prev = 'miss';
    }
  }
  return { frozen, used };
}

/** Freezes still unused in the month of `today`. */
export const freezesLeft = (habit: Habit, used: Map<string, number>, today: string) =>
  freezesEnabled(habit) ? Math.max(0, habit.streakFreezes - (used.get(today.slice(0, 7)) ?? 0)) : 0;
