// Hover readout: lineups at the hovered moment = the lineup cursor's (exactly 5 per team), foul counts so far,
// stint at that moment; checked over every game and against raw play-by-play substitutions.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSeason, WHOLE_DATA_TIMEOUT } from './data.ts';
import { fixtureIds, loadFixtureGame, loadRawFixture } from './fixtures.ts';
import { cursorInfo, hoverReadout, lineupSegments, periodName } from '../src/domain/gameChart.ts';
import { gameLength, periodAt, periodStart } from '../src/domain/time.ts';
import { toEvents } from '../src/domain/pbp.ts';
import { DEFAULT_READOUT, loadReadout, saveReadout } from '../src/app/readoutSettings.ts';
import type { Game } from '../src/domain/types.ts';

const games: Game[] = [...loadSeason('2025-26'), ...loadSeason('2026-27')];
/** Games with data-quality notes can have 6 on court (the NBA's play-by-play missed a substitution); they are shown
 *  with their warning, so the "exactly 5" invariants skip them (same rule as tests/gameChartAll.test.ts). */
const clean = games.filter((g) => !g.quality?.length);

/** Moments to probe: every substitution clock, just before and just after it, and every 45 s. */
function moments(g: Game): number[] {
  const end = gameLength(g.periods);
  const ts = new Set<number>();
  for (const p of g.players) for (const [s, e] of p.stints) for (const x of [s, e]) for (const d of [-0.5, 0, 0.5]) if (x + d >= 0 && x + d < end) ts.add(x + d);
  for (let t = 0; t < end; t += 45) ts.add(t);
  return [...ts];
}

describe(`hover readout over all ${clean.length} games without data-quality notes`, { timeout: WHOLE_DATA_TIMEOUT }, () => {
  it('lineups = the lineup cursor, exactly 5 per team, hovered team first, "me" flag, stint iff on court, fouls so far', () => {
    const bad: string[] = [];
    let checked = 0;
    for (const g of clean) {
      const segs = { [g.home.tri]: lineupSegments(g, g.home.tri), [g.away.tri]: lineupSegments(g, g.away.tri) };
      // One player per team with minutes, rotating so many different players get probed.
      const played = g.players.filter((p) => p.played && p.stints.length);
      for (const [k, t] of moments(g).entries()) {
        const p = played[k % played.length]!;
        const r = hoverReadout(g, p.id, t, segs);
        const c = cursorInfo(g, t, segs);
        if (r.teams[0]!.team !== p.team) bad.push(`${g.id} order`);
        for (const team of r.teams) {
          const cur = c.teams.find((x) => x.team === team.team)!;
          if (team.players.length !== 5) bad.push(`${g.id} ${team.team} t=${t} n=${team.players.length}`);
          if (team.players.map((x) => x.p.id).join() !== cur.players.map((x) => x.p.id).join()) bad.push(`${g.id} ${team.team} t=${t} differs from cursor`);
          for (const x of team.players) {
            // Independent foul count: the player's fouls with time ≤ t.
            const n = (x.p.fouls ?? []).filter(([ft]) => ft <= r.t).length;
            if (x.fouls !== n) bad.push(`${g.id} ${x.p.name} fouls ${x.fouls} vs ${n} at ${t}`);
            if (x.me !== (x.p.id === p.id)) bad.push(`${g.id} me flag`);
          }
          const sc = team.team === g.home.tri ? c.score[0] : c.score[1];
          if (team.score !== sc) bad.push(`${g.id} score`);
        }
        const inLineup = r.teams[0]!.players.some((x) => x.me);
        if (inLineup !== (r.stint !== null)) bad.push(`${g.id} ${p.name} t=${t} lineup ${inLineup} stint ${r.stint}`);
        if (r.stint && !(r.stint[0] <= r.t && r.t < r.stint[1])) bad.push(`${g.id} stint does not cover t`);
        checked++;
      }
    }
    expect(bad.slice(0, 20)).toEqual([]);
    expect(checked).toBeGreaterThan(100_000);
  }, 120_000);
});

describe('hover readout vs raw play-by-play substitutions (fixtures)', () => {
  it.each(fixtureIds)('%s: after the subs at a clock the "in" players are on, the "out" players off; before it, the reverse', (id) => {
    const g = loadFixtureGame(id);
    const subs = toEvents(loadRawFixture(id).playbyplay.game.actions).filter((e) => e.a.actionType === 'substitution' && e.a.personId);
    const byClock = new Map<number, typeof subs>();
    for (const e of subs) byClock.set(e.t, [...(byClock.get(e.t) ?? []), e]);
    let checked = 0;
    for (const [t, evs] of byClock) {
      // Same-clock sequences: the player's LAST event at this clock decides; his FIRST says where he was before.
      const last = new Map<number, string>();
      const first = new Map<number, string>();
      for (const e of evs) {
        last.set(e.a.personId!, e.a.subType!);
        if (!first.has(e.a.personId!)) first.set(e.a.personId!, e.a.subType!);
      }
      const ref = g.players.find((p) => p.played && p.stints.length)!;
      const onAt = (tt: number) => new Set(hoverReadout(g, ref.id, tt).teams.flatMap((x) => x.players.map((y) => y.p.id)));
      const after = onAt(t);
      for (const [pid, sub] of last) {
        expect(after.has(pid), `${periodName(periodAt(t + 0.05))} t=${t} player ${pid} ${sub}`).toBe(sub === 'in');
        checked++;
      }
      // Just before the clock (not across a period line): "out" first → was on court; "in" first → was not.
      if (t - 0.5 > periodStart(periodAt(t + 0.05))) {
        const before = onAt(t - 0.5);
        for (const [pid, sub] of first) expect(before.has(pid), `before t=${t} player ${pid} ${sub}`).toBe(sub === 'out');
      }
    }
    expect(checked).toBeGreaterThan(30);
  });
});

describe('readout settings (localStorage)', () => {
  afterEach(() => vi.unstubAllGlobals());
  const store = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  };
  it('defaults: both lineups + stint details + fouls', () => {
    vi.stubGlobal('localStorage', store());
    expect(loadReadout()).toEqual({ lineups: 'both', stint: true, fouls: true });
    expect(DEFAULT_READOUT).toEqual({ lineups: 'both', stint: true, fouls: true });
  });
  it('saves and loads; unknown or broken values fall back to defaults', () => {
    const s = store();
    vi.stubGlobal('localStorage', s);
    saveReadout({ lineups: 'mine', stint: false, fouls: false });
    expect(loadReadout()).toEqual({ lineups: 'mine', stint: false, fouls: false });
    s.setItem('rk.readout', '{not json');
    expect(loadReadout()).toEqual(DEFAULT_READOUT);
    s.setItem('rk.readout', JSON.stringify({ lineups: 'everyone', stint: 'yes', fouls: false }));
    expect(loadReadout()).toEqual({ lineups: 'both', stint: true, fouls: false });
  });
  it('storage that throws (private mode, blocked) never breaks it', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(loadReadout()).toEqual(DEFAULT_READOUT);
    expect(() => saveReadout({ lineups: 'off', stint: true, fouls: true })).not.toThrow();
  });
});
