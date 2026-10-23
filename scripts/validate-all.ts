// Run the data-integrity checks over every fetched game, compare Path B stints with gamerotation where
// it was fetched, and compare the official roster list with the appearance rule.
// Writes data/<season>/validation.json. Reports problems only; never changes data.
// Usage: npm run validate-all -- [--season 2025-26]

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fetchedSeasonGames, loadRaw, seasonsFromArgs } from './lib/games.ts';
import { normalizeGame } from '../src/domain/normalize.ts';
import { validateGame, type Issue } from '../src/domain/validate.ts';
import { compareRosterToRule } from '../src/domain/rosterCheck.ts';
import { compareStints, type StintDiff } from '../src/domain/compareStints.ts';
import type { Game } from '../src/domain/types.ts';

let bad = false;
for (const season of seasonsFromArgs()) {
  const ids = fetchedSeasonGames(season);
  const games: Game[] = [];
  const errors: { id: string; error: string }[] = [];
  const rotation = { compared: 0, matched: 0, unavailable: 0, diffs: [] as ({ game: string } & StintDiff)[] };
  for (const id of ids) {
    try {
      const raw = loadRaw(id);
      const g = normalizeGame(raw);
      games.push(g);
      if (!raw.gamerotation) rotation.unavailable++;
      else {
        const d = compareStints(g, raw.gamerotation);
        rotation.compared++;
        if (!d.length) rotation.matched++;
        rotation.diffs.push(...d.map((x) => ({ game: id, ...x })));
      }
    } catch (e) {
      errors.push({ id, error: (e as Error).message });
    }
  }

  const issues: Issue[] = games.flatMap(validateGame);
  const failedGames = new Set(issues.map((i) => i.game));
  console.log(`\n=== ${season} ===`);
  console.log(`validate-all: ${ids.length} games — ${games.length - failedGames.size} passed, ${failedGames.size} failed checks, ${errors.length} failed to normalize`);
  const byCheck = new Map<string, number>();
  for (const i of issues) byCheck.set(i.check, (byCheck.get(i.check) ?? 0) + 1);
  for (const [c, n] of byCheck) console.log(`  ${c}: ${n} issue(s)`);
  for (const i of issues.slice(0, 40)) console.log(`  ${i.game} [${i.check}] ${i.player ?? ''} ${i.detail}`);
  if (issues.length > 40) console.log(`  … ${issues.length - 40} more in data/${season}/validation.json`);
  for (const e of errors) console.log(`  ${e.id} [normalize] ${e.error}`);

  const notes = games.filter((g) => g.stintNotes?.length);
  console.log(`\nstint reconstruction notes: ${notes.length} game(s)`);
  for (const g of notes.slice(0, 20)) for (const n of g.stintNotes!) console.log(`  ${g.id} ${n}`);

  console.log(`\ngamerotation cross-check: ${rotation.compared} compared, ${rotation.matched} exact match, ${rotation.compared - rotation.matched} differ, ${rotation.unavailable} without gamerotation`);
  for (const d of rotation.diffs.slice(0, 20)) console.log(`  ${d.game} ${d.player}: pbp ${JSON.stringify(d.pbp)} vs rotation ${JSON.stringify(d.rotation)}`);

  const src = { box: 0, roster: 0, none: 0 };
  for (const g of games) src[g.inactiveSource ?? 'none']++;
  console.log(`\ninactive-player list source: box score (with reasons) ${src.box}, roster list ${src.roster}, none ${src.none}`);

  const roster = compareRosterToRule(games);
  console.log(`official inactive list vs appearance rule (${roster.gamesWithRoster}/${games.length} games have an official list):`);
  console.log(`  player-games compared: ${roster.compared}; agree out: ${roster.agreeOut}, agree not-with-team: ${roster.agreeNotWith}`);
  console.log(`  official lists him, rule says not with team: ${roster.officialOnly.length}; rule says out, official does not list him: ${roster.ruleOnly.length}`);

  writeFileSync(
    join('data', season, 'validation.json'),
    JSON.stringify({ at: new Date().toISOString(), season, games: ids.length, failed: [...failedGames], issues, errors, stintNotes: notes.map((g) => ({ game: g.id, notes: g.stintNotes })), rotation, roster }),
  );
  if (issues.length || errors.length) bad = true;
}
if (bad) process.exitCode = 1;
