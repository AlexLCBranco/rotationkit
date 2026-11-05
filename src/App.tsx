import { loadSeasons } from './app/data.ts';
import { useAsync, remember } from './app/hooks.ts';
import { useRoute, type Nav } from './app/route.ts';
import { TEAM_CODES } from './app/teams.ts';
import { TeamView } from './components/TeamView.tsx';
import { PlayerView } from './components/PlayerView.tsx';
import { GameView } from './components/GameView.tsx';
import { DeepLink } from './components/DeepLink.tsx';
import { StaleBanner } from './components/StaleBanner.tsx';

export function App() {
  return (
    <>
      <StaleBanner />
      <Screen />
    </>
  );
}

function Screen() {
  const [route, go] = useRoute();
  const seasons = useAsync(loadSeasons, []);
  if (seasons.status === 'loading') return <div className="page muted">Loading…</div>;
  if (seasons.status === 'error') return <div className="page error">Could not load data: {seasons.error}</div>;
  const list = seasons.value.map((s) => s.season).sort();
  // Deep link: <BASE_URL>/?game=<NBA gameId>
  const deepLink = new URLSearchParams(location.search).get('game');
  if (deepLink !== null) return <DeepLink id={deepLink.trim()} seasons={list} nav={go} />;
  const current = list[list.length - 1]!;
  // Default: the current season; an unknown season in the URL falls back to it.
  const season = route.season && list.includes(route.season) ? route.season : current;
  const rememberedTeam = remember('rk.team');
  const team = route.team ?? (rememberedTeam && TEAM_CODES.includes(rememberedTeam) ? rememberedTeam : TEAM_CODES[0]!);
  const nav: Nav = (r, opts) => {
    if (r.team) remember('rk.team', r.team);
    go(r, opts);
  };
  const common = { seasons: list, season, nav };
  if (route.view === 'player') return <PlayerView {...common} route={route} />;
  // Main screen. "latest" without a team → the remembered (or first) team; a game id without one → resolved in the view.
  if (route.view === 'game') return <GameView {...common} route={route.game === 'latest' ? { ...route, team } : route} rememberedTeam={rememberedTeam} />;
  return <TeamView {...common} route={{ ...route, team }} team={team} />;
}
