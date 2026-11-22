// "How to read this" (RK-9): the page's sections and every rule sentence. Each rule is written FROM its setting in
// code (never retyped), so the page can't drift from what the app does. Pure, unit-tested (tests/help.test.ts).

import { CHART, FOUL_TROUBLE, PATTERN_CONFIG, USUAL } from '../domain/config.ts';
import { FULL_Q4_SECONDS } from '../domain/fullQ4.ts';
import { formatDuration } from '../domain/time.ts';
import { DEFAULT_FILTERS } from '../domain/patterns.ts';
import { format } from './route.ts';

export type HelpSection = 'bar' | 'numbers' | 'fouls' | 'garbage' | 'usual' | 'fullq4' | 'dnp' | 'schedule' | 'usg' | 'datanote';

/** Sections in page order: id, heading, and what the small "?" next to the term says on hover. */
export const HELP_SECTIONS: [HelpSection, string, string][] = [
  ['bar', 'A bar on the chart', 'What is a bar?'],
  ['numbers', 'The numbers on a bar', 'What do the numbers on a bar mean?'],
  ['fouls', 'Foul marks and foul colors', 'What do the foul marks and colors mean?'],
  ['garbage', 'Garbage time', 'What is garbage time?'],
  ['usual', '"Usual"', 'What does "Usual" show?'],
  ['fullq4', '"Full Q4"', 'What is a full Q4?'],
  ['dnp', 'DNP and OUT labels', 'What do DNP and OUT mean?'],
  ['schedule', 'Schedule tags: B2B, 3-in-4, rest days', 'What do B2B, 3in4 and rest days mean?'],
  ['usg', 'USG%', 'What is USG%?'],
  ['datanote', '⚠ Data note', 'What is a data note?'],
];

export const isHelpSection = (s: string | null): s is HelpSection => HELP_SECTIONS.some(([id]) => id === s);

/** Where a "?" link goes: the page, opened at that section. */
export const helpHref = (section?: HelpSection) => format({ view: 'help', team: null, season: null, filters: DEFAULT_FILTERS, section: section ?? null });

const clock = (sec: number) => formatDuration(sec);
const ORDINAL = ['1st', '2nd', '3rd', '4th'];

/** The garbage-time rule, one condition per line (from PATTERN_CONFIG.blowout). */
export function garbageRule(b = PATTERN_CONFIG.blowout): string[] {
  const from = b.fromPeriod === 4 ? 'It is the 4th quarter or overtime.' : `It is quarter ${b.fromPeriod} or later, or overtime.`;
  return [from, `Less than ${clock(b.underSecondsLeft)} is left in that quarter (or overtime).`, `One team is ahead by ${b.margin} points or more.`];
}

/** Foul colors, one line per quarter (from FOUL_TROUBLE; the 4th quarter's line also covers overtime). */
export function foulRules(cfg = FOUL_TROUBLE): string[] {
  return (['1', '2', '3', '4'] as const).map((q) => {
    const { caution, trouble } = cfg[q];
    const where = q === '4' ? '4th quarter and overtime' : `${ORDINAL[Number(q) - 1]} quarter`;
    return `${where}: ${caution === null ? '' : `yellow at ${caution} fouls, `}red at ${trouble} fouls or more.`;
  });
}

/** "Usual" in numbers (from USUAL; the "half of them" part is typicalStints' own rule). */
export const usualRule = (u = USUAL) =>
  [`We look at his team's ${u.games} games before this one, in the same season.`, 'The outline covers the moments when he was on the court in at least half of them.', `No outline if he played in fewer than ${u.minGames} of those games.`];

/** Full Q4 in numbers (from FULL_Q4_SECONDS). */
export const fullQ4Rule = (s = FULL_Q4_SECONDS) => ({
  full: `He was on the court for all ${clock(s.full)} of the 4th quarter.`,
  almost: `The "${clock(s['11'])}+" switch also counts games where he played ${clock(s['11'])} or more of it.`,
});

/** When a bar's minutes are written inside it (from CHART.insideLabelMinSeconds). */
export const insideLabelRule = (c = CHART) => `A bar of ${clock(c.insideLabelMinSeconds)} or longer has its number inside. A shorter bar has it right next to it.`;
