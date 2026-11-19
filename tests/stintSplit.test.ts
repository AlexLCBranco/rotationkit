// RK-5: stints that run across a quarter break, shown in parts.
import { describe, expect, it } from 'vitest';
import { barLabels, mergeContinuous, stintParts, stintSplitText } from '../src/domain/stints.ts';
import type { Stint } from '../src/domain/types.ts';

// Q2 ends at 1440, Q3 at 2160, Q4 at 2880, OT at 3180.
const textPx = (t: string) => t.length * 6.2 + 8;
const Q2Q3: Stint = [1026, 2160, 4]; // 6:54 of Q2 + 12:00 of Q3 = 18:54
const Q2Q4: Stint = [1310, 2345, 0]; // 2:10 + 12:00 + 3:05

describe('stintParts', () => {
  it('cuts a stint at each break it crosses', () => {
    expect(stintParts(Q2Q3)).toEqual([
      { a: 1026, b: 1440, period: 2 },
      { a: 1440, b: 2160, period: 3 },
    ]);
    expect(stintParts(Q2Q4).map((p) => [p.period, p.b - p.a])).toEqual([
      [2, 130],
      [3, 720],
      [4, 185],
    ]);
  });
  it('keeps a stint inside one quarter whole; overtime breaks count', () => {
    expect(stintParts([100, 400, 0])).toEqual([{ a: 100, b: 400, period: 1 }]);
    expect(stintParts([2700, 3000, 0]).map((p) => [p.period, p.b - p.a])).toEqual([
      [4, 180],
      [5, 120],
    ]);
  });
  it('follows mergeContinuous: two stored stints across Q2→Q3 become one run in two parts', () => {
    const [run] = mergeContinuous([
      [1026, 1440, 1],
      [1440, 2160, 3],
    ]);
    expect(run!.slice(0, 3)).toEqual([1026, 2160, 4]);
    expect(stintParts(run!)).toHaveLength(2);
  });
});

describe('stintSplitText (tooltip)', () => {
  it('total plus each quarter', () => {
    expect(stintSplitText(Q2Q3)).toBe('18:54 — Q2 6:54, Q3 12:00');
    expect(stintSplitText(Q2Q4)).toBe('17:15 — Q2 2:10, Q3 12:00, Q4 3:05');
    expect(stintSplitText([2700, 3000, 0])).toBe('5:00 — Q4 3:00, OT 2:00');
    expect(stintSplitText([100, 400, 0])).toBe('5:00');
  });
});

describe('barLabels', () => {
  it('one label per part when each has room; points once, after the last part', () => {
    const k = 0.5; // px per second: 6:54 → 207 px, 12:00 → 360 px
    expect(barLabels(Q2Q3, k, null, textPx, 40).parts.map((p) => p.text)).toEqual(['6:54', '12:00']);
    const withPts = barLabels(Q2Q3, k, 17, textPx, 40);
    expect(withPts.parts.map((p) => p.text)).toEqual(['6:54', '12:00 · 17p']);
    expect(withPts.total).toBeNull();
  });
  it('crossing two breaks: three labels', () => {
    expect(barLabels(Q2Q4, 0.5, null, textPx, 40).parts.map((p) => p.text)).toEqual(['2:10', '12:00', '3:05']);
  });
  it('a part too narrow for its label gets none (the others keep theirs)', () => {
    // 0.25 px/s: 2:10 → 32.5 px (< 40, no label), 12:00 → 180 px, 3:05 → 46 px
    const l = barLabels(Q2Q4, 0.25, null, textPx, 40);
    expect(l.parts.map((p) => p.text)).toEqual([null, '12:00', '3:05']);
    expect(l.total).toBeNull();
    // Points that do not fit beside the last part's minutes are left off, the minutes stay.
    expect(barLabels(Q2Q4, 0.25, 9, textPx, 40).parts.at(-1)!.text).toBe('3:05');
  });
  it('no part fits: falls back to the total, as before', () => {
    // 0.05 px/s: parts 20.7 + 36 px; whole bar 56.7 px ≥ 40 → "18:54"
    const l = barLabels(Q2Q3, 0.05, null, textPx, 40);
    expect(l.parts.every((p) => p.text === null)).toBe(true);
    expect(l.total).toBe('18:54');
    expect(barLabels(Q2Q3, 0.02, null, textPx, 40).total).toBeNull();
  });
  it('a stint inside one quarter keeps the old label (total, points when they fit)', () => {
    expect(barLabels([0, 720, 0], 0.5, 8, textPx, 40)).toMatchObject({ total: '12:00 · 8p' });
    expect(barLabels([0, 720, 0], 0.08, 8, textPx, 40)).toMatchObject({ total: '12:00' });
  });
});
