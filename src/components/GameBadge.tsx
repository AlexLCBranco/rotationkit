import { formatMin } from '../app/labels.ts';
import { gameBadge } from '../domain/gameChart.ts';
import type { Game } from '../domain/types.ts';

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
    </span>
  );
}
