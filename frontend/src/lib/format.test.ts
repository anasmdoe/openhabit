import { describe, expect, it } from 'vitest';
import { durationUnit, fmtValue, stepFor } from './format';

const h = (unit: string, type: 'numeric' | 'boolean' = 'numeric') => ({ type, unit });

describe('duration formatting', () => {
  it('recognises minute and hour units', () => {
    expect(durationUnit(' Minutes ')).toBe('min');
    expect(durationUnit('hrs')).toBe('h');
    expect(durationUnit('pages')).toBeNull();
  });
  it('formats minutes and hours as 1h 30m', () => {
    expect(fmtValue(h('min'), 90)).toBe('1h 30m');
    expect(fmtValue(h('min'), 45)).toBe('45m');
    expect(fmtValue(h('min'), 120)).toBe('2h');
    expect(fmtValue(h('h'), 1.5)).toBe('1h 30m');
    expect(fmtValue(h('h'), 0.25)).toBe('15m');
  });
  it('leaves other units alone', () => {
    expect(fmtValue(h('pages'), 12.5)).toBe('12.5 pages');
    expect(fmtValue(h(''), 3)).toBe('3');
  });
  it('steps by 5 min, a quarter hour or 1', () => {
    expect(stepFor({ unit: 'min' })).toBe(5);
    expect(stepFor({ unit: 'hours' })).toBe(0.25);
    expect(stepFor({ unit: 'Km' })).toBe(1);
  });
});
