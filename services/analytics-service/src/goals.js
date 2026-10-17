// Goal progress, derived from the linked habit's entries. Mirrors frontend/src/lib/goals.ts (demo mode
// and offline use the TypeScript copy); keep them in step.
import { addDays, isCompleted, isSkip } from './streaks.js';

const dayDiff = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);
const round1 = (n) => Math.round(n * 10) / 10;

/**
 * @param goal   { id, title, target, unit, startDate, deadline, completedAt }
 * @param habit  the linked habit (camelCase, with type, kind, targetType, target, createdDate)
 * @param valueAt (date) => value | undefined
 * @param today  the user's local date
 */
export function goalProgress(goal, habit, valueAt, today) {
  const measure = habit.type === 'numeric' ? 'sum' : 'days';
  const last = today < goal.deadline ? today : goal.deadline;
  let current = 0;
  // the sum of a measurable habit's values, or the days a yes/no habit was done (a quit habit: clean days)
  for (let d = goal.startDate; d <= last; d = addDays(d, 1)) {
    if (d < habit.createdDate && habit.kind === 'quit') continue;
    const v = valueAt(d);
    if (isSkip(v)) continue;
    if (measure === 'sum') { if (v != null && v >= 0) current += v; } else if (isCompleted(habit, v)) current += 1;
  }
  current = round1(current);
  const target = goal.target;
  const remaining = Math.max(0, round1(target - current));
  const started = today >= goal.startDate;
  const daysTotal = dayDiff(goal.startDate, goal.deadline) + 1;
  const daysLeft = today > goal.deadline ? 0 : dayDiff(today < goal.startDate ? goal.startDate : today, goal.deadline) + 1;
  const elapsed = started ? Math.min(daysTotal, dayDiff(goal.startDate, today) + 1) : 0;

  // pace over the last 14 days (or since the start if shorter): what you are really doing, not the average
  const window = Math.max(1, Math.min(14, elapsed));
  let recent = 0;
  if (started) {
    for (let i = 0; i < window; i++) {
      const d = addDays(today > goal.deadline ? goal.deadline : today, -i);
      if (d < goal.startDate) break;
      const v = valueAt(d);
      if (isSkip(v)) continue;
      if (measure === 'sum') { if (v != null && v >= 0) recent += v; } else if (isCompleted(habit, v)) recent += 1;
    }
  }
  const pace = started ? recent / window : 0;
  const projected = round1(current + pace * daysLeft);
  const etaDate = pace > 0 && remaining > 0 ? addDays(today, Math.min(730, Math.ceil(remaining / pace))) : null;
  const early = started && elapsed < 3;

  let status;
  if (goal.completedAt || current >= target) status = 'done';
  else if (today > goal.deadline) status = 'missed';
  else if (!started) status = 'upcoming';
  else if (early) status = 'on_track';
  else if (projected >= target * 1.15) status = 'ahead';
  else if (projected >= target) status = 'on_track';
  else status = 'behind';

  const unit = goal.unit || (measure === 'days' ? 'days' : habit.unit || '');
  const fmt = (n) => `${round1(n)}${unit ? ` ${unit}` : ''}`;
  const needPerDay = daysLeft > 0 ? remaining / daysLeft : 0;
  let message;
  if (status === 'done') message = `Done: ${fmt(current)} of ${fmt(target)}.`;
  else if (status === 'missed') message = `The deadline passed with ${fmt(current)} of ${fmt(target)}.`;
  else if (status === 'upcoming') message = `Starts ${goal.startDate}.`;
  else {
    const need = `you need about ${fmt(needPerDay < 10 ? Math.round(needPerDay * 100) / 100 : round1(needPerDay))} a day`;
    message = early
      ? `${fmt(current)} of ${fmt(target)} so far; ${need} to finish by ${goal.deadline}.`
      : status === 'behind'
        ? `${fmt(current)} of ${fmt(target)}. At your pace of the last ${window} days you would reach ${fmt(projected)}; ${need} to make it.`
        : `${fmt(current)} of ${fmt(target)}. ${etaDate ? `At your pace you finish around ${etaDate}.` : ''} ${need[0].toUpperCase()}${need.slice(1)}.`.replace(/\s+/g, ' ').trim();
  }
  return {
    id: goal.id, measure, current, target, remaining, pct: Math.min(100, Math.round((current / target) * 100)),
    daysTotal, daysLeft, elapsed, elapsedPct: Math.min(100, Math.round((elapsed / daysTotal) * 100)),
    pace: round1(pace * 100) / 100, projected, etaDate, status, early, needPerDay: round1(needPerDay * 100) / 100, message,
  };
}
