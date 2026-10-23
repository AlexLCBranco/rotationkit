import { describe, expect, it } from 'vitest';
import { elapsedAt, formatGameTime, gameLength, parseIsoDuration, periodAt, periodStart } from '../src/domain/time.ts';

describe('time', () => {
  it('parses ISO durations', () => {
    expect(parseIsoDuration('PT08M11.00S')).toBe(491);
    expect(parseIsoDuration('PT34M12.50S')).toBe(2052.5);
    expect(parseIsoDuration('PT00.40S')).toBe(0.4);
    expect(parseIsoDuration('')).toBe(0);
  });
  it('maps periods incl. OT', () => {
    expect(periodStart(1)).toBe(0);
    expect(periodStart(5)).toBe(2880);
    expect(periodStart(6)).toBe(3180);
    expect(gameLength(4)).toBe(2880);
    expect(gameLength(6)).toBe(3480);
    expect(periodAt(720)).toBe(1);
    expect(periodAt(720.1)).toBe(2);
    expect(periodAt(2900)).toBe(5);
  });
  it('converts clock to elapsed and back', () => {
    expect(elapsedAt(2, 360)).toBe(1080);
    expect(formatGameTime(1080)).toBe('Q2 6:00');
    expect(formatGameTime(2880 + 120)).toBe('OT 3:00');
    expect(formatGameTime(3180 + 300)).toBe('2OT 0:00');
  });
});
