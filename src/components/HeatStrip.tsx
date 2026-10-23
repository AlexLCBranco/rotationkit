import { heat } from '../app/colors.ts';
import { REGULATION_LEN } from '../domain/time.ts';
import { Grid } from './Axis.tsx';

interface Props {
  shares: (number | null)[];
  bucketSeconds: number;
  /** Called with the bucket under the pointer (null when leaving). */
  onHover: (bucket: number | null) => void;
  active?: number | null;
}

const H = 10;

export function HeatStrip({ shares, bucketSeconds, onHover, active }: Props) {
  const pick = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const b = Math.floor(((e.clientX - r.left) / r.width) * shares.length);
    onHover(Math.max(0, Math.min(shares.length - 1, b)));
  };
  return (
    <svg
      className="heat"
      viewBox={`0 0 ${REGULATION_LEN} ${H}`}
      preserveAspectRatio="none"
      onPointerMove={pick}
      onPointerDown={pick}
      role="img"
      shapeRendering="crispEdges"
    >
      {shares.map((s, b) => (
        <rect key={b} x={b * bucketSeconds} y={0} width={bucketSeconds + 0.5} height={H} fill={s === null ? 'url(#rk-excluded)' : heat(s)} />
      ))}
      <Grid periods={4} h={H} />
      {active != null && <rect x={active * bucketSeconds} y={0} width={bucketSeconds} height={H} className="cursor" />}
    </svg>
  );
}

/** Shared SVG definitions, rendered once per page. */
export function HeatDefs() {
  return (
    <svg width={0} height={0} style={{ position: 'absolute' }} aria-hidden>
      <defs>
        {/* Excluded (blowout-only) time: stripes, so it can't be confused with 0%. */}
        <pattern id="rk-excluded" patternUnits="userSpaceOnUse" width={24} height={H}>
          <rect width={24} height={H} fill="#262b36" />
          <rect width={12} height={H} fill="#4a5163" />
        </pattern>
      </defs>
    </svg>
  );
}
