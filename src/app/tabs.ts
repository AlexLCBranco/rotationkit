// Where each top tab goes, keeping the team, season and (for Games ↔ Q4) the selected game.

import type { TabId } from '../components/Tabs.tsx';
import { DEFAULT_FULLQ4, DEFAULT_LEADERS, type Route } from './route.ts';
import type { Filters } from '../domain/patterns.ts';

export function tabRoute(tab: TabId, c: { team: string | null; season: string; filters: Filters; game?: string }): Route {
  if (tab === 'averages') return { view: 'team', team: c.team, season: c.season, filters: c.filters };
  if (tab === 'leaders') return { view: 'leaders', team: c.team, season: c.season, filters: c.filters, leaders: DEFAULT_LEADERS };
  if (tab === 'fullq4') return { view: 'fullq4', team: c.team, season: c.season, filters: c.filters, fullq4: DEFAULT_FULLQ4 };
  return { view: 'game', game: c.game ?? 'latest', team: c.team, season: c.season, filters: c.filters, tab: tab === 'q4' ? 'q4' : 'games' };
}
