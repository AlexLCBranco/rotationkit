import { describe, expect, it } from 'vitest';
import { calendarkitUrl, hoopsjunkieUrl } from '../src/app/gameLinks.ts';
import { loadFixtureGame, loadRawFixture } from './fixtures.ts';

describe('game links', () => {
  it('hoopsjunkie: /games/<ET date>/<away>-vs-<home>, lowercase (calendarkit gameLinkUrl format)', () => {
    expect(hoopsjunkieUrl({ date: '2026-10-20', away: { tri: 'BOS' }, home: { tri: 'DET' } })).toBe('https://hoopsjunkie.io/games/2026-10-20/bos-vs-det');
  });
  it('calendarkit: league list view on the ET date with the game id', () => {
    expect(calendarkitUrl({ id: '0022600001', date: '2026-10-20' })).toBe(
      'https://gauntlet-home.vercel.app/calendar?view=league&layout=list&date=2026-10-20&game=0022600001',
    );
  });
  it('a game after midnight UTC keeps its ET date (PHX @ POR, 10 pm ET Oct 21 = 02:00 UTC Oct 22)', () => {
    const raw = loadRawFixture('0022600092').boxscore.game as unknown as { gameEt: string; gameTimeUTC: string };
    expect(raw.gameTimeUTC.slice(0, 10)).toBe('2026-10-22'); // the UTC date is the next day…
    const g = loadFixtureGame('0022600092'); // …but the normalized game date is the ET date
    expect(g.date).toBe('2026-10-21');
    expect(hoopsjunkieUrl(g)).toBe('https://hoopsjunkie.io/games/2026-10-21/phx-vs-por');
    expect(calendarkitUrl(g)).toBe('https://gauntlet-home.vercel.app/calendar?view=league&layout=list&date=2026-10-21&game=0022600092');
  });
});
