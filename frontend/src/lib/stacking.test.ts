import { describe, expect, it } from 'vitest';
import type { Habit } from './types';
import { effectiveSection, stackOrder } from './stacking';

const h = (id: string, afterHabitId: string | null = null) => ({ id, afterHabitId } as Habit);

describe('stackOrder', () => {
  it('puts a follower directly behind its anchor, chains included', () => {
    const list = [h('a'), h('x'), h('b', 'a'), h('c', 'b'), h('y')];
    expect(stackOrder(list).map((x) => x.id)).toEqual(['a', 'b', 'c', 'x', 'y']);
  });
  it('keeps a follower whose anchor is not on the list in place', () => {
    expect(stackOrder([h('x'), h('b', 'gone'), h('y')]).map((x) => x.id)).toEqual(['x', 'b', 'y']);
  });
  it('never loses a habit even if data holds a loop', () => {
    expect(stackOrder([h('a', 'b'), h('b', 'a')]).map((x) => x.id).sort()).toEqual(['a', 'b']);
  });
});

describe('effectiveSection', () => {
  it('follows the anchor chain to its section', () => {
    const all = [h('a'), h('b', 'a'), h('c', 'b')];
    const byId = new Map(all.map((x) => [x.id, x]));
    const own = (x: Habit) => (x.id === 'a' ? 'morning' : 'anytime');
    expect(effectiveSection(all[2], byId, own)).toBe('morning');
    expect(effectiveSection(all[0], byId, own)).toBe('morning');
  });
});
