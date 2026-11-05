import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DIVISIONS, PICKER_ORDER, TEAMS, TEAM_BY_TRI, letterJump } from '../src/data/teams.ts';
import { TEAM_CODES } from '../src/app/teams.ts';

describe('team picker data (ported from calendarkit)', () => {
  it('30 teams, 5 per division, 15 per conference; same tricodes as the app', () => {
    expect(TEAMS).toHaveLength(30);
    for (const d of DIVISIONS) expect(TEAMS.filter((t) => t.division === d.division && t.conference === d.conference)).toHaveLength(5);
    expect(TEAMS.map((t) => t.tricode).sort()).toEqual([...TEAM_CODES].sort());
  });
  it("team ids match the NBA ids in this repo's own game data (index.json hid/aid)", () => {
    const idx = JSON.parse(readFileSync('data/2025-26/index.json', 'utf8')) as { home: string; away: string; hid: number; aid: number }[];
    const seen = new Map<string, number>();
    for (const e of idx) (seen.set(e.home, e.hid), seen.set(e.away, e.aid));
    expect(seen.size).toBe(30);
    for (const [tri, id] of seen) expect(TEAM_BY_TRI.get(tri)?.id, tri).toBe(id);
  });
  it('letter jump: next team after the active one whose city or name starts with the letter, wrapping', () => {
    const id = (tri: string) => TEAM_BY_TRI.get(tri)!.id;
    expect(letterJump(id('BOS'), 'b')!.tricode).toBe('BKN'); // Brooklyn, right after Boston
    expect(letterJump(id('BKN'), 'b')!.tricode).toBe('CHI'); // … then Chicago Bulls (by name)
    expect(letterJump(id('SAS'), 'b')!.tricode).toBe('BOS'); // wraps around
    expect(letterJump(id('BOS'), 'q')).toBeUndefined();
    expect(PICKER_ORDER[0]!.tricode).toBe('BOS');
  });
});
