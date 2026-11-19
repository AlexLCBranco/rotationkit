// Plain-words descriptions of a selection and of not-playing reasons.

import type { Selection } from '../domain/patterns.ts';
import { REST_WORDS } from '../domain/rest.ts';
import { formatDuration } from '../domain/time.ts';

export function describeSelection(sel: Selection, names: Map<number, string>): string {
  const venue = sel.filters.venue === 'all' ? '' : `${sel.filters.venue} `;
  const rest = sel.filters.rest ? ` ${REST_WORDS[sel.filters.rest]}` : '';
  const base = (sel.filters.window === 'season' ? `All ${sel.season} ${venue}games` : `Last ${sel.filters.window} ${venue}games`) + rest;
  const ww = sel.filters.withWithout;
  if (!ww) return base;
  return `${base} ${ww.mode} ${names.get(ww.player) ?? sel.withWithout?.name ?? 'player'}`;
}

export const basedOn = (n: number) => `based on ${n} game${n === 1 ? '' : 's'}`;

const REASONS: Record<string, string> = {
  INACTIVE_INJURY: 'Injury',
  DND_INJURY: 'Injury',
  DNP_INJURY: 'Injury',
  INACTIVE_GLEAGUE_TWOWAY: 'G League (two-way)',
  INACTIVE_GLEAGUE_ON_ASSIGNMENT: 'G League assignment',
  INACTIVE_PERSONAL: 'Personal',
  INACTIVE_NOT_WITH_TEAM: 'Not with team',
  NWT_NOT_WITH_TEAM: 'Not with team',
  INACTIVE_REST: 'Rest',
  INACTIVE_COACH: "Coach's decision",
  DNP_COACH: "Coach's decision",
  INACTIVE_CONCUSSION_PROTOCOL: 'Concussion protocol',
  INACTIVE_LEAGUE_SUSPENSION: 'Suspension',
  INACTIVE_TRADE: 'Trade',
  NWT_PERSONAL: 'Personal',
  DND_PERSONAL: 'Personal',
  DND_REST: 'Rest',
  DNP_REST: 'Rest',
  DND_LEAGUE_SUSPENSION: 'Suspension',
  DNP_LEAGUE_SUSPENSION: 'Suspension',
  NWT_LEAGUE_SUSPENSION: 'Suspension (not with team)',
  NWT_TEAM_SUSPENSION: 'Team suspension (not with team)',
};

export function reasonText(reason?: string, detail?: string): string | undefined {
  if (!reason && !detail) return undefined;
  const r = reason ? (REASONS[reason] ?? reason.replace(/^(INACTIVE|DND|DNP|NWT)_/, '').replace(/_/g, ' ').toLowerCase()) : undefined;
  return [r, detail].filter(Boolean).join(' — ');
}

export const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');

/** Minutes/durations as m:ss, truncated like NBA box scores. */
export const formatMin = (sec: number) => formatDuration(sec);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const shortDate = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;

/** Hover text of every USG% column. */
export const USG_TITLE =
  'Usage rate: share of his team\'s plays he finishes while on court, 100 × (FGA + 0.44×FTA + TOV) × (team MIN / 5) / (MIN × team (FGA + 0.44×FTA + TOV)). Whole games (box score); over several games weighted by minutes.';
