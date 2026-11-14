import { useEffect, useMemo, useRef, useState } from 'react';
import { loadGame, loadIndex, loadSchedule } from '../app/data.ts';
import { useAsync } from '../app/hooks.ts';
import { formatMin, shortDate, signed } from '../app/labels.ts';
import { parse, type Nav, type Route } from '../app/route.ts';
import { teamName } from '../app/teams.ts';
import { scheduleTags, type ScheduleTags } from '../domain/scheduleTags.ts';
import { GameList, UPCOMING_GAMES, type ListGame, type UpcomingGame } from './GameList.tsx';
import { TEAM_BY_TRI } from '../data/teams.ts';
import { ScheduleChips } from './ScheduleChips.tsx';
import { Tabs } from './Tabs.tsx';
import { tabRoute } from '../app/tabs.ts';
import { Q4View } from './Q4View.tsx';
import { GameLinks } from './GameLinks.tsx';
import { TeamPicker } from './TeamPicker.tsx';
import { ReadoutMenu } from './ReadoutMenu.tsx';
import { loadReadout, saveReadout } from '../app/readoutSettings.ts';
import { seasonOf } from '../domain/season.ts';
import { REG_PERIODS } from '../domain/time.ts';
import type { Game, QualityNote } from '../domain/types.ts';
import { GameBadge } from './GameBadge.tsx';
import { GameChart, totalPlayed, type Cursor } from './GameChart.tsx';
import { CursorPanel, LineupList, QuarterTable, segmentsByTeam, useGameNames } from './GamePanels.tsx';
import { Header } from './Header.tsx';
import { TeamLogo } from './Headshot.tsx';
import { remember } from '../app/hooks.ts';
import { PlayerLink, TeamLink } from './Links.tsx';

interface Props {
  seasons: string[];
  season: string;
  route: Extract<Route, { view: 'game' }>;
  nav: Nav;
  rememberedTeam?: string | null;
}

/** Plain-words line for a data-quality note, using the game's own numbers (the player's name links to his page). */
function qualityLine(g: Game, q: QualityNote): React.ReactNode {
  const p = g.players.find((x) => q.player === `${x.name} (${x.team})`);
  const verdict = q.verdict === 'box-score' ? `The box score looks wrong (${q.why}).` : `Unresolved (${q.why}).`;
  const who = (rest: string) =>
    p ? (
      <>
        <PlayerLink id={p.id} team={p.team} season={seasonOf(g.id)}>
          {p.name}
        </PlayerLink>
        {rest}
      </>
    ) : (
      `${q.player ?? 'Game'}${rest}`
    );
  if (p && q.check === 'minutes') return who(` — minutes: play-by-play ${formatMin(totalPlayed(p))} vs box score ${formatMin(p.min)}. ${verdict}`);
  if (p && q.check === 'plus-minus') {
    const pbp = p.stints.reduce((s, st) => s + st[2], 0);
    return who(` — +/-: play-by-play ${signed(pbp)} vs box score ${signed(p.pm)}. ${verdict}`);
  }
  return who(` — ${q.check}: ${q.detail}. ${verdict}`);
}

const plays = (e: { home: string; away: string }, t: string) => e.home === t || e.away === t;

export function GameView({ seasons, season, route, nav, rememberedTeam }: Props) {
  const gameSeason = route.game === 'latest' ? season : seasonOf(route.game);
  const tab = route.tab ?? 'games';
  const meta = useAsync(() => Promise.all([loadIndex(gameSeason), loadSchedule(gameSeason).catch(() => null)]), [gameSeason]);
  // `latest` = the team's most recent finished game in the season.
  const id =
    route.game !== 'latest'
      ? route.game
      : meta.status === 'ok'
        ? ([...meta.value[0]].reverse().find((e) => !route.team || plays(e, route.team))?.id ?? null)
        : undefined;
  const loaded = useAsync(() => (id ? loadGame(seasonOf(id), id) : Promise.reject(new Error('none'))), [id]);
  // While the next game loads, keep showing the previous one (no blank flash when stepping through games).
  const last = useRef<Game | null>(null);
  if (loaded.status === 'ok') last.current = loaded.value;
  const g = loaded.status === 'ok' ? loaded.value : loaded.status === 'loading' && id !== null ? last.current : null;
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const [trouble, setTrouble] = useState(() => remember('rk.trouble') !== '0');
  useEffect(() => void remember('rk.trouble', trouble ? '1' : '0'), [trouble]);
  useEffect(() => setCursor(null), [g?.id]);

  // Whose games the list shows: the URL's team if it played, else the remembered team if it played, else home.
  const fresh = loaded.status === 'ok' ? loaded.value : null;
  const team = fresh
    ? [route.team, rememberedTeam, fresh.home.tri].find((t): t is string => !!t && (fresh.home.tri === t || fresh.away.tri === t))!
    : (route.team ?? rememberedTeam ?? null);
  // URL always names the team and the actual game (so "latest" becomes bookmarkable).
  useEffect(() => {
    if (fresh && (route.game !== fresh.id || route.team !== team || route.season !== gameSeason)) {
      // Skip if the user navigated since this render (e.g. picked another team): never overwrite their choice.
      const live = parse(location.hash);
      if (live.view !== 'game' || live.game !== route.game || (live.team && live.team !== route.team)) return;
      nav({ ...route, game: fresh.id, team, season: gameSeason }, { replace: true });
    }
  }, [fresh, team, gameSeason, route, nav]);

  const picker = useMemo(() => {
    if (meta.status !== 'ok' || !team) return null;
    const [index, schedule] = meta.value;
    const sched = schedule ?? index;
    const ours = scheduleTags(sched, team);
    const games: ListGame[] = index
      .filter((e) => plays(e, team))
      .map((e) => {
        const home = e.home === team;
        return {
          id: e.id,
          date: e.date,
          team,
          teamId: home ? e.hid : e.aid,
          opp: home ? e.away : e.home,
          oppId: home ? e.aid : e.hid,
          home,
          us: home ? e.hs : e.as,
          them: home ? e.as : e.hs,
          flagged: !!e.flagged,
          tags: ours.get(e.id),
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)); // oldest first
    // The next few games on the schedule (not played yet): shown under the list, not openable.
    const played = new Set(index.map((e) => e.id));
    const upcoming: UpcomingGame[] = (schedule ?? [])
      .filter((e) => plays(e, team) && e.status !== 'final' && !played.has(e.id) && !e.id.startsWith('001') && !e.id.startsWith('003'))
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
      .slice(0, UPCOMING_GAMES)
      .map((e) => {
        const home = e.home === team;
        const opp = home ? e.away : e.home;
        return { id: e.id, date: e.date, team, teamId: TEAM_BY_TRI.get(team)?.id ?? 0, opp, oppId: TEAM_BY_TRI.get(opp)?.id ?? 0, home, status: e.status, label: e.label, tags: ours.get(e.id) };
      });
    return { games, sched, ours, upcoming };
  }, [meta, team]);
  // The game being opened (not the one still on screen while it loads), so quick ↑/↓ or ◀ ▶ never skip or repeat.
  const current = id ?? g?.id ?? null;
  const pos = picker && current ? picker.games.findIndex((x) => x.id === current) : -1;
  const older = picker && pos > 0 ? picker.games[pos - 1] : undefined;
  const newer = picker && pos >= 0 ? picker.games[pos + 1] : undefined;
  const open = (id: string) => nav({ ...route, game: id, team, season: gameSeason });
  const pickTeam = (t: string) => nav({ ...route, game: 'latest', team: t, season: gameSeason });
  const pickSeason = (x: string) => nav({ ...route, game: 'latest', team, season: x });
  const [collapsed, setCollapsed] = useState(() => remember('rk.list') === 'collapsed');
  useEffect(() => void remember('rk.list', collapsed ? 'collapsed' : 'open'), [collapsed]);
  const seasonSelect = (
    <label className="field">
      <span>Season</span>
      <select value={gameSeason} aria-label="Season" onChange={(e) => pickSeason(e.target.value)}>
        {[...seasons].reverse().map((x) => (
          <option key={x} value={x}>
            {x}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className={`page main-screen${tab === 'q4' ? ' q4-page' : ''}`}>
      <Header>
        <Tabs active={tab} go={(x) => nav(tabRoute(x, { team: team ?? null, season: gameSeason, filters: route.filters, game: current ?? route.game }))} />
        <TeamPicker team={team} onChange={pickTeam} />
      </Header>
      <div className={`gv-layout${collapsed ? ' collapsed' : ''}`}>
        {!collapsed && picker && (
          <GameList
            games={picker.games}
            upcoming={picker.upcoming}
            selected={current}
            onSelect={open}
            seasons={seasons}
            season={gameSeason}
            onSeason={pickSeason}
            onCollapse={() => setCollapsed(true)}
          />
        )}
        <div className="gv-main">
          <div className="game-nav">
            {collapsed && (
              <>
                <button className="gl-expand" onClick={() => setCollapsed(false)} title="Show the game list" data-testid="list-expand">
                  ☰ Games
                </button>
                {seasonSelect}
              </>
            )}
            {picker && (
              <>
                <button className="gp-arrow" disabled={!older} onClick={() => older && open(older.id)} title="Previous (older) game" data-testid="prev-game">
                  ◀
                </button>
                <button className="gp-arrow" disabled={!newer} onClick={() => newer && open(newer.id)} title="Next (newer) game" data-testid="next-game">
                  ▶
                </button>
                {pos >= 0 && (
                  <span className="muted" data-testid="game-count">
                    Game {pos + 1} of {picker.games.length} · {gameSeason}
                  </span>
                )}
              </>
            )}
          </div>
          {!g && (meta.status === 'loading' || loaded.status === 'loading') && id !== null && <p className="muted">Loading…</p>}
          {id === null && (
            <p className="muted" data-testid="no-games">
              No {route.team ? teamName(route.team) : ''} games in {gameSeason} yet.
            </p>
          )}
          {meta.status === 'error' && <p className="error">Could not load games: {meta.error}</p>}
          {loaded.status === 'error' && id && <p className="error">Could not load game: {loaded.error}</p>}
          {g && picker && team && (g.home.tri === team || g.away.tri === team) && (
            <GameHeader g={g} team={team} ours={picker.ours.get(g.id)} theirs={scheduleTags(picker.sched, g.home.tri === team ? g.away.tri : g.home.tri).get(g.id)} />
          )}
          {g && tab === 'games' && <GameBody g={g} trouble={trouble} setTrouble={setTrouble} cursor={cursor} setCursor={setCursor} />}
          {g && tab === 'q4' && (
            <>
              <QualityWarning g={g} />
              <Q4View g={g} trouble={trouble} setTrouble={setTrouble} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function GameHeader({ g, team, ours, theirs }: { g: Game; team: string; ours: ScheduleTags | undefined; theirs: ScheduleTags | undefined }) {
  const opp = g.home.tri === team ? g.away.tri : g.home.tri;
  return (
    <div className="game-head">
      <h1 className="title game-title">
        <TeamLogo teamId={g.away.id} tri={g.away.tri} />
        <TeamLink team={g.away.tri} season={seasonOf(g.id)} title={teamName(g.away.tri)}>
          {g.away.tri}
        </TeamLink>{' '}
        {g.away.score} <span className="muted">@</span>{' '}
        <TeamLink team={g.home.tri} season={seasonOf(g.id)} title={teamName(g.home.tri)}>
          {g.home.tri}
        </TeamLink>{' '}
        {g.home.score}
        <TeamLogo teamId={g.home.id} tri={g.home.tri} />
        <span className="muted">
          · {shortDate(g.date)} {g.date.slice(0, 4)}
          {g.periods > REG_PERIODS ? ` · Final/${g.periods === 5 ? 'OT' : `${g.periods - REG_PERIODS}OT`}` : ' · Final'}
        </span>
        <GameBadge g={g} />
        <GameLinks g={g} />
      </h1>
      <div className="head-tags">
        {[
          [team, ours],
          [opp, theirs],
        ].map(([t, tags]) => (
          <span key={t as string} className="head-team-tags" data-testid="header-tags" data-team={t as string}>
            <strong>
              <TeamLink team={t as string} season={seasonOf(g.id)}>
                {t as string}
              </TeamLink>
            </strong>
            <ScheduleChips tags={tags as ScheduleTags | undefined} />
          </span>
        ))}
      </div>
    </div>
  );
}

function GameBody({
  g,
  trouble,
  setTrouble,
  cursor,
  setCursor,
}: {
  g: Game;
  trouble: boolean;
  setTrouble: (b: boolean) => void;
  cursor: Cursor | null;
  setCursor: (c: Cursor | null) => void;
}) {
  const segments = useMemo(() => segmentsByTeam(g), [g]);
  const names = useGameNames(g);
  const [readout, setReadout] = useState(loadReadout);
  return (
    <>
      <QualityWarning g={g} />
      <div className="gc-controls">
        <label className="toggle">
          <input type="checkbox" checked={trouble} onChange={(e) => setTrouble(e.target.checked)} />
          <span>Foul trouble colors</span>
        </label>
        <ReadoutMenu
          value={readout}
          onChange={(r) => {
            setReadout(r);
            saveReadout(r);
          }}
        />
        <span className="muted">Hover a row for both lineups at that moment; click to pin the lineup cursor.</span>
      </div>
      {cursor?.pinned && (
        <div className="gc-sticky-panel">
          <CursorPanel g={g} cursor={cursor} segments={segments} names={names} onClose={() => setCursor(null)} />
        </div>
      )}
      <GameChart g={g} trouble={trouble} cursor={cursor} setCursor={setCursor} names={names} segments={segments} readout={readout} />
      {[g.away, g.home].map((t) => (
        <section key={t.tri} className="team-extras">
          <h2>
            <TeamLink team={t.tri} season={seasonOf(g.id)}>
              {t.tri}
            </TeamLink>
            : minutes & fouls by quarter
          </h2>
          <QuarterTable g={g} team={t.tri} />
          <LineupList g={g} team={t.tri} segs={segments[t.tri]!} names={names} onPick={(time) => setCursor({ t: time, pinned: true })} />
        </section>
      ))}
    </>
  );
}

/** "⚠ Data note" box for a game with data-quality notes (Games and Q4 tabs). */
function QualityWarning({ g }: { g: Game }) {
  if (!g.quality) return null;
  return (
    <div className="warn box" data-testid="quality-warning">
      <strong>⚠ Data note.</strong> Stints and minutes below come from play-by-play and are used in patterns. The box score disagrees for:
      <ul>
        {g.quality.map((q, i) => (
          <li key={i}>{qualityLine(g, q)}</li>
        ))}
      </ul>
    </div>
  );
}
