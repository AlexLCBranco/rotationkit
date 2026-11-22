// RK-9: "How to read this" — every rule sentence comes from its setting in code, and the "?" links name real sections.

import { describe, expect, it } from 'vitest';
import { foulRules, fullQ4Rule, garbageRule, HELP_SECTIONS, helpHref, insideLabelRule, isHelpSection, usualRule } from '../src/app/help.ts';
import { parse } from '../src/app/route.ts';
import { CHART, FOUL_TROUBLE, PATTERN_CONFIG, USUAL } from '../src/domain/config.ts';
import { pageTitle } from '../src/app/title.ts';

describe('rule sentences are generated from the settings', () => {
  it('garbage time: today 4th quarter / OT, under 6:00, 20+', () => {
    expect(garbageRule()).toEqual(['It is the 4th quarter or overtime.', 'Less than 6:00 is left in that quarter (or overtime).', 'One team is ahead by 20 points or more.']);
    expect(garbageRule().join(' ')).toContain(String(PATTERN_CONFIG.blowout.margin));
  });
  it('garbage time follows a changed setting', () => {
    expect(garbageRule({ margin: 25, underSecondsLeft: 270, fromPeriod: 4 } as unknown as typeof PATTERN_CONFIG.blowout)).toEqual([
      'It is the 4th quarter or overtime.',
      'Less than 4:30 is left in that quarter (or overtime).',
      'One team is ahead by 25 points or more.',
    ]);
  });
  it('foul colors: one line per quarter with that quarter\'s numbers', () => {
    const lines = foulRules();
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe(`1st quarter: yellow at ${FOUL_TROUBLE['1'].caution} fouls, red at ${FOUL_TROUBLE['1'].trouble} fouls or more.`);
    expect(lines[3]).toBe(`4th quarter and overtime: yellow at ${FOUL_TROUBLE['4'].caution} fouls, red at ${FOUL_TROUBLE['4'].trouble} fouls or more.`);
    expect(foulRules({ ...FOUL_TROUBLE, '2': { caution: null, trouble: 9 } })[1]).toBe('2nd quarter: red at 9 fouls or more.');
  });
  it('Usual, Full Q4 and the number inside a bar', () => {
    expect(usualRule()[0]).toContain(`${USUAL.games} games`);
    expect(usualRule()[2]).toContain(`fewer than ${USUAL.minGames}`);
    expect(usualRule({ games: 7, minGames: 2 } as unknown as typeof USUAL)[0]).toContain('7 games');
    expect(fullQ4Rule().full).toBe('He was on the court for all 12:00 of the 4th quarter.');
    expect(fullQ4Rule().almost).toContain('11:00');
    expect(insideLabelRule()).toContain(`${CHART.insideLabelMinSeconds / 60}:00`);
  });
});

describe('sections and "?" links', () => {
  it('the ten terms of the spec, each once', () => {
    const ids = HELP_SECTIONS.map(([id]) => id);
    expect(ids).toEqual(['bar', 'numbers', 'fouls', 'garbage', 'usual', 'fullq4', 'dnp', 'schedule', 'usg', 'datanote']);
    expect(new Set(ids).size).toBe(ids.length);
    expect(isHelpSection('garbage')).toBe(true);
    expect(isHelpSection('nope')).toBe(false);
    expect(isHelpSection(null)).toBe(false);
  });
  it('a "?" link opens the page at its section; the link round-trips through the router', () => {
    for (const [id] of HELP_SECTIONS) {
      const r = parse(helpHref(id));
      expect(r).toMatchObject({ view: 'help', section: id });
    }
    expect(parse(helpHref())).toMatchObject({ view: 'help', section: null });
  });
  it('the tab title of the page', () => {
    expect(pageTitle(parse(helpHref('usg')), { season: '2026-27' })).toBe('How to read this');
  });
});
