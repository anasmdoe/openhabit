import { describe, expect, it } from 'vitest';
import { contrastRatio, readableColor } from './contrast';

const WHITE: [number, number, number] = [255, 255, 255];
const DARK: [number, number, number] = [22, 25, 28];
const rgbOf = (s: string) => (s.match(/\d+/g) ?? []).map(Number) as [number, number, number];

describe('readableColor', () => {
  it('darkens a pale colour on a white panel until it passes', () => {
    const out = readableColor('#FFE680', WHITE, 3);
    expect(contrastRatio(rgbOf(out), WHITE)).toBeGreaterThanOrEqual(3);
  });
  it('lightens a dark colour on a dark panel', () => {
    const out = readableColor('#1b3a6b', DARK, 3);
    expect(contrastRatio(rgbOf(out), DARK)).toBeGreaterThanOrEqual(3);
  });
  it('leaves a colour that already passes alone (same value)', () => {
    expect(rgbOf(readableColor('#7FD1AE', DARK, 3))).toEqual([127, 209, 174]);
  });
  it('passes through anything that is not a hex colour', () => {
    expect(readableColor('currentColor', DARK)).toBe('currentColor');
  });
});
