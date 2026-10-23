// On-court share strip for one player: four quarter blocks on the dark track (gaps at quarter lines, like the
// single-game chart), each 30 s bucket colored by share; buckets with only garbage time are striped.

import { heat } from '../app/colors.ts';
import { periodEnd, periodStart } from '../domain/time.ts';

interface Props {
  shares: (number | null)[];
  bucketSeconds: number;
  /** Called with the bucket under the pointer/finger and the pointer position. */
  onHover: (bucket: number, e: React.PointerEvent) => void;
  active?: number | null;
}

const H = 10;
const QUARTERS = [1, 2, 3, 4];

export function HeatStrip({ shares, bucketSeconds, onHover, active }: Props) {
  return (
    <div className="tp-strip" data-testid="heat-strip">
      {QUARTERS.map((q) => {
        const first = periodStart(q) / bucketSeconds;
        const n = (periodEnd(q) - periodStart(q)) / bucketSeconds;
        const pick = (e: React.PointerEvent<SVGSVGElement>) => {
          const r = e.currentTarget.getBoundingClientRect();
          const b = first + Math.max(0, Math.min(n - 1, Math.floor(((e.clientX - r.left) / r.width) * n)));
          onHover(b, e);
        };
        return (
          <svg key={q} className="heat" viewBox={`0 0 ${n} ${H}`} preserveAspectRatio="none" onPointerMove={pick} onPointerDown={pick} role="img" shapeRendering="crispEdges">
            {Array.from({ length: n }, (_, i) => {
              const s = shares[first + i] ?? null;
              return <rect key={i} x={i} y={0} width={1.02} height={H} fill={s === null ? 'url(#rk-excluded)' : heat(s)} />;
            })}
            {[6, 12, 18].map((x) => (
              <line key={x} x1={x} x2={x} y1={0} y2={H} className="tick" />
            ))}
            {active != null && active >= first && active < first + n && <rect x={active - first} y={0} width={1} height={H} className="cursor" />}
          </svg>
        );
      })}
    </div>
  );
}

/** Shared SVG definitions, rendered once per page. */
export function HeatDefs() {
  return (
    <svg width={0} height={0} style={{ position: 'absolute' }} aria-hidden>
      <defs>
        {/* Only garbage time in this bucket (excluded): stripes, so it can't be confused with 0%. */}
        <pattern id="rk-excluded" patternUnits="userSpaceOnUse" width={0.5} height={H}>
          <rect width={0.5} height={H} fill="#101010" />
          <rect width={0.25} height={H} fill="#3a3a3a" />
        </pattern>
      </defs>
    </svg>
  );
}
