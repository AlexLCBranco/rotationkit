// Compare the official per-game roster list (inactive players) against the appearance rule.

import { buildAppearances, withTeamByRule } from './availability.ts';
import type { Game } from './types.ts';

export interface RosterDiff {
  game: string;
  team: string;
  name: string;
  official: 'out' | 'not-listed';
  rule: 'out' | 'not-with-team';
}

export function compareRosterToRule(games: Game[]) {
  const idx = buildAppearances(games);
  const names = new Map<number, string>();
  for (const g of games) for (const p of g.players) names.set(p.id, p.name);
  let compared = 0;
  let agreeOut = 0;
  let agreeNotWith = 0;
  const officialOnly: RosterDiff[] = [];
  const ruleOnly: RosterDiff[] = [];
  const withRoster = games.filter((g) => g.inactive);
  for (const g of withRoster) {
    for (const team of [g.home.tri, g.away.tri]) {
      const inBox = new Set(g.players.filter((p) => p.team === team).map((p) => p.id));
      const listed = new Set(g.inactive!.filter((x) => x.team === team).map((x) => x.id));
      for (const x of g.inactive!) names.set(x.id, x.name);
      // Candidates: everyone who ever appeared for this team, plus anyone officially listed.
      const candidates = new Set<number>(listed);
      for (const [pid, apps] of idx) if (apps.some((a) => a.team === team)) candidates.add(pid);
      for (const pid of candidates) {
        if (inBox.has(pid)) continue;
        compared++;
        const rule = withTeamByRule(idx.get(pid), g, team);
        const off = listed.has(pid);
        const d = { game: g.id, team, name: names.get(pid) ?? String(pid) };
        if (off && rule) agreeOut++;
        else if (!off && !rule) agreeNotWith++;
        else if (off) officialOnly.push({ ...d, official: 'out', rule: 'not-with-team' });
        else ruleOnly.push({ ...d, official: 'not-listed', rule: 'out' });
      }
    }
  }
  return { gamesWithRoster: withRoster.length, compared, agreeOut, agreeNotWith, officialOnly, ruleOnly };
}
