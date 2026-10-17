// The weekly review: one week of habit results boiled down to a few honest lines.
// Pure functions over habits and entries, shared by analytics-service (the in-app preview) and
// reminder-service (the Sunday notification and email) so both say the same thing.
import { addDays, dow, isSkip, isCompleted, isFixedDay, freezeDays, freezesEnabled } from './streaks.js';

/** Monday of the week containing `date`. */
export const mondayOf = (date) => addDays(date, -((dow(date) + 6) % 7));

/**
 * The week to review by default: on a Sunday the week that is just ending, otherwise the last
 * complete week. (The Sunday-evening notification therefore reviews the week the user just lived.)
 */
export const defaultWeek = (today) => (dow(today) === 0 ? mondayOf(today) : addDays(mondayOf(today), -7));

const pct = (done, goal) => (goal ? Math.round((done / goal) * 100) : null);

/** { done, goal } for one habit over the week starting `ws`, looking no further than `today`. */
export function weekScore(h, vals, ws, today) {
  const end = addDays(ws, 6) < today ? addDays(ws, 6) : today;
  if (end < ws) return { done: 0, goal: 0 };
  if (!isFixedDay(h)) {
    let done = 0;
    for (let d = ws; d <= end; d = addDays(d, 1)) if (d >= h.createdDate && isCompleted(h, vals.get(d))) done += 1;
    const days = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${ws}T00:00:00Z`)) / 864e5) + 1;
    const quota = Math.min(h.frequency, Math.max(1, Math.round((h.frequency * days) / 7)));
    return { done: Math.min(done, quota), goal: quota };
  }
  let done = 0;
  let goal = 0;
  for (let d = ws; d <= end; d = addDays(d, 1)) {
    if (d < h.createdDate) continue;
    if (h.kind !== 'quit' && !h.activeDays.includes(dow(d))) continue;
    const v = vals.get(d);
    if (isSkip(v)) continue;
    const ok = isCompleted(h, v);
    if (!ok && d === today && h.kind !== 'quit') continue; // still open
    goal += 1;
    if (ok) done += 1;
  }
  return { done, goal };
}

/** Current run for a daily or quit habit, counting a frozen miss as neither a day nor a break. */
function runLength(h, vals, today) {
  if (!isFixedDay(h)) return 0;
  const from = addDays(today, -119);
  const { frozen } = freezeDays(h, (d) => vals.get(d), from, today);
  let run = 0;
  for (let d = from; d <= today; d = addDays(d, 1)) {
    if (d < h.createdDate) continue;
    if (h.kind !== 'quit' && !h.activeDays.includes(dow(d))) continue;
    const v = vals.get(d);
    if (isSkip(v)) continue;
    if (isCompleted(h, v)) run += 1;
    else if ((d === today && h.kind !== 'quit') || frozen.has(d)) continue;
    else run = 0;
  }
  return run;
}

/**
 * @param habits        active habits (camelCase, with createdDate)
 * @param valuesByHabit Map(habitId -> Map(date -> value)), at least 120 days back
 * @param weekStart     the Monday to review
 * @param today         the user's local date
 */
export function buildDigest({ habits, valuesByHabit, weekStart, today }) {
  const prevStart = addDays(weekStart, -7);
  const weekEnd = addDays(weekStart, 6);
  const per = habits.map((h) => {
    const vals = valuesByHabit.get(h.id) ?? new Map();
    const cur = weekScore(h, vals, weekStart, today);
    return { h, vals, ...cur, prev: weekScore(h, vals, prevStart, today) };
  });
  const sum = (key, arr = per) => arr.reduce((n, p) => n + p[key], 0);
  const goal = sum('goal');
  const done = sum('done');
  const prevGoal = per.reduce((n, p) => n + p.prev.goal, 0);
  const prevDone = per.reduce((n, p) => n + p.prev.done, 0);
  const overall = pct(done, goal);
  const prevPct = pct(prevDone, prevGoal);

  const rated = per.filter((p) => p.goal >= 2).map((p) => ({ id: p.h.id, name: p.h.name, done: p.done, goal: p.goal, pct: pct(p.done, p.goal) }));
  const byBest = [...rated].sort((a, b) => b.pct - a.pct || b.done - a.done);
  const byWorst = [...rated].filter((r) => r.pct < 100).sort((a, b) => a.pct - b.pct || (b.goal - b.done) - (a.goal - a.done));
  const best = byBest[0] ?? null;
  const attention = byWorst[0] && byWorst[0].id !== best?.id ? byWorst[0] : null;

  // longest current run among daily and quit habits
  let streak = null;
  for (const p of per) {
    const length = runLength(p.h, p.vals, today);
    if (length >= 2 && (!streak || length > streak.length)) streak = { name: p.h.name, length };
  }

  // streak freezes that saved a day this week
  let freezesUsed = 0;
  for (const p of per) {
    if (!freezesEnabled(p.h)) continue;
    const { frozen } = freezeDays(p.h, (d) => p.vals.get(d), addDays(weekStart, -30), today);
    for (const d of frozen) if (d >= weekStart && d <= weekEnd) freezesUsed += 1;
  }

  // days when every daily habit due that day was done
  let perfectDays = 0;
  const lastDay = weekEnd < today ? weekEnd : today;
  for (let d = weekStart; d <= lastDay; d = addDays(d, 1)) {
    let due = 0;
    let ok = 0;
    for (const p of per) {
      if (!isFixedDay(p.h) || p.h.kind === 'quit' || d < p.h.createdDate || !p.h.activeDays.includes(dow(d))) continue;
      const v = p.vals.get(d);
      if (isSkip(v)) continue;
      if (d === today && !isCompleted(p.h, v)) { due = 0; ok = -1; break; }
      due += 1;
      if (isCompleted(p.h, v)) ok += 1;
    }
    if (due > 0 && ok === due) perfectDays += 1;
  }

  return {
    weekStart, weekEnd,
    enough: goal >= 5,
    overall: { pct: overall, done, goal, prevPct, delta: overall !== null && prevPct !== null ? overall - prevPct : null },
    habits: rated,
    best, attention, streak, freezesUsed, perfectDays,
  };
}

const dayLabel = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** Text for a notification and an email. Plain, specific and never scolding. */
export function digestMessage(d, { name = '', appUrl = '' } = {}) {
  const range = `${dayLabel(d.weekStart)} to ${dayLabel(d.weekEnd)}`;
  if (!d.enough) {
    return {
      subject: 'Your week in OpenHabit',
      pushTitle: 'Your week in OpenHabit',
      pushBody: 'A quiet week: log a few more days and the next review will have more to say.',
      text: `Hi${name ? ` ${name}` : ''},\n\nA quiet week (${range}). Log a few more days and the next review will have more to say.\n${appUrl ? `\n${appUrl}\n` : ''}`,
    };
  }
  const delta = d.overall.delta;
  const trend = delta === null ? '' : delta > 0 ? ` (up ${delta} on the week before)` : delta < 0 ? ` (${-delta} below the week before, a dip and not a reset)` : ' (same as the week before)';
  const lines = [`${d.overall.pct}% of your habits done${trend}: ${d.overall.done} of ${d.overall.goal}.`];
  if (d.best) lines.push(`Strongest: ${d.best.name} (${d.best.done} of ${d.best.goal}).`);
  if (d.attention) lines.push(`Most room: ${d.attention.name} (${d.attention.done} of ${d.attention.goal}).`);
  if (d.perfectDays > 0) lines.push(`${d.perfectDays} perfect day${d.perfectDays === 1 ? '' : 's'}.`);
  if (d.streak) lines.push(`Longest run: ${d.streak.name}, ${d.streak.length} days.`);
  if (d.freezesUsed > 0) lines.push(`A streak freeze saved ${d.freezesUsed === 1 ? 'a day' : `${d.freezesUsed} days`} this week.`);
  const pushBody = [d.best && `Best: ${d.best.name}`, d.attention && `Room to grow: ${d.attention.name}`].filter(Boolean).join(' · ') || lines[0];
  return {
    subject: `Your week: ${d.overall.pct}%`,
    pushTitle: `Your week: ${d.overall.pct}%${delta ? (delta > 0 ? ` (+${delta})` : ` (${delta})`) : ''}`,
    pushBody,
    text: `Hi${name ? ` ${name}` : ''},\n\nYour week, ${range}:\n\n${lines.map((l) => `- ${l}`).join('\n')}\n${appUrl ? `\nOpen OpenHabit: ${appUrl}\n` : ''}\nTurn this email off any time under Account > Weekly review.\n`,
  };
}
