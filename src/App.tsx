import { loadSeasons } from './app/data.ts';
import { useAsync, remember } from './app/hooks.ts';
import { useRoute, type Route } from './app/route.ts';
import { TEAM_CODES } from './app/teams.ts';
import { TeamView } from './components/TeamView.tsx';
import { PlayerView } from './components/PlayerView.tsx';
import { GameView } from './components/GameView.tsx';

export function App() {
  const [route, go] = useRoute();
  const seasons = useAsync(loadSeasons, []);
  if (seasons.status === 'loading') return <div className="page muted">Loading…</div>;
  if (seasons.status === 'error') return <div className="page error">Could not load data: {seasons.error}</div>;
  const list = seasons.value.map((s) => s.season).sort();
  const current = list[list.length - 1]!;
  // Default: the current season; an unknown season in the URL falls back to it.
  const season = route.season && list.includes(route.season) ? route.season : current;
  const rememberedTeam = remember('rk.team');
  const team = route.team ?? (rememberedTeam && TEAM_CODES.includes(rememberedTeam) ? rememberedTeam : TEAM_CODES[0]!);
  const nav = (r: Route) => {
    if (r.team) remember('rk.team', r.team);
    go(r);
  };
  const common = { seasons: list, season, nav };
  if (route.view === 'player') return <PlayerView {...common} route={route} />;
  if (route.view === 'game') return <GameView {...common} route={route} />;
  return <TeamView {...common} route={{ ...route, team }} team={team} />;
}
