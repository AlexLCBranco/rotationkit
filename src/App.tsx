import { loadSeasons } from './app/data.ts';
import { useAsync, remember } from './app/hooks.ts';
import { DEFAULT_DAY, here, isStart, useRoute, type Nav } from './app/route.ts';
import { TEAM_CODES } from './app/teams.ts';
import { seasonOf } from './domain/season.ts';
import { TeamView } from './components/TeamView.tsx';
import { PlayerView } from './components/PlayerView.tsx';
import { GameView } from './components/GameView.tsx';
import { DeepLink } from './components/DeepLink.tsx';
import { PlayerByName } from './components/PlayerByName.tsx';
import { StaleBanner } from './components/StaleBanner.tsx';
import { LeadersView } from './components/LeadersView.tsx';
import { FullQ4View } from './components/FullQ4View.tsx';
import { DayView } from './components/DayView.tsx';
import { LinkCtx } from './components/Links.tsx';
import { TapTips } from './components/TapTips.tsx';
import { Header } from './components/Header.tsx';
import { HelpView } from './components/HelpView.tsx';
import { Footer } from './components/Footer.tsx';
import { useEffect } from 'react';

export function App() {
  return (
    <>
      <StaleBanner />
      <Screen />
      <TapTips />
    </>
  );
}

function Screen() {
  const [route, go] = useRoute();
  const seasons = useAsync(loadSeasons, []);
  const list = seasons.status === 'ok' ? seasons.value.map((s) => s.season).sort() : [];
  const current = list[list.length - 1] ?? '';
  // Default: the current season; an unknown season in the URL falls back to it.
  const season = route.season && list.includes(route.season) ? route.season : current;
  const remembered = remember('rk.team');
  const rememberedTeam = remembered && TEAM_CODES.includes(remembered) ? remembered : null;
  const team = route.team ?? rememberedTeam ?? TEAM_CODES[0]!;
  // RK-9, first visit: an empty URL and no remembered team → By day on the latest day with finished games.
  const firstVisit = !rememberedTeam && isStart(here());
  useEffect(() => {
    if (firstVisit) go({ view: 'day', team: null, season: null, filters: route.filters, day: DEFAULT_DAY }, { replace: true });
  }, [firstVisit]); // eslint-disable-line react-hooks/exhaustive-deps
  const nav: Nav = (r, opts) => {
    // The team is remembered when the visitor goes somewhere with one, not when the app only tidies the URL
    // (a first-time visitor who has picked no team stays one: RK-9).
    if (r.team && !opts?.replace) remember('rk.team', r.team);
    go(r, opts);
  };
  // Player / team links and Go anywhere keep the current season and filters (src/app/links.ts).
  const links = { seasons: list, season: route.view === 'game' && route.game !== 'latest' ? seasonOf(route.game) : season, filters: route.filters, team: route.team ?? team };
  // RK-8: one pinned header for every page (NAV_PATTERN.md); the page under it.
  return (
    <LinkCtx.Provider value={links}>
      <Header route={route} seasons={list} season={season} rememberedTeam={rememberedTeam} nav={nav} />
      {page()}
      <Footer />
    </LinkCtx.Provider>
  );
  function page() {
    if (seasons.status === 'loading') return <div className="page muted">Loading…</div>;
    if (seasons.status === 'error') return <div className="page error">Could not load data: {seasons.error}</div>;
    // Deep link: <BASE_URL>/?game=<NBA gameId>
    const deepLink = new URLSearchParams(location.search).get('game');
    if (deepLink !== null) return <DeepLink id={deepLink.trim()} seasons={list} nav={go} />;
    if (firstVisit) return <div className="page muted">Loading…</div>;
    return view();
  }
  function view() {
    const common = { seasons: list, season, nav };
    if (route.view === 'player') return <PlayerView {...common} route={route} />;
    if (route.view === 'playerName') return <PlayerByName {...common} route={route} />;
    // Main screen. "latest" without a team → the remembered (or first) team; a game id without one → resolved in the view.
    if (route.view === 'game') return <GameView {...common} route={route.game === 'latest' ? { ...route, team } : route} rememberedTeam={remembered} />;
    if (route.view === 'leaders') return <LeadersView {...common} route={route} team={team} />;
    if (route.view === 'day') return <DayView {...common} route={route} team={team} />;
    if (route.view === 'help') return <HelpView route={route} season={current} />;
    if (route.view === 'fullq4') return <FullQ4View {...common} route={route} team={team} />;
    return <TeamView {...common} route={{ ...route, team }} team={team} />;
  }
}
