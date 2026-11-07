// Automatic completion from phone health data. Phones (Health Connect on Android, Apple Health through
// a Shortcut) send daily totals; each habit with an auto_metric turns its metric into an entry value.
// Pure, so the rule is unit-tested and the same for every client.

export const METRICS = {
  steps: { max: 200_000 },
  exercise_minutes: { max: 1440 },
  sleep_hours: { max: 24 },
  mindful_minutes: { max: 1440 },
  distance_km: { max: 1000 },
  active_kcal: { max: 20_000 },
  water_ml: { max: 20_000 },
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Validates one day's metrics: { date, metrics: { steps: 8000, ... } }. Returns an error string or null. */
export function checkDay(d) {
  if (!d || typeof d !== 'object' || !DATE_RE.test(d.date ?? '') || Number.isNaN(Date.parse(d.date))) return 'every day needs a YYYY-MM-DD date';
  if (!d.metrics || typeof d.metrics !== 'object' || Array.isArray(d.metrics)) return 'every day needs a metrics object';
  for (const [k, v] of Object.entries(d.metrics)) {
    if (!METRICS[k]) return `unknown metric ${k}`;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > METRICS[k].max) return `${k} must be a number from 0 to ${METRICS[k].max}`;
  }
  return null;
}

/**
 * The value a synced metric gives a habit, or null when it should not write anything.
 * - yes/no habit: 1 once the metric reaches the threshold (no threshold = any amount above zero)
 * - measurable habit: the metric itself, rounded to 2 decimals
 * The caller never lowers an existing value and never touches a skipped day.
 */
export function valueFor(habit, metric) {
  if (metric == null || habit.kind === 'quit' || !habit.autoMetric) return null;
  if (habit.type === 'numeric') return metric > 0 ? Math.round(metric * 100) / 100 : null;
  const threshold = habit.autoThreshold ?? 0;
  return threshold > 0 ? (metric >= threshold ? 1 : null) : metric > 0 ? 1 : null;
}
