// Habit stacking: "after <anchor>, do <habit>". A stacked habit sits right behind its anchor.
import type { Habit } from './types';

/** `list` with every follower moved directly behind its anchor (when the anchor is in the list too). */
export function stackOrder(list: Habit[]): Habit[] {
  const ids = new Set(list.map((h) => h.id));
  const followers = new Map<string, Habit[]>();
  const roots: Habit[] = [];
  for (const h of list) {
    if (h.afterHabitId && h.afterHabitId !== h.id && ids.has(h.afterHabitId)) {
      const a = followers.get(h.afterHabitId) ?? [];
      a.push(h);
      followers.set(h.afterHabitId, a);
    } else roots.push(h);
  }
  const out: Habit[] = [];
  const seen = new Set<string>();
  const visit = (h: Habit) => {
    if (seen.has(h.id)) return;
    seen.add(h.id);
    out.push(h);
    (followers.get(h.id) ?? []).forEach(visit);
  };
  roots.forEach(visit);
  list.forEach(visit); // anything caught in a (server-rejected) cycle still shows up
  return out;
}

/** The section a habit shows under: its own, unless it follows an anchor that is on the list too. */
export function effectiveSection(h: Habit, byId: Map<string, Habit>, own: (h: Habit) => string): string {
  let cur = h;
  for (let n = 0; n < 50; n++) {
    const a = cur.afterHabitId ? byId.get(cur.afterHabitId) : undefined;
    if (!a) return own(cur);
    cur = a;
  }
  return own(cur);
}
