// Compare the official per-game roster list (inactive players) against the appearance rule.

import { buildAppearances, withTeamByRule } from './availability.ts';
import type { Game } from './types.ts';

export interface RosterDiff {
  game: string;
  team: string;
  name: string;
  official: 'out' | 'not-listed';
  rule: 'out' | 'not-with-team';
  reason?: string;
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
  const byTeam = new Map<string, { agreeOut: number; agreeNotWith: number; officialOnly: number; ruleOnly: number }>();
  const bump = (team: string, k: 'agreeOut' | 'agreeNotWith' | 'officialOnly' | 'ruleOnly') => {
    if (!byTeam.has(team)) byTeam.set(team, { agreeOut: 0, agreeNotWith: 0, officialOnly: 0, ruleOnly: 0 });
    byTeam.get(team)![k]++;
  };
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
        if (off && rule) {
          agreeOut++;
          bump(team, 'agreeOut');
        } else if (!off && !rule) {
          agreeNotWith++;
          bump(team, 'agreeNotWith');
        } else if (off) {
          const x = g.inactive!.find((i) => i.id === pid && i.team === team)!;
          officialOnly.push({ ...d, official: 'out', rule: 'not-with-team', ...(x.reason ? { reason: x.reason } : {}) });
          bump(team, 'officialOnly');
        } else {
          ruleOnly.push({ ...d, official: 'not-listed', rule: 'out' });
          bump(team, 'ruleOnly');
        }
      }
    }
  }
  return { gamesWithRoster: withRoster.length, compared, agreeOut, agreeNotWith, officialOnly, ruleOnly, byTeam: Object.fromEntries(byTeam) };
}
