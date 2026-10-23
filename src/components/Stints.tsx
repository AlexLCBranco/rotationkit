// Stint bars on a game timeline (positioned HTML so text renders crisply), with foul markers,
// blowout shading and hover/tap callbacks. Duration labels appear only when they fit.

import { useEffect, useMemo, useRef, useState } from 'react';
import { formatClock, periodAt, periodEnd, periodStart, REG_PERIODS } from '../domain/time.ts';
import type { Stint } from '../domain/types.ts';
import { mergeContinuous } from '../domain/stints.ts';
import { periodLabel } from './Axis.tsx';
import { signed, formatMin } from '../app/labels.ts';

export const clockAt = (t: number, entering: boolean) => {
  const p = periodAt(entering ? t + 0.05 : t);
  return `${periodLabel(p)} ${formatClock(periodEnd(p) - t)}`;
};

export function describeStint(s: Stint): string {
  const fouls = s[3]?.length ? ` · foul${s[3].length > 1 ? 's' : ''} at ${s[3].map((t) => clockAt(t, false)).join(', ')}` : ' · no fouls';
  return `In ${clockAt(s[0], true)} → out ${clockAt(s[1], false)} · ${formatMin(s[1] - s[0])} · +/- ${signed(s[2])}${fouls}`;
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
  onHover?: (s: Stint | null) => void;
  active?: Stint | null;
}

const LABEL_PX = 40;

export function StintBars({ stints: raw, total, periods, blowout = [], labels = false, onHover, active }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const stints = useMemo(() => mergeContinuous(raw), [raw]);
  const pct = (t: number) => `${(t / total) * 100}%`;
  return (
    <div className="track" ref={ref}>
      {blowout.map(([a, b]) => (
        <i key={`b${a}`} className="blowout" style={{ left: pct(a), width: pct(b - a) }} title="Blowout time" />
      ))}
      <TrackGrid periods={periods} total={total} />
      {stints.map((s, i) => {
        const px = ((s[1] - s[0]) / total) * width;
        return (
          <button
            key={i}
            type="button"
            className={`bar${active && active[0] === s[0] && active[1] === s[1] ? ' active' : ''}${s[1] === s[0] ? ' zero' : ''}`}
            style={{ left: pct(s[0]), width: `max(3px, ${pct(s[1] - s[0])})` }}
            onPointerEnter={() => onHover?.(s)}
            onFocus={() => onHover?.(s)}
            onClick={(e) => {
              e.stopPropagation();
              onHover?.(s);
            }}
            aria-label={describeStint(s)}
          >
            {labels && px >= LABEL_PX && <span>{formatMin(s[1] - s[0])}</span>}
          </button>
        );
      })}
      {stints.flatMap((s) => (s[3] ?? []).map((t) => <i key={`f${t}`} className="foul" style={{ left: pct(t) }} title={`Foul ${clockAt(t, false)}`} />))}
    </div>
  );
}
