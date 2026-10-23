// Per-game data-quality notes: which check failed for whom, and which source looks wrong.
// Games with notes stay in the dataset; the UI shows a small warning on them.

import type { RawRotation } from './raw.ts';
import type { Game, QualityNote } from './types.ts';
import type { Issue } from './validate.ts';
import { compareStints } from './compareStints.ts';

export function qualityNotes(g: Game, issues: Issue[], rotation?: RawRotation): QualityNote[] {
  const playerIssues = issues.filter((i) => !i.check.startsWith('box-'));
  if (!playerIssues.length) return [];
  const boxInconsistent = issues.filter((i) => i.check.startsWith('box-'));
  const rotationMatches = rotation ? compareStints(g, rotation).length === 0 : undefined;

  // Per-player PT_DIFF totals (gamerotation's own +/-), to judge +/- disagreements.
  const ptDiff = new Map<number, number>();
  for (const set of rotation?.resultSets ?? []) {
    const [iP, iD] = [set.headers.indexOf('PERSON_ID'), set.headers.indexOf('PT_DIFF')];
    for (const r of set.rowSet) ptDiff.set(Number(r[iP]), (ptDiff.get(Number(r[iP])) ?? 0) + Number(r[iD]));
  }

  return playerIssues.map((i) => {
    const p = g.players.find((x) => i.player === `${x.name} (${x.team})`);
    let verdict: QualityNote['verdict'];
    let why: string;
    if (i.check === 'minutes' && boxInconsistent.some((b) => b.check === 'box-team-minutes')) {
      verdict = 'box-score';
      why = `box-score team minutes don't add up${rotationMatches ? '; gamerotation agrees with play-by-play' : ''}`;
    } else if (i.check === 'plus-minus' && p && ptDiff.has(p.id)) {
      const ours = p.stints.reduce((s, st) => s + st[2], 0);
      if (ptDiff.get(p.id) === ours) {
        verdict = 'box-score';
        why = 'gamerotation +/- agrees with play-by-play';
      } else {
        verdict = 'unresolved';
        why = `NBA's own +/- (box ${p.pm}, gamerotation ${ptDiff.get(p.id)}) credits same-second free throws differently`;
      }
    } else if (i.check === 'plus-minus') {
      verdict = 'unresolved';
      why = 'likely same-second free throw/substitution attribution; no gamerotation to confirm';
    } else {
      verdict = 'unresolved';
      why = rotationMatches ? 'gamerotation agrees with play-by-play' : 'not cross-checked';
    }
    return { check: i.check, ...(i.player ? { player: i.player } : {}), detail: i.detail, verdict, why };
  });
}
