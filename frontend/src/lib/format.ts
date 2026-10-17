import type { Habit } from './types';

/** Units that mean "time spent": values are shown as 1h 30m instead of 90 min. */
export type DurationUnit = 'min' | 'h';

export function durationUnit(unit: string): DurationUnit | null {
  const u = unit.trim().toLowerCase();
  if (['min', 'mins', 'minute', 'minutes', 'm'].includes(u)) return 'min';
  if (['h', 'hr', 'hrs', 'hour', 'hours'].includes(u)) return 'h';
  return null;
}

export const isDuration = (h: Pick<Habit, 'type' | 'unit'>) => h.type === 'numeric' && durationUnit(h.unit) !== null;

/** 90 -> "1h 30m", 45 -> "45m", 2 hours -> "2h". Non-duration habits keep "value unit". */
export function fmtValue(h: Pick<Habit, 'type' | 'unit'>, v: number): string {
  const d = durationUnit(h.unit);
  if (h.type !== 'numeric' || !d) return `${round(v)}${h.unit ? ` ${h.unit}` : ''}`;
  const minutes = Math.round(d === 'h' ? v * 60 : v);
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs === 0) return `${mins}m`;
  return mins === 0 ? `${hrs}h` : `${hrs}h ${mins}m`;
}

/** How much the "+" button adds: 5 minutes, a quarter hour, or 1 of anything else. */
export function stepFor(h: Pick<Habit, 'unit'>): number {
  const d = durationUnit(h.unit);
  return d === 'min' ? 5 : d === 'h' ? 0.25 : 1;
}

const round = (n: number) => Math.round(n * 100) / 100;
