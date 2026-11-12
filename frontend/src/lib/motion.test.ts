import { describe, expect, it } from 'vitest';
import { anchorBefore, easeOut, spliceGhosts } from './motion';
import type { ExitItem } from './motion';

const item = (key: string, leaving = false): ExitItem<string> => ({ item: key, key, leaving });
const keys = (l: ExitItem<string>[]) => l.map((e) => e.key + (e.leaving ? '*' : '')).join(' ');

describe('exit list placement', () => {
  it('keeps a removed row where it was, right after the row that preceded it', () => {
    // before: a b c d, "b" was removed
    const after = anchorBefore(['a', 'b', 'c', 'd'], 1, (k) => k !== 'b');
    expect(after).toBe('a');
    expect(keys(spliceGhosts([item('a'), item('c'), item('d')], [{ entry: item('b', true), after }]))).toBe('a b* c d');
  });

  it('puts a removed first row back at the top', () => {
    const after = anchorBefore(['a', 'b', 'c'], 0, () => true);
    expect(after).toBeNull();
    expect(keys(spliceGhosts([item('b'), item('c')], [{ entry: item('a', true), after }]))).toBe('a* b c');
  });

  it('skips over neighbours that left too, and handles several leaving rows', () => {
    // before: a b c d e; "b" and "c" removed together
    const alive = (k: string) => k !== 'b' && k !== 'c';
    const live = [item('a'), item('d'), item('e')];
    const ghosts = [
      { entry: item('b', true), after: anchorBefore(['a', 'b', 'c', 'd', 'e'], 1, alive) },
      { entry: item('c', true), after: anchorBefore(['a', 'b', 'c', 'd', 'e'], 2, (k) => alive(k) || k === 'b') },
    ];
    expect(keys(spliceGhosts(live, ghosts))).toBe('a b* c* d e');
  });

  it('a ghost whose anchor is gone falls back to the top rather than vanishing', () => {
    expect(keys(spliceGhosts([item('x')], [{ entry: item('b', true), after: 'missing' }]))).toBe('b* x');
  });
});

describe('easing', () => {
  it('runs from 0 to 1 and slows down towards the end', () => {
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
    expect(easeOut(0.5)).toBeGreaterThan(0.5);
    expect(easeOut(0.9) - easeOut(0.8)).toBeLessThan(easeOut(0.2) - easeOut(0.1));
  });
});
