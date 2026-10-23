// Minutes per game over the selection: line through games played, dashed average, DNP and garbage-time marks.

import { useState } from 'react';
import { formatMin, reasonText, shortDate } from '../app/labels.ts';
import type { TrendPoint } from '../domain/patterns.ts';

const W = 640;
const H = 170;
const PAD = { l: 34, r: 10, t: 12, b: 26 };
const MAX = 48 * 60;

export function MinutesTrend({ points, avg }: { points: TrendPoint[]; avg: number | null }) {
  const [hover, setHover] = useState<TrendPoint | null>(null);
  if (!points.length) return null;
  const maxMin = Math.max(MAX, ...points.map((p) => p.min));
  const x = (i: number) => PAD.l + (points.length === 1 ? (W - PAD.l - PAD.r) / 2 : (i / (points.length - 1)) * (W - PAD.l - PAD.r));
  const y = (sec: number) => PAD.t + (1 - sec / maxMin) * (H - PAD.t - PAD.b);
  const played = points.map((p, i) => ({ p, i })).filter(({ p }) => p.status === 'played');
  const path = played.map(({ p, i }, k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.min).toFixed(1)}`).join(' ');
  const labelEvery = Math.max(1, Math.ceil(points.length / 8));
  return (
    <figure className="trend" data-testid="minutes-trend">
      <figcaption>
        <strong>Minutes per game</strong>
        {avg !== null && <span className="muted"> · average {formatMin(avg)} over {played.length} game{played.length === 1 ? '' : 's'} played</span>}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Minutes per game">
        {[0, 12, 24, 36, 48].map((m) => (
          <g key={m}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(m * 60)} y2={y(m * 60)} className="trend-grid" />
            <text x={PAD.l - 6} y={y(m * 60) + 4} className="trend-axis" textAnchor="end">
              {m}
            </text>
          </g>
        ))}
        {avg !== null && <line x1={PAD.l} x2={W - PAD.r} y1={y(avg)} y2={y(avg)} className="trend-avg" data-testid="trend-avg" />}
        <path d={path} className="trend-line" />
        {points.map((p, i) =>
          p.status === 'dnp' ? (
            <g key={p.gameId} data-testid="trend-dnp" onPointerEnter={() => setHover(p)} onClick={() => setHover(p)}>
              <path d={`M${x(i) - 4},${y(0) - 4} l8,8 M${x(i) - 4},${y(0) + 4} l8,-8`} className="trend-dnp" />
              <rect x={x(i) - 6} y={y(0) - 8} width={12} height={16} fill="transparent" />
            </g>
          ) : (
            <circle
              key={p.gameId}
              cx={x(i)}
              cy={y(p.min)}
              r={p.garbage ? 4.5 : 3.5}
              className={p.garbage ? 'trend-pt garbage' : 'trend-pt'}
              data-testid="trend-point"
              data-min={p.min}
              data-garbage={p.garbage}
              onPointerEnter={() => setHover(p)}
              onClick={() => setHover(p)}
            />
          ),
        )}
        {points.map((p, i) =>
          (i % labelEvery === 0 && points.length - 1 - i >= labelEvery / 2) || i === points.length - 1 ? (
            <text key={`d${p.gameId}`} x={x(i)} y={H - 8} className="trend-axis" textAnchor={i === points.length - 1 && points.length > 1 ? 'end' : 'middle'}>
              {shortDate(p.date)}
            </text>
          ) : null,
        )}
      </svg>
      <p className="trend-readout muted" data-testid="trend-readout">
        {hover
          ? `${shortDate(hover.date)} ${hover.home ? 'vs' : '@'} ${hover.opponent} · ${
              hover.status === 'dnp' ? `DNP${hover.reason ? ` (${reasonText(hover.reason)})` : ''}` : formatMin(hover.min)
            }${hover.garbage ? ' · game had garbage time' : ''}`
          : '● played · ○ larger hollow = game had garbage time · × = did not play · dashed = average'}
      </p>
    </figure>
  );
}
