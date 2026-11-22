// RK-6: the player's team on the player page — team name (→ its page) and every roster player (→ his page, filters
// kept); the current player highlighted. Desktop: a narrow column left of the page. Phone: a "Roster" toggle.

import { useState } from "react";
import { loadSeasonAppearances, loadTeamGames } from "../app/data.ts";
import { useAsync } from "../app/hooks.ts";
import { formatMin } from "../app/labels.ts";
import { usePhone } from "../app/phone.ts";
import { teamName } from "../app/teams.ts";
import { TEAM_BY_TRI } from "../data/teams.ts";
import { rosterTeams, teamRoster } from "../domain/roster.ts";
import { TeamLogo } from "./Headshot.tsx";
import { PlayerLink, TeamLink } from "./Links.tsx";
import { inSet } from "../domain/gameSet.ts";

export function RosterPanel({
  season,
  team: routeTeam,
  player,
}: {
  season: string;
  team: string;
  player: number;
}) {
  const phone = usePhone();
  const [open, setOpen] = useState(false);
  const data = useAsync(async () => {
    const idx = await loadSeasonAppearances(season);
    const { team, others } = rosterTeams(idx, player, routeTeam);
    // RK-13: minutes per game over the regular season only, as before postseason games existed in the data.
    const games = (await loadTeamGames(season, team)).filter((g) => inSet(g.id));
    return { team, others, roster: teamRoster(games, team, idx) };
  }, [season, player, routeTeam]);
  const shown = !phone || open;
  const team = data.status === "ok" ? data.value.team : routeTeam;
  return (
    <aside
      className={`pl-roster${phone ? " phone" : ""}`}
      data-testid="roster"
      data-team={team}
    >
      {phone && (
        <button
          type="button"
          className="pl-roster-toggle"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          data-testid="roster-toggle"
        >
          {open ? "▾" : "▸"} Roster · {team}
        </button>
      )}
      {shown && (
        <div className="pl-roster-body" data-testid="roster-body">
          <h2 className="pl-roster-team">
            <TeamLogo teamId={TEAM_BY_TRI.get(team)?.id ?? 0} tri={team} />
            <TeamLink
              team={team}
              season={season}
              title={`${teamName(team)} rotations`}
            >
              {teamName(team)}
            </TeamLink>
          </h2>
          {data.status === "ok" && data.value.others.length > 0 && (
            <p className="pl-roster-others muted" data-testid="roster-others">
              Also this season:{" "}
              {data.value.others.map((t, i) => (
                <span key={t}>
                  {i > 0 && ", "}
                  <TeamLink team={t} season={season} title={teamName(t)}>
                    {t}
                  </TeamLink>
                </span>
              ))}
            </p>
          )}
          {data.status === "loading" && <p className="muted">Loading…</p>}
          {data.status === "error" && (
            <p className="error">Could not load the roster.</p>
          )}
          {data.status === "ok" && (
            <ol className="pl-roster-list">
              {data.value.roster.map((p) => (
                <li
                  key={p.id}
                  aria-current={p.id === player ? "true" : undefined}
                  data-testid="roster-player"
                  data-player={p.id}
                >
                  <PlayerLink
                    id={p.id}
                    team={team}
                    season={season}
                    title={p.fullName}
                  >
                    {p.name}
                  </PlayerLink>
                  <span className="muted pl-roster-min">
                    {p.gp ? formatMin(p.min / p.gp) : "—"}
                  </span>
                </li>
              ))}
            </ol>
          )}
          {data.status === "ok" && (
            <p className="pl-roster-note muted">Minutes per game this season</p>
          )}
        </div>
      )}
    </aside>
  );
}
