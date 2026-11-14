// DNP / inactive labels from the source's reason codes (src/app/dnp.ts): never guessed.

import { describe, expect, it } from 'vitest';
import { dnpLabel, dnpText } from '../src/app/dnp.ts';
import { loadSeason } from './data.ts';

describe('dnpLabel', () => {
  it('coach\'s decision, injury / illness, other, plain', () => {
    expect(dnpLabel('DNP_COACH', undefined)).toEqual({ kind: 'cd', tag: 'DNP – CD' });
    expect(dnpLabel('INACTIVE_COACH', 'Right Thight Contusion', true)).toEqual({ kind: 'cd', tag: 'DNP – CD', detail: 'Right Thight Contusion' });
    expect(dnpLabel('DND_INJURY', 'Left Ankle; Sprain')).toEqual({ kind: 'injury', tag: 'OUT – injury/illness', detail: 'Left Ankle; Sprain' });
    expect(dnpLabel('INACTIVE_CONCUSSION_PROTOCOL', undefined, true)).toEqual({ kind: 'injury', tag: 'OUT – injury/illness' });
    expect(dnpLabel('INACTIVE_GLEAGUE_TWOWAY', 'G League - Two-Way', true)).toEqual({ kind: 'other', tag: 'G League (two-way)' });
    expect(dnpLabel('INACTIVE_PERSONAL', 'Personal', true)).toEqual({ kind: 'other', tag: 'Personal' });
    expect(dnpLabel('INACTIVE_LEAGUE_SUSPENSION', 'Not with team, league suspension', true)).toMatchObject({ kind: 'other', tag: 'Suspension' });
    expect(dnpLabel('INACTIVE_REST', 'Left Knee - Injury Management', true)).toEqual({ kind: 'other', tag: 'Rest', detail: 'Left Knee - Injury Management' });
    // No reason: no category.
    expect(dnpLabel(undefined, undefined)).toEqual({ kind: 'plain', tag: 'DNP' });
    expect(dnpLabel(undefined, undefined, true)).toEqual({ kind: 'plain', tag: 'Inactive' });
    expect(dnpText(dnpLabel('DND_INJURY', 'Left Ankle; Sprain'))).toBe('OUT – injury/illness: Left Ankle; Sprain');
  });
  it('every reason code in the data gets a label; only *_COACH is CD and only injury codes are injury', () => {
    const codes = new Set<string>();
    for (const s of ['2025-26', '2026-27'])
      for (const g of loadSeason(s)) {
        for (const p of g.players) if (p.reason) codes.add(p.reason);
        for (const p of g.inactive ?? []) if (p.reason) codes.add(p.reason);
      }
    expect(codes.size).toBeGreaterThan(10);
    for (const c of codes) {
      const l = dnpLabel(c, undefined);
      expect(l.tag.length).toBeGreaterThan(0);
      expect(l.kind === 'cd').toBe(/_COACH$/.test(c));
      expect(l.kind === 'injury').toBe(/_INJURY$|_CONCUSSION_PROTOCOL$/.test(c));
      // Other codes read as words, not raw codes.
      if (l.kind === 'other') expect(l.tag).not.toMatch(/_/);
    }
  });
});
