// Shared timeline geometry: quarter/OT dividers and light ticks every 3 minutes.

import { periodEnd, periodStart, REG_PERIODS } from '../domain/time.ts';

export const periodLabel = (p: number) => (p <= REG_PERIODS ? `Q${p}` : p === REG_PERIODS + 1 ? 'OT' : `${p - REG_PERIODS}OT`);

/** Labels row above a timeline of `periods` periods (width in %). */
export function AxisLabels({ periods }: { periods: number }) {
  const total = periodEnd(periods);
  return (
    <div className="axis-labels" aria-hidden>
      {Array.from({ length: periods }, (_, i) => {
        const p = i + 1;
        return (
          <span key={p} style={{ left: `${(periodStart(p) / total) * 100}%`, width: `${((periodEnd(p) - periodStart(p)) / total) * 100}%` }}>
            {periodLabel(p)}
          </span>
        );
      })}
    </div>
  );
}

/** SVG grid lines in a viewBox of width `total` seconds and height h. */
export function Grid({ periods, h }: { periods: number; h: number }) {
  const lines = [];
  for (let p = 1; p <= periods; p++) {
    const s = periodStart(p);
    for (let t = s + 180; t < periodEnd(p); t += 180) lines.push(<line key={`t${t}`} x1={t} x2={t} y1={0} y2={h} className="tick" />);
    if (p > 1) lines.push(<line key={`p${p}`} x1={s} x2={s} y1={0} y2={h} className="divider" />);
  }
  return <>{lines}</>;
}
