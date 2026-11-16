// Where each top tab goes, keeping the team, season, (for Games ↔ Q4) the selected game and (for By day) the day
// the game page was opened from.

import type { TabId } from '../components/Tabs.tsx';
import { DEFAULT_DAY, DEFAULT_FULLQ4, DEFAULT_LEADERS, type Route } from './route.ts';
import type { Filters } from '../domain/patterns.ts';

export function tabRoute(tab: TabId, c: { team: string | null; season: string; filters: Filters; game?: string; day?: string | null }): Route {
  if (tab === 'day') return { view: 'day', team: c.team, season: c.season, filters: c.filters, day: { ...DEFAULT_DAY, date: c.day ?? null } };
  if (tab === 'averages') return { view: 'team', team: c.team, season: c.season, filters: c.filters };
  if (tab === 'leaders') return { view: 'leaders', team: c.team, season: c.season, filters: c.filters, leaders: DEFAULT_LEADERS };
  if (tab === 'fullq4') return { view: 'fullq4', team: c.team, season: c.season, filters: c.filters, fullq4: DEFAULT_FULLQ4 };
  return { view: 'game', game: c.game ?? 'latest', team: c.team, season: c.season, filters: c.filters, tab: tab === 'q4' ? 'q4' : 'games' };
}
