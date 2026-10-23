import { useEffect, useMemo, useRef, useState } from 'react';
import { loadGame, loadIndex, loadSchedule } from '../app/data.ts';
import { useAsync } from '../app/hooks.ts';
import { formatMin, shortDate, signed } from '../app/labels.ts';
import type { Nav, Route } from '../app/route.ts';
import { TEAM_CODES, teamColor, teamName } from '../app/teams.ts';
import { scheduleTags, type ScheduleTags } from '../domain/scheduleTags.ts';
import { GamePicker, type PickerGame } from './GamePicker.tsx';
import { ScheduleChips } from './ScheduleChips.tsx';
import { Tabs } from './Tabs.tsx';
import { seasonOf } from '../domain/season.ts';
import { REG_PERIODS } from '../domain/time.ts';
import type { Game, QualityNote } from '../domain/types.ts';
import { GameBadge } from './GameBadge.tsx';
import { GameChart, totalPlayed, type Cursor } from './GameChart.tsx';
import { CursorPanel, LineupList, QuarterTable, segmentsByTeam, useGameNames } from './GamePanels.tsx';
import { Header } from './Header.tsx';
import { TeamLogo } from './Headshot.tsx';
import { remember } from '../app/hooks.ts';

interface Props {
  seasons: string[];
  season: string;
  route: Extract<Route, { view: 'game' }>;
  nav: Nav;
  rememberedTeam?: string | null;
}

/** Plain-words line for a data-quality note, using the game's own numbers. */
function qualityLine(g: Game, q: QualityNote): string {
  const p = g.players.find((x) => q.player === `${x.name} (${x.team})`);
  const verdict = q.verdict === 'box-score' ? `The box score looks wrong (${q.why}).` : `Unresolved (${q.why}).`;
  if (p && q.check === 'minutes') return `${p.name} — minutes: play-by-play ${formatMin(totalPlayed(p))} vs box score ${formatMin(p.min)}. ${verdict}`;
  if (p && q.check === 'plus-minus') {
    const pbp = p.stints.reduce((s, st) => s + st[2], 0);
    return `${p.name} — +/-: play-by-play ${signed(pbp)} vs box score ${signed(p.pm)}. ${verdict}`;
  }
  return `${q.player ?? 'Game'} — ${q.check}: ${q.detail}. ${verdict}`;
}

const plays = (e: { home: string; away: string }, t: string) => e.home === t || e.away === t;

export function GameView({ seasons, season, route, nav, rememberedTeam }: Props) {
  const gameSeason = route.game === 'latest' ? season : seasonOf(route.game);
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

  // Whose games the picker lists: the URL's team if it played, else the remembered team if it played, else home.
  const fresh = loaded.status === 'ok' ? loaded.value : null;
  const team = fresh
    ? [route.team, rememberedTeam, fresh.home.tri].find((t): t is string => !!t && (fresh.home.tri === t || fresh.away.tri === t))!
    : (route.team ?? rememberedTeam ?? null);
  // URL always names the team and the actual game (so "latest" becomes bookmarkable).
  useEffect(() => {
    if (fresh && (route.game !== fresh.id || route.team !== team || route.season !== gameSeason)) {
      nav({ ...route, game: fresh.id, team, season: gameSeason }, { replace: true });
    }
  }, [fresh, team, gameSeason, route, nav]);

  const picker = useMemo(() => {
    if (meta.status !== 'ok' || !team) return null;
    const [index, schedule] = meta.value;
    const sched = schedule ?? index;
    const ours = scheduleTags(sched, team);
    const games: PickerGame[] = index
      .filter((e) => plays(e, team))
      .map((e) => {
        const home = e.home === team;
        return {
          id: e.id,
          date: e.date,
          opp: home ? e.away : e.home,
          oppId: home ? e.aid : e.hid,
          home,
          us: home ? e.hs : e.as,
          them: home ? e.as : e.hs,
          flagged: !!e.flagged,
          tags: ours.get(e.id),
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
    return { games, sched, ours };
  }, [meta, team]);
  const pos = picker && g ? picker.games.findIndex((x) => x.id === g.id) : -1;
  const older = picker && pos >= 0 ? picker.games[pos + 1] : undefined;
  const newer = picker && pos > 0 ? picker.games[pos - 1] : undefined;
  const open = (id: string) => nav({ ...route, game: id, team, season: gameSeason });
  const pickTeam = (t: string) => nav({ ...route, game: 'latest', team: t, season: gameSeason });

  return (
    <div className="page wide">
      <Header>
        <Tabs
          active="games"
          onGames={() => undefined}
          onAverages={() => nav({ view: 'team', team: team ?? null, season: gameSeason, filters: route.filters })}
        />
        <label className="field team-pick">
          <span className="swatch" style={{ background: teamColor(team ?? '') }} />
          <select value={team ?? ''} aria-label="Team" onChange={(e) => pickTeam(e.target.value)}>
            {!team && <option value="">Team…</option>}
            {TEAM_CODES.map((t) => (
              <option key={t} value={t}>
                {teamName(t)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Season</span>
          <select value={gameSeason} aria-label="Season" onChange={(e) => nav({ ...route, game: 'latest', team, season: e.target.value })}>
            {[...seasons].reverse().map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </Header>
      {picker && (
        <div className="game-nav">
          <button className="gp-arrow" disabled={!older} onClick={() => older && open(older.id)} title="Previous (older) game" data-testid="prev-game">
            ◀
          </button>
          <GamePicker games={picker.games} selected={g?.id ?? null} onSelect={open} />
          <button className="gp-arrow" disabled={!newer} onClick={() => newer && open(newer.id)} title="Next (newer) game" data-testid="next-game">
            ▶
          </button>
          <span className="muted">
            Game {picker.games.length - pos} of {picker.games.length} · {gameSeason}
          </span>
        </div>
      )}
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
      {g && <GameBody g={g} trouble={trouble} setTrouble={setTrouble} cursor={cursor} setCursor={setCursor} />}
    </div>
  );
}

function GameHeader({ g, team, ours, theirs }: { g: Game; team: string; ours: ScheduleTags | undefined; theirs: ScheduleTags | undefined }) {
  const opp = g.home.tri === team ? g.away.tri : g.home.tri;
  return (
    <div className="game-head">
      <h1 className="title game-title">
        <TeamLogo teamId={g.away.id} tri={g.away.tri} />
        {g.away.tri} {g.away.score} <span className="muted">@</span> {g.home.tri} {g.home.score}
        <TeamLogo teamId={g.home.id} tri={g.home.tri} />
        <span className="muted">
          · {shortDate(g.date)} {g.date.slice(0, 4)}
          {g.periods > REG_PERIODS ? ` · Final/${g.periods === 5 ? 'OT' : `${g.periods - REG_PERIODS}OT`}` : ' · Final'}
        </span>
        <GameBadge g={g} />
      </h1>
      <div className="head-tags">
        {[
          [team, ours],
          [opp, theirs],
        ].map(([t, tags]) => (
          <span key={t as string} className="head-team-tags" data-testid="header-tags" data-team={t as string}>
            <strong>{t as string}</strong>
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
  return (
    <>
      {g.quality && (
        <div className="warn box" data-testid="quality-warning">
          <strong>⚠ Data note.</strong> Stints and minutes below come from play-by-play and are used in patterns. The box score disagrees for:
          <ul>
            {g.quality.map((q, i) => (
              <li key={i}>{qualityLine(g, q)}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="gc-controls">
        <label className="toggle">
          <input type="checkbox" checked={trouble} onChange={(e) => setTrouble(e.target.checked)} />
          <span>Foul trouble colors</span>
        </label>
        <span className="muted">Hover the chart for details; click (tap on phone) to pin the lineup cursor.</span>
      </div>
      {cursor?.pinned && (
        <div className="gc-sticky-panel">
          <CursorPanel g={g} cursor={cursor} segments={segments} names={names} onClose={() => setCursor(null)} />
        </div>
      )}
      <GameChart g={g} trouble={trouble} cursor={cursor} setCursor={setCursor} />
      {[g.away, g.home].map((t) => (
        <section key={t.tri} className="team-extras">
          <h2>{t.tri}: minutes & fouls by quarter</h2>
          <QuarterTable g={g} team={t.tri} />
          <LineupList g={g} team={t.tri} segs={segments[t.tri]!} names={names} onPick={(time) => setCursor({ t: time, pinned: true })} />
        </section>
      ))}
    </>
  );
}
