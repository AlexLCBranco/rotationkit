// "How to read this" (RK-9): one page that explains, in plain words, everything the charts and tables show. Each
// part has a small real example (the latest game in the data, drawn with the app's own components) and each rule
// sentence is written from its setting in code (src/app/help.ts). `?sec=<id>` opens the page at that part.

import { useEffect, useMemo } from 'react';
import { loadGame, loadIndex } from '../app/data.ts';
import { dnpLabel } from '../app/dnp.ts';
import { foulRules, fullQ4Rule, garbageRule, HELP_SECTIONS, insideLabelRule, isHelpSection, usualRule, type HelpSection } from '../app/help.ts';
import { useAsync } from '../app/hooks.ts';
import { formatMin, shortDate } from '../app/labels.ts';
import type { Route } from '../app/route.ts';
import { SITE_NAME, SITE_TAGLINE } from '../app/site.ts';
import { gameBadge } from '../domain/gameChart.ts';
import { gameLength } from '../domain/time.ts';
import { formatUsg, gameUsage, playsOf } from '../domain/usage.ts';
import type { Game, PlayerGame } from '../domain/types.ts';
import { Headshot } from './Headshot.tsx';
import { PlayerLink } from './Links.tsx';
import { ScheduleLegend } from './ScheduleChips.tsx';
import { StintBars } from './Stints.tsx';

/** The example: from the latest game, the player with the most minutes among those with 2+ stints. */
export function examplePlayer(g: Game): PlayerGame | null {
  const played = g.players.filter((p) => p.played && p.stints.length >= 2);
  return [...played].sort((a, b) => b.min - a.min)[0] ?? null;
}

const DNP_EXAMPLES: [string | undefined, boolean, string][] = [
  ['DNP_COACH', false, 'He could have played. The coach chose not to use him. CD means "coach\'s decision".'],
  ['INACTIVE_INJURY', false, 'He was hurt or sick, so he could not play.'],
  ['INACTIVE_REST', false, 'Another reason, in its own words. Here: the team rested him.'],
  [undefined, false, 'He did not play, and the NBA gave no reason. DNP means "did not play".'],
  [undefined, true, 'He was not on the list of players for this game, and the NBA gave no reason.'],
];

export function HelpView({ route, season }: { route: Extract<Route, { view: 'help' }>; season: string }) {
  const section = isHelpSection(route.section) ? route.section : null;
  const ex = useAsync(async () => {
    if (!season) return null;
    const last = (await loadIndex(season)).at(-1);
    return last ? loadGame(season, last.id) : null;
  }, [season]);
  const g = ex.status === 'ok' ? ex.value : null;
  const p = useMemo(() => (g ? examplePlayer(g) : null), [g]);
  // Open at the asked part (again once the example has loaded and moved things).
  useEffect(() => {
    if (section) document.getElementById(`help-${section}`)?.scrollIntoView({ block: 'start' });
    else scrollTo(0, 0);
  }, [section, g]);

  const who = g && p ? (
    <>
      <PlayerLink id={p.id} team={p.team}>
        {p.name}
      </PlayerLink>{' '}
      ({p.team}), {g.away.tri} @ {g.home.tri}, {shortDate(g.date)}
    </>
  ) : null;
  const first = p?.stints[0];
  const usg = g && p ? gameUsage(g, p) : null;
  const garbage = g ? gameBadge(g).garbage : 0;
  const fq = fullQ4Rule();
  const h = (id: HelpSection) => HELP_SECTIONS.find(([s]) => s === id)![1];
  const part = (id: HelpSection, body: React.ReactNode) => (
    <section className={`help-part${section === id ? ' on' : ''}`} id={`help-${id}`} data-testid="help-section" data-section={id}>
      <h2>{h(id)}</h2>
      {body}
    </section>
  );
  return (
    <div className="page help-page" data-testid="help-page">
      <h1 className="title">How to read this</h1>
      <p className="help-lead">
        {SITE_NAME} shows {SITE_TAGLINE.charAt(0).toLowerCase() + SITE_TAGLINE.slice(1)} This page explains every bar, color, tag and number you will see.
      </p>
      <nav className="help-toc" aria-label="On this page" data-testid="help-toc">
        {HELP_SECTIONS.map(([id, title]) => (
          <a key={id} href={`#help-${id}`} onClick={(e) => (e.preventDefault(), document.getElementById(`help-${id}`)?.scrollIntoView({ block: 'start' }))}>
            {title}
          </a>
        ))}
      </nav>

      {part(
        'bar',
        <>
          <p>Each player has one line. Time runs from left to right, from the start of the game to the end.</p>
          <p>A bar is one stretch of time when he was on the court. It starts when he comes in. It ends when he goes to the bench.</p>
          <p>No bar means he was sitting. People call one bar a "stint".</p>
          {g && p && (
            <div className="help-example" data-testid="help-example-bar">
              <div className="help-example-who">
                <Headshot id={p.id} name={p.name} /> <span>Real example: {who}</span>
              </div>
              <StintBars stints={p.stints} total={gameLength(g.periods)} periods={g.periods} labels />
              <p className="muted">
                He was on the court {p.stints.length} times. That is {p.stints.length} bars. In total he played {formatMin(p.min)} (minutes:seconds).
              </p>
            </div>
          )}
        </>,
      )}

      {part(
        'numbers',
        <>
          <p>The number on a bar says how long he stayed on the court that time.</p>
          <p>It is written as minutes:seconds. So 6:30 means 6 minutes and 30 seconds.</p>
          {first && (
            <p data-testid="help-example-numbers">
              Real example: the first bar above says {formatMin(first[1] - first[0])}. He played {formatMin(first[1] - first[0])} before his first rest.
            </p>
          )}
          <p>{insideLabelRule()}</p>
          <p>If you turn on "Points on the bars", a bar can say "12:00 · 8p". That means 12 minutes on the court and 8 points scored in that time.</p>
        </>,
      )}

      {part(
        'fouls',
        <>
          <p>A small numbered mark on a bar is one foul by that player. The number says which foul it was: 1 is his first, 2 is his second.</p>
          <p>A player with too many fouls early may have to sit. The bar's color shows how close he is:</p>
          <p className="help-legend">
            <span>
              <i className="lvl-ok" /> Green: no trouble
            </span>
            <span>
              <i className="lvl-caution" /> Yellow: be careful
            </span>
            <span>
              <i className="lvl-trouble" /> Red: foul trouble
            </span>
          </p>
          <ul data-testid="help-foul-rules">
            {foulRules().map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          {g && p && (
            <p className="muted">
              Real example: {p.name} had {p.pf} foul{p.pf === 1 ? '' : 's'} in that game.
            </p>
          )}
        </>,
      )}

      {part(
        'garbage',
        <>
          <p>Sometimes a game is already decided before it ends. Coaches then rest their best players. That part of the game is called garbage time.</p>
          <p>We call it garbage time when all three of these are true:</p>
          <ol data-testid="help-garbage-rule">
            {garbageRule().map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ol>
          <p>On the chart, garbage time is shaded. Averages leave those minutes out, so they show how a team plays when the game still matters. You can switch that off.</p>
          <p>
            A game with garbage time has this tag: <span className="badge garbage">Garbage time 4:12</span> It means 4 minutes and 12 seconds of garbage time.
          </p>
          {g && (
            <p className="muted" data-testid="help-example-garbage">
              Real example: {g.away.tri} @ {g.home.tri} on {shortDate(g.date)} had {garbage > 0 ? `${formatMin(garbage)} of garbage time` : 'no garbage time'}.
            </p>
          )}
        </>,
      )}

      {part(
        'usual',
        <>
          <p>"Usual" draws a faint dashed outline behind a player's bars. The outline shows when he is usually on the court.</p>
          <p>A bar inside the outline: he played when he usually does. A bar outside it, or an empty outline: something changed in this game.</p>
          <ul data-testid="help-usual-rule">
            {usualRule().map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </>,
      )}

      {part(
        'fullq4',
        <>
          <p>
            Q4 is the 4th quarter, the last 12 minutes of a normal game. <span className="fq-mark">Q4</span> next to a player means a full Q4:
          </p>
          <p data-testid="help-fullq4-rule">{fq.full} He never sat down in it.</p>
          <p>{fq.almost}</p>
          <p>Overtime does not count. With "No blowouts" on, games with garbage time in the 4th quarter are left out.</p>
        </>,
      )}

      {part(
        'dnp',
        <>
          <p>These labels say why a player has no bars in a game. We only repeat the reason the NBA gave. We never guess.</p>
          <ul className="help-tags" data-testid="help-dnp">
            {DNP_EXAMPLES.map(([code, inactive, words]) => {
              const l = dnpLabel(code, undefined, inactive);
              return (
                <li key={l.tag}>
                  <span className={`dnp-tag ${l.kind}`}>{l.tag}</span> <span>{words}</span>
                </li>
              );
            })}
          </ul>
          <p>Sometimes more words follow the label, like "Left Ankle; Sprain". That is the NBA's own note.</p>
        </>,
      )}

      {part(
        'schedule',
        <>
          <p>These small tags say how tired a team may be for a game.</p>
          <ScheduleLegend />
          <ul>
            <li>B2B means "back-to-back": two games on two days in a row. B2B 1 is the first night. B2B 2 is the second night.</li>
            <li>"3in4" means 3 games in 4 days. "3in4 · 2nd" means tonight is the 2nd of those 3 games. Longer runs join up, like "4in6".</li>
            <li>"1d" means 1 day of rest before this game. "0d" means the team also played yesterday. "2d+" means 2 days or more.</li>
          </ul>
          <p>Point at a "3in4" tag (or tap it) to see the run day by day.</p>
        </>,
      )}

      {part(
        'usg',
        <>
          <p>USG% is short for "usage rate". It says how much of his team's attack ends with him while he is on the court.</p>
          <p>An attack ends with him when he shoots, shoots free throws, or loses the ball.</p>
          <p>Five players share the attack. So 20% is a fair share. 30% or more means the team plays through him.</p>
          {g && p && usg !== null && (
            <p data-testid="help-example-usg">
              Real example: {who}. He took {p.fga ?? 0} shots, {p.fta ?? 0} free throws and lost the ball {p.tov ?? 0} time{(p.tov ?? 0) === 1 ? '' : 's'}. That counts as {playsOf(p).toFixed(1)} plays. His USG% was {formatUsg(usg)}.
            </p>
          )}
          <p className="muted">
            For the curious: plays = shots + 0.44 × free throws + lost balls. USG% = 100 × his plays ÷ his team's plays while he was on the court. Over many games, games with more minutes count more.
          </p>
        </>,
      )}

      {part(
        'datanote',
        <>
          <p>The NBA publishes two records of every game. One is the box score: a table of totals. The other is the play-by-play: a list of everything that happened, in order.</p>
          <p>We build the bars from the play-by-play. Then we check that each player's minutes match the box score.</p>
          <p>"⚠ Data note" means the two did not match for someone in that game. The note names the player. His bars may be a little off. Everything else in the game is fine.</p>
          <p>We never change the data to hide a mismatch.</p>
        </>,
      )}
    </div>
  );
}
