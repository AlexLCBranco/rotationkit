// Stint bars on a game timeline (positioned HTML so text renders crisply), with foul markers,
// blowout shading and hover/tap callbacks. Duration labels appear only when they fit.

import { useEffect, useMemo, useRef, useState } from 'react';
import { formatClock, periodAt, periodEnd, periodStart, REG_PERIODS } from '../domain/time.ts';
import type { Stint } from '../domain/types.ts';
import { barLabels, mergeContinuousPts, ptsText, stintSplitText } from '../domain/stints.ts';
import { periodLabel } from './Axis.tsx';
import { signed } from '../app/labels.ts';

export const clockAt = (t: number, entering: boolean) => {
  const p = periodAt(entering ? t + 0.05 : t);
  return `${periodLabel(p)} ${formatClock(periodEnd(p) - t)}`;
};

/** Stint in words; `pts` = points in it (null = the game file has no points per stint). */
export function describeStint(s: Stint, pts: number | null = null): string {
  const fouls = s[3]?.length ? ` · foul${s[3].length > 1 ? 's' : ''} at ${s[3].map((t) => clockAt(t, false)).join(', ')}` : ' · no fouls';
  // Across a quarter break (RK-5): the total and each quarter's part, "18:54 — Q2 6:54, Q3 12:00".
  return `In ${clockAt(s[0], true)} → out ${clockAt(s[1], false)} · ${stintSplitText(s)} · +/- ${signed(s[2])}${ptsText(pts)}${fouls}`;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(e!.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** Background of a timeline track: quarter/OT dividers, ticks every 3 minutes, OT tint. */
export function TrackGrid({ periods, total }: { periods: number; total: number }) {
  const pct = (t: number) => `${(t / total) * 100}%`;
  const out = [];
  for (let p = 1; p <= periods; p++) {
    const s = periodStart(p);
    for (let t = s + 180; t < periodEnd(p); t += 180) out.push(<i key={`t${t}`} className="tick" style={{ left: pct(t) }} />);
    if (p > 1) out.push(<i key={`p${p}`} className="divider" style={{ left: pct(s) }} />);
  }
  if (periods > REG_PERIODS) out.push(<i key="ot" className="ot" style={{ left: pct(periodEnd(REG_PERIODS)), width: pct(total - periodEnd(REG_PERIODS)) }} />);
  return <>{out}</>;
}

interface Props {
  stints: Stint[];
  total: number;
  periods: number;
  blowout?: [number, number][];
  labels?: boolean;
  /** Points per stint, parallel to `stints` (null = no data for this game). */
  pts?: number[] | null;
  /** Show points on the bars ("12:00 · 8p") where they fit. */
  barPoints?: boolean;
  onHover?: (s: Stint | null, pts: number | null) => void;
  active?: Stint | null;
}

const LABEL_PX = 40;
/** Approximate width of a bar label (11px tabular text) plus padding. */
const textPx = (text: string) => text.length * 6.2 + 8;

export function StintBars({ stints: raw, total, periods, blowout = [], labels = false, pts: rawPts = null, barPoints = false, onHover, active }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const { stints, pts } = useMemo(() => mergeContinuousPts(raw, rawPts), [raw, rawPts]);
  const pct = (t: number) => `${(t / total) * 100}%`;
  return (
    <div className="track" ref={ref}>
      {blowout.map(([a, b]) => (
        <i key={`b${a}`} className="blowout" style={{ left: pct(a), width: pct(b - a) }} title="Blowout time" />
      ))}
      <TrackGrid periods={periods} total={total} />
      {stints.map((s, i) => {
        const p = pts ? pts[i]! : null;
        // RK-5: a stint across a quarter break stays one bar, cut by a notch at each break, each quarter's part in its
        // own shade with its own minutes; the total only when no part has room.
        const lab = barLabels(s, total > 0 ? width / total : 0, barPoints ? p : null, textPx, LABEL_PX);
        const dur = s[1] - s[0] || 1;
        const rel = (t: number) => `${((t - s[0]) / dur) * 100}%`;
        const split = lab.parts.length > 1;
        return (
          <button
            key={i}
            type="button"
            className={`bar${active && active[0] === s[0] && active[1] === s[1] ? ' active' : ''}${s[1] === s[0] ? ' zero' : ''}${split ? ' split' : ''}`}
            style={{ left: pct(s[0]), width: `max(3px, ${pct(s[1] - s[0])})` }}
            onPointerEnter={() => onHover?.(s, p)}
            onFocus={() => onHover?.(s, p)}
            onClick={(e) => {
              e.stopPropagation();
              onHover?.(s, p);
            }}
            aria-label={describeStint(s, p)}
            data-testid="pl-stint"
            data-parts={lab.parts.length}
            {...(p !== null ? { 'data-pts': p } : {})}
          >
            {split &&
              lab.parts.map((part, j) => (
                <span key={j} className={`bar-part${j % 2 ? ' alt' : ''}`} style={{ left: rel(part.a), width: rel(s[0] + part.b - part.a) }} data-testid="pl-stint-part" data-period={part.period}>
                  {labels && part.text && !lab.total && <span data-testid="pl-stint-label">{part.text}</span>}
                </span>
              ))}
            {split && lab.parts.slice(1).map((part) => <i key={`n${part.a}`} className="bar-notch" style={{ left: rel(part.a) }} data-testid="pl-stint-notch" />)}
            {labels && lab.total && (
              <span className={split ? 'bar-total' : undefined} data-testid="pl-stint-label">
                {lab.total}
              </span>
            )}
          </button>
        );
      })}
      {stints.flatMap((s) => (s[3] ?? []).map((t) => <i key={`f${t}`} className="foul" style={{ left: pct(t) }} title={`Foul ${clockAt(t, false)}`} />))}
    </div>
  );
}
