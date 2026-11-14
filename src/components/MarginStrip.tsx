// Thin score-margin strip on the chart's own time axis (x = (t − from) × width / length, the bars' mapping), so it
// lines up with the bars and the lineup cursor. Away lead above the zero line, home lead below, colored by who leads.

import { useMemo } from 'react';
import { finalMarginText, marginPaths, marginSteps } from '../domain/margin.ts';
import { gameLength } from '../domain/time.ts';
import type { Game } from '../domain/types.ts';

export const MARGIN_STRIP_PX = 34;
/** The Q4 tab must fit the window without scrolling (28 players in the worst real game), so its strip is thinner. */
export const Q4_MARGIN_STRIP_PX = 24;

export function MarginSvg({ g, from = 0, width, height = MARGIN_STRIP_PX }: { g: Game; from?: number; width: number; height?: number }) {
  const to = gameLength(g.periods);
  const steps = useMemo(() => marginSteps(g, from, to), [g, from, to]);
  const k = width / (to - from);
  const p = marginPaths(steps, to, from, k, height);
  return (
    <svg
      className="margin-svg"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      data-testid="margin-strip"
      data-from={from}
      data-k={k}
      data-scale={p.scale}
      aria-label={`Score margin over time (${g.away.tri} lead above, ${g.home.tri} lead below; up to ${p.scale})`}
      role="img"
    >
      <path className="margin-away" d={p.up} data-testid="margin-away" />
      <path className="margin-home" d={p.down} data-testid="margin-home" />
      <line className="margin-zero" x1={0} x2={width} y1={p.mid} y2={p.mid} />
    </svg>
  );
}

/** Label column: which side is whose, and the final margin. */
export function MarginLabel({ g }: { g: Game }) {
  return (
    <span className="margin-label">
      <span className="margin-key">
        <span className="margin-away-text">▲ {g.away.tri}</span>
        <span className="margin-home-text">▼ {g.home.tri}</span>
      </span>
      <span className="margin-final" data-testid="margin-final" title="Final margin">
        Final {finalMarginText(g)}
      </span>
    </span>
  );
}
