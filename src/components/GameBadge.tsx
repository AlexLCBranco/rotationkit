import { formatMin } from '../app/labels.ts';
import { gameBadge } from '../domain/gameChart.ts';
import type { CupRound, Game } from '../domain/types.ts';
import { HelpLink } from './HelpLink.tsx';
import { gameKind, KIND_TAG } from '../domain/gameSet.ts';

export function GameBadge({ g, compact = false }: { g: Game; compact?: boolean }) {
  const b = gameBadge(g);
  return (
    <span className="badges" data-testid="game-badge">
      <span className={`badge kind-${b.kind.toLowerCase()}`} title={`Final margin ${b.margin}`}>
        {b.kind}
        {!compact && ` (${b.margin})`}
      </span>
      {b.garbage > 0 && (
        <span className="badge garbage" title="Time excluded by the blowout rule (Q4/OT, under 6:00 left, margin 20+)" data-testid="garbage-badge">
          {compact ? `GT ${formatMin(b.garbage)}` : `Garbage time ${formatMin(b.garbage)}`}
        </span>
      )}
      {b.garbage > 0 && !compact && <HelpLink section="garbage" />}
    </span>
  );
}

/**
 * National TV network(s) and NBA Cup tags, from the schedule feed (index.json / schedule.json `tv`, `cup`).
 * Nothing when the feed had neither (e.g. 2025-26: no cached feed for that season).
 */
export function BroadcastTags({ tv, cup, id, label }: { tv?: string[] | undefined; cup?: CupRound | undefined; id?: string | undefined; label?: string | undefined }) {
  // RK-13: play-in, playoff and Cup final games carry their kind (from the game id), plus the schedule feed's own
  // label (round, game number) when the feed gave one.
  const kind = id ? KIND_TAG[gameKind(id)] : undefined;
  if (!tv?.length && !cup && !kind) return null;
  return (
    <span className="badges bc-tags">
      {kind && (
        <span className="badge kind-tag" title={kind.tip} data-testid="kind-tag" data-kind={gameKind(id!)}>
          {kind.tag}
          {label ? ` · ${label}` : ''}
        </span>
      )}
      {tv?.length ? (
        <span className="badge tv" title={`National TV: ${tv.join(', ')}`} data-testid="tv-tag">
          {tv.join(' / ')}
        </span>
      ) : null}
      {cup && (
        <span className="badge cup" title={cup === 'group' ? 'NBA Cup group game' : 'NBA Cup knockout game'} data-testid="cup-tag" data-cup={cup}>
          CUP{cup === 'knockout' ? ' KO' : ''}
        </span>
      )}
    </span>
  );
}
