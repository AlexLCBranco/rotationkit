// Run the data-integrity checks over every fetched game of the season, plus the
// official-roster vs appearance-rule comparison. Writes data/validation.json.
// Reports problems only; never changes data. Usage: npm run validate-all

import { writeFileSync } from 'node:fs';
import { fetchedSeasonGames, normalizeCached } from './lib/games.ts';
import { validateGame, type Issue } from '../src/domain/validate.ts';
import { compareRosterToRule } from '../src/domain/rosterCheck.ts';
import type { Game } from '../src/domain/types.ts';

const ids = fetchedSeasonGames();
const games: Game[] = [];
const errors: { id: string; error: string }[] = [];
for (const id of ids) {
  try {
    games.push(normalizeCached(id));
  } catch (e) {
    errors.push({ id, error: (e as Error).message });
  }
}

const issues: Issue[] = games.flatMap(validateGame);
const failedGames = new Set(issues.map((i) => i.game));
console.log(`validate-all: ${ids.length} games — ${games.length - failedGames.size} passed, ${failedGames.size} failed checks, ${errors.length} failed to normalize`);
const byCheck = new Map<string, number>();
for (const i of issues) byCheck.set(i.check, (byCheck.get(i.check) ?? 0) + 1);
for (const [c, n] of byCheck) console.log(`  ${c}: ${n} issue(s)`);
for (const i of issues) console.log(`  ${i.game} [${i.check}] ${i.player ?? ''} ${i.detail}`);
for (const e of errors) console.log(`  ${e.id} [normalize] ${e.error}`);

const src = { box: 0, roster: 0, none: 0 };
for (const g of games) src[g.inactiveSource ?? 'none']++;
console.log(`\ninactive-player list source: box score (with reasons) ${src.box}, roster list ${src.roster}, none ${src.none}`);

const roster = compareRosterToRule(games);
console.log(`\nofficial roster list vs appearance rule (${roster.gamesWithRoster}/${games.length} games have a roster list):`);
console.log(`  player-games compared: ${roster.compared}`);
console.log(`  agree out: ${roster.agreeOut}, agree not-with-team: ${roster.agreeNotWith}`);
console.log(`  roster lists him, rule says not with team: ${roster.officialOnly.length}`);
console.log(`  rule says with team (out), roster does not list him: ${roster.ruleOnly.length}`);
for (const d of [...roster.officialOnly, ...roster.ruleOnly].slice(0, 10)) console.log(`    ${d.game} ${d.team} ${d.name}: official=${d.official} rule=${d.rule}`);

if (roster.officialOnly.length + roster.ruleOnly.length > 10) console.log('    … full list in data/validation.json');
writeFileSync(
  'data/validation.json',
  JSON.stringify({ at: new Date().toISOString(), games: ids.length, failed: [...failedGames], issues, errors, roster }, null, 1),
);
if (issues.length || errors.length) process.exitCode = 1;
