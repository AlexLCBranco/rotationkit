// Run the data-integrity checks over every game in data/ (re-normalized from raw where the raw cache has it,
// otherwise the committed normalized file), compare Path B stints with gamerotation where it was fetched, and
// compare the official roster list with the appearance rule.
// Writes data/<season>/validation.json. Reports problems only; never changes data.
// Exit code 1 only if a game fails to normalize (it could not be shown at all).
// A game that fails a check is still committed and shown: normalize writes its quality notes and the UI shows a
// warning on it. One bad NBA box score must never stop every other game from loading (it blocked all updates
// from 2026-10-24 to 2026-11-04). New failures are listed in the log so they can be added to known-issues.json.
// Usage: npm run validate-all -- [--season 2025-26]

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadRaw } from './lib/games.ts';
import { isFetched } from './lib/cache.ts';
import { dataSeasons, readDataGame, readIndex, readKnownIssues, unexpectedFailures } from './lib/data.ts';
import { normalizeGame } from '../src/domain/normalize.ts';
import { validateGame, type Issue } from '../src/domain/validate.ts';
import { compareRosterToRule } from '../src/domain/rosterCheck.ts';
import { compareStints, type StintDiff } from '../src/domain/compareStints.ts';
import type { Game } from '../src/domain/types.ts';

const known = readKnownIssues();
const argSeason = (() => {
  const i = process.argv.indexOf('--season');
  return i >= 0 ? process.argv[i + 1] : undefined;
})();
let bad = false;
for (const season of argSeason ? [argSeason] : dataSeasons()) {
  const ids = readIndex(season).map((e) => e.id);
  const games: Game[] = [];
  const errors: { id: string; error: string }[] = [];
  const rotation = { compared: 0, matched: 0, unavailable: 0, diffs: [] as ({ game: string } & StintDiff)[] };
  const rotationVerdict = new Map<string, string>();
  for (const id of ids) {
    try {
      if (!isFetched(id)) {
        // No raw cache (e.g. CI runner): validate the committed normalized game.
        games.push(readDataGame(season, id));
        rotation.unavailable++;
        continue;
      }
      const raw = loadRaw(id);
      const g = normalizeGame(raw);
      games.push(g);
      if (!raw.gamerotation) rotation.unavailable++;
      else {
        const d = compareStints(g, raw.gamerotation);
        rotationVerdict.set(id, d.length ? `gamerotation DIFFERS from Path B (${d.length} player(s))` : 'gamerotation identical to Path B');
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
  const boxBad = new Set(issues.filter((i) => i.check.startsWith('box-')).map((i) => i.game));
  const otherBad = [...failedGames].filter((id) => !boxBad.has(id));
  const unexpected = unexpectedFailures(failedGames, known);
  for (const id of failedGames) console.log(`  ${id}: ${rotationVerdict.get(id) ?? 'no gamerotation (run fetch-game to get the cross-check)'}`);
  console.log(`  → ${boxBad.size} failed game(s) have an internally inconsistent box score; ${otherBad.length} other(s)${otherBad.length ? ': ' + otherBad.join(', ') : ''}`);
  console.log(`  → ${failedGames.size - unexpected.length} known (data/known-issues.json), ${unexpected.length} NEW${unexpected.length ? ': ' + unexpected.join(', ') : ''}`);

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
    JSON.stringify({ season, games: ids.length, failed: [...failedGames], issues, errors, stintNotes: notes.map((g) => ({ game: g.id, notes: g.stintNotes })), rotation, roster }),
  );
  if (errors.length) bad = true;
}
if (bad) process.exitCode = 1;
