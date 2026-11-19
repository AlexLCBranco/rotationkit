// By day tab (#/games?view=day&date=YYYY-MM-DD): one card per game of the day (tip-time order) with both
// teams' closers, full-Q4 marks and coach's-decision DNPs; beside them the day's Q4 minutes leaders.
// Clicking a team's half of a card opens that game with that team first and the day as context (prev / next game).

import { useCallback, useMemo } from 'react';
import { loadGame, loadIndex, loadQuarters, loadSchedule } from '../app/data.ts';
import { useAsync } from '../app/hooks.ts';
import { formatMin, shortDate } from '../app/labels.ts';
import { format, type DayQuery, type Nav, type Route } from '../app/route.ts';
import { tabRoute } from '../app/tabs.ts';
import { teamColor } from '../app/teams.ts';
import { TEAM_BY_TRI } from '../data/teams.ts';
import { scheduleTags } from '../domain/scheduleTags.ts';
import { cardSide, dayQ4Leaders, slateDates, slateDay, tipLabel, type SlateGame } from '../domain/slate.ts';
import { REG_PERIODS } from '../domain/time.ts';
import type { Game } from '../domain/types.ts';
import { DateBar, NoBlowoutsToggle } from './DateBar.tsx';
import { BroadcastTags } from './GameBadge.tsx';
import { Header } from './Header.tsx';
import { Headshot, TeamLogo } from './Headshot.tsx';
import { PlayerLink, TeamLink } from './Links.tsx';
import { ScheduleChips } from './ScheduleChips.tsx';
import { Tabs } from './Tabs.tsx';
import { TeamPicker } from './TeamPicker.tsx';

interface Props {
  seasons: string[];
  season: string;
  team: string;
  route: Extract<Route, { view: 'day' }>;
  nav: Nav;
}

/** Game page link from By day: that team first, the day kept for previous / next game and the back link. */
export const dayGameRoute = (id: string, team: string, season: string, date: string, filters: Route['filters']): Route => ({ view: 'game', game: id, team, season, filters, day: date });

export function DayView({ seasons, season, team, route, nav }: Props) {
  const q = route.day;
  const meta = useAsync(() => Promise.all([loadIndex(season), loadSchedule(season).catch(() => null), loadQuarters(season)]), [season]);
  const set = useCallback((patch: Partial<DayQuery>, s?: string) => nav({ ...route, season: s ?? season, day: { ...q, ...patch } }), [nav, route, season, q]);

  const c = useMemo(() => {
    if (meta.status !== 'ok') return null;
    const [index, schedule, quarters] = meta.value;
    const { dates, latestFinished } = slateDates(index, schedule);
    const date = q.date && dates.includes(q.date) ? q.date : (latestFinished ?? dates[dates.length - 1] ?? null);
    const games = date ? slateDay(index, schedule, date) : [];
    const sched = schedule ?? index;
    const tags = new Map<string, ReturnType<typeof scheduleTags>>();
    const tagsOf = (t: string, id: string) => (tags.get(t) ?? tags.set(t, scheduleTags(sched, t)).get(t)!).get(id);
    return { dates, date, games, tagsOf, leaders: date ? dayQ4Leaders(quarters, date, q.noBlowouts) : [] };
  }, [meta, q.date, q.noBlowouts]);

  const finishedIds = c ? c.games.filter((g) => g.finished).map((g) => g.id) : [];
  const files = useAsync(async () => new Map((await Promise.all(finishedIds.map((id) => loadGame(season, id)))).map((g) => [g.id, g])), [season, finishedIds]);
  const onDate = useCallback((d: string) => set({ date: d }), [set]);
  const open = (id: string, t: string) => c?.date && nav(dayGameRoute(id, t, season, c.date, route.filters));
  const gameHref = (id: string, t: string) => (c?.date ? format(dayGameRoute(id, t, season, c.date, route.filters)) : '#');

  return (
    <div className="page wide">
      <Header>
        <Tabs active="day" go={(x) => nav(tabRoute(x, { team, season, filters: route.filters }))} />
        <TeamPicker team={team} onChange={(t) => nav({ view: 'game', game: 'latest', team: t, season, filters: route.filters })} />
      </Header>
      <div className="filters dv-filters">
        <label className="field">
          <span>Season</span>
          <select value={season} aria-label="Season" onChange={(e) => set({ date: null }, e.target.value)}>
            {[...seasons].reverse().map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        {c && <DateBar dates={c.dates} date={c.date} asked={q.date} onDate={onDate} arrowKeys testPrefix="dv" />}
      </div>
      {meta.status === 'loading' && <p className="muted">Loading…</p>}
      {meta.status === 'error' && <p className="error">Could not load: {meta.error}</p>}
      {c && (
        <div className="dv-layout">
          <section className="dv-cards" aria-label="Games of the day">
            {c.games.length === 0 && <p className="muted">No games.</p>}
            {c.games.map((sg) => (
              <GameCard key={sg.id} sg={sg} g={files.status === 'ok' ? files.value.get(sg.id) : undefined} tagsOf={c.tagsOf} open={open} />
            ))}
          </section>
          <section className="dv-leaders" aria-label="Q4 minutes leaders of the day">
            <h2>
              Q4 minutes leaders <span className="muted">· {c.date ? `${shortDate(c.date)} ${c.date.slice(0, 4)}` : ''}</span>
            </h2>
            <div className="dv-leaders-opts">
              <NoBlowoutsToggle checked={q.noBlowouts} onChange={(b) => set({ noBlowouts: b })} label="No blowouts" />
            </div>
            <p className="muted ld-note">Regulation 4th quarter only (overtime never counts), all of the day's finished games; ties at 10th all shown.</p>
            {c.leaders.length === 0 ? (
              <p className="muted" data-testid="dv-leaders-empty">
                No finished games.
              </p>
            ) : (
              <div className="table-wrap">
              <table className="tbl" data-testid="dv-leaders">
                <thead>
                  <tr>
                    <th className="num">#</th>
                    <th className="name-col">Player</th>
                    <th>Team</th>
                    <th className="num">Q4 MIN</th>
                    <th>Game</th>
                  </tr>
                </thead>
                <tbody>
                  {c.leaders.map((r) => {
                    const sg = c.games.find((x) => x.id === r.game);
                    return (
                      <tr key={`${r.game}-${r.id}`} data-testid="dv-leader" data-player={r.id} data-game={r.game} data-rank={r.rank} data-q4={r.q4}>
                        <td className="num muted">{r.rank}</td>
                        <td className="ld-player">
                          <Headshot id={r.id} name={r.name} />
                          <PlayerLink id={r.id} team={r.team} season={season} className="ld-name">
                            {r.name}
                          </PlayerLink>
                        </td>
                        <td>
                          <span className="swatch" style={{ background: teamColor(r.team) }} /> <TeamLink team={r.team} season={season}>{r.team}</TeamLink>
                        </td>
                        <td className="num">
                          <strong>{formatMin(r.q4)}</strong>
                        </td>
                        <td>
                          <a className="link" href={gameHref(r.game, r.team)} data-testid="dv-leader-game">
                            {sg ? `${sg.away} @ ${sg.home}` : r.game}
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function GameCard({ sg, g, tagsOf, open }: { sg: SlateGame; g: Game | undefined; tagsOf: (t: string, id: string) => ReturnType<typeof scheduleTags> extends Map<string, infer V> ? V | undefined : never; open: (id: string, t: string) => void }) {
  const e = sg.entry;
  const extra = e && e.periods > REG_PERIODS ? (e.periods === 5 ? 'OT' : `${e.periods - REG_PERIODS}OT`) : null;
  const side = (where: 'away' | 'home') => {
    const tri = sg[where];
    const teamId = e ? (where === 'home' ? e.hid : e.aid) : (TEAM_BY_TRI.get(tri)?.id ?? 0);
    const score = e ? (where === 'home' ? e.hs : e.as) : undefined;
    const won = e ? (where === 'home' ? e.hs > e.as : e.as > e.hs) : false;
    const s = g ? cardSide(g, tri) : null;
    const go = () => sg.finished && open(sg.id, tri);
    return (
      <div
        className={`dv-side${sg.finished ? ' clickable' : ''}`}
        data-testid="dv-side"
        data-team={tri}
        data-side={where}
        {...(sg.finished
          ? {
              role: 'link',
              tabIndex: 0,
              title: `Open this game with ${tri} first`,
              onClick: go,
              onKeyDown: (ev: React.KeyboardEvent) => {
                if (ev.key === 'Enter') go();
              },
            }
          : {})}
      >
        <div className="dv-team-head">
          <TeamLogo teamId={teamId} tri={tri} />
          <TeamLink team={tri}>{tri}</TeamLink>
          <span className={`ha-tag ${where}`}>{where === 'home' ? 'HOME' : 'AWAY'}</span>
          {score !== undefined && (
            <span className={`dv-score${won ? ' won' : ''}`} data-testid="dv-score">
              {score}
            </span>
          )}
        </div>
        <div className="dv-chips">
          <ScheduleChips tags={tagsOf(tri, sg.id)} rest={false} />
        </div>
        {s && (
          <>
            <ul className="dv-closers" data-testid="dv-closers">
              {s.closers.map((p) => (
                <li key={p.id} className="fq-player" data-testid="dv-closer" data-player={p.id} data-full={p.fullQ4 ? '1' : '0'}>
                  <Headshot id={p.id} name={p.name} />
                  <PlayerLink id={p.id} team={tri} className="fq-name">
                    {p.name}
                  </PlayerLink>
                  {p.fullQ4 && (
                    <span className="fq-mark" title="Played the whole regulation 4th quarter (12:00)" data-testid="dv-fullq4">
                      Q4
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {s.cd.length > 0 && (
              <div className="dv-cd" data-testid="dv-cd">
                {s.cd.map((p, i) => (
                  <span key={p.id} data-testid="dv-cd-player" data-player={p.id} title={p.detail}>
                    {i > 0 && ', '}
                    <PlayerLink id={p.id} team={tri}>
                      {p.name}
                    </PlayerLink>{' '}
                    <span className="dnp-tag cd">{p.tag}</span>
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    );
  };
  return (
    <article className={`dv-game${sg.finished ? '' : ' upcoming'}`} data-testid="dv-game" data-game={sg.id} data-finished={sg.finished ? '1' : '0'}>
      <header>
        <span className="dv-tip" data-testid="dv-tip">
          {sg.finished ? (sg.tip ? tipLabel(sg.tip) : 'Final') : tipLabel(sg.tip)}
        </span>
        {sg.finished && <span className="muted"> · Final{extra ? `/${extra}` : ''}</span>}
        {!sg.finished && sg.status === 'final' && <span className="muted"> · Final, rotation data not added yet</span>}
        {e?.flagged && (
          <span className="muted" title="This game has a data note (open it for details)">
            {' '}
            · ⚠
          </span>
        )}
        <BroadcastTags tv={sg.tv} cup={sg.cup} />
      </header>
      <div className="dv-sides">
        {side('away')}
        <span className="dv-at muted">@</span>
        {side('home')}
      </div>
      {sg.finished && <p className="muted dv-legend">On court at the end of regulation{extra ? ' (before OT)' : ''}</p>}
    </article>
  );
}
