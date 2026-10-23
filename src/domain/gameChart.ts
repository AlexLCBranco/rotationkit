// Single-game chart logic (pure): foul marks and foul trouble, per-quarter minutes/fouls, game-type badge,
// lineups and the cursor, and the collision-free label layout of a player row.

import { CHART, FOUL_TROUBLE, GAME_TYPE, PATTERN_CONFIG } from './config.ts';
import { blowoutIntervals } from './patterns.ts';
import { mergeContinuous } from './stints.ts';
import { formatClock, gameLength, periodAt, periodEnd, REG_PERIODS } from './time.ts';
import type { Game, PlayerGame, Stint } from './types.ts';

// ---------- fouls ----------

export type Trouble = 'ok' | 'caution' | 'trouble';

export function troubleLevel(period: number, fouls: number, cfg = FOUL_TROUBLE): Trouble {
  const c = cfg[String(Math.min(period, REG_PERIODS)) as keyof typeof cfg];
  if (fouls >= c.trouble) return 'trouble';
  if (c.caution !== null && fouls >= c.caution) return 'caution';
  return 'ok';
}

export interface FoulMark {
  t: number;
  period: number;
  /** Cumulative foul number at that moment (1, 2, 3…). */
  n: number;
  type: string;
}

export const foulMarks = (p: PlayerGame): FoulMark[] => (p.fouls ?? []).map(([t, period, type], i) => ({ t, period, n: i + 1, type }));

/** Fouls committed up to and including elapsed time t. */
export const foulsAt = (p: PlayerGame, t: number) => (p.fouls ?? []).filter(([ft]) => ft <= t).length;

/** Period label: Q1–Q4, OT, 2OT… */
export const periodName = (p: number) => (p <= REG_PERIODS ? `Q${p}` : p === REG_PERIODS + 1 ? 'OT' : `${p - REG_PERIODS}OT`);

/** "Q4 1:27" for elapsed t; at a boundary, `entering` picks the later period ("Q2 12:00" vs "Q1 0:00"). */
export function clockLabel(t: number, entering = false): string {
  const p = periodAt(entering ? t + 0.05 : t);
  return `${periodName(p)} ${formatClock(periodEnd(p) - t)}`;
}

export const foulReadout = (name: string, f: FoulMark) => `${name} — foul #${f.n} — ${f.type} — ${periodName(f.period)} ${formatClock(periodEnd(f.period) - f.t)}`;

// ---------- per-quarter minutes and fouls ----------

export interface QuarterRow {
  period: number;
  /** Seconds played in the period. */
  min: number;
  pf: number;
  /** Cumulative fouls at the end of the period. */
  cum: number;
}

export function quarterStats(p: PlayerGame, periods: number): QuarterRow[] {
  const rows: QuarterRow[] = [];
  let cum = 0;
  for (let q = 1; q <= periods; q++) {
    const [q0, q1] = [periodEnd(q) - (q <= REG_PERIODS ? 720 : 300), periodEnd(q)];
    const min = p.stints.reduce((x, [s, e]) => x + Math.max(0, Math.min(e, q1) - Math.max(s, q0)), 0);
    const pf = (p.fouls ?? []).filter((f) => f[1] === q).length;
    cum += pf;
    rows.push({ period: q, min, pf, cum });
  }
  return rows;
}

// ---------- bar colors ----------

export interface Segment {
  a: number;
  b: number;
  level: Trouble;
}

/** Split a (display) stint at period boundaries and foul times; each piece gets its foul-trouble level. */
export function barSegments(st: Stint, p: PlayerGame, cfg = FOUL_TROUBLE): Segment[] {
  const [s, e] = st;
  if (e <= s) return [{ a: s, b: e, level: troubleLevel(periodAt(s + 0.05), foulsAt(p, s), cfg) }];
  const cuts = new Set<number>([s, e]);
  for (let q = periodAt(s + 0.05); periodEnd(q) < e; q++) cuts.add(periodEnd(q));
  for (const [t] of p.fouls ?? []) if (t > s && t < e) cuts.add(t);
  const xs = [...cuts].sort((x, y) => x - y);
  const out: Segment[] = [];
  for (let i = 0; i < xs.length - 1; i++) {
    const [a, b] = [xs[i]!, xs[i + 1]!];
    const level = troubleLevel(periodAt(a + 0.05), foulsAt(p, a), cfg);
    const last = out[out.length - 1];
    if (last && last.level === level && last.b === a) last.b = b;
    else out.push({ a, b, level });
  }
  return out;
}

// ---------- game type ----------

export interface GameBadge {
  kind: 'Blowout' | 'Comfortable' | 'Competitive';
  margin: number;
  /** Seconds excluded by the blowout rule (garbage time); 0 if none. */
  garbage: number;
}

export function gameBadge(g: Game, cfg = PATTERN_CONFIG.blowout): GameBadge {
  const margin = Math.abs(g.home.score - g.away.score);
  const kind = margin >= GAME_TYPE.blowoutMargin ? 'Blowout' : margin >= GAME_TYPE.comfortableMargin ? 'Comfortable' : 'Competitive';
  const garbage = blowoutIntervals(g, cfg).reduce((x, [a, b]) => x + b - a, 0);
  return { kind, margin, garbage };
}

// ---------- score, on court, lineups ----------

/** Score after every event at or before t: [home, away]. */
export function scoreAt(g: Game, t: number): [number, number] {
  let s: [number, number] = [0, 0];
  for (const [ts, h, a] of g.score) {
    if (ts > t) break;
    s = [h, a];
  }
  return s;
}

/** Players on court at elapsed t (stints are [start, end) ; zero-length stints are never "on court"). */
export function onCourtAt(g: Game, team: string, t: number): PlayerGame[] {
  const tt = Math.min(t, gameLength(g.periods) - 1e-6);
  return g.players.filter((p) => p.team === team && p.stints.some(([s, e]) => e > s && s <= tt && tt < e));
}

export interface LineupSegment {
  start: number;
  end: number;
  /** Player ids, sorted. */
  players: number[];
  /** Team +/- over the segment (score after all events at the boundary clocks). */
  pm: number;
}

export function lineupSegments(g: Game, team: string): LineupSegment[] {
  const end = gameLength(g.periods);
  const pts = new Set<number>([0, end]);
  for (const p of g.players) if (p.team === team) for (const [s, e] of p.stints) if (e > s) (pts.add(s), pts.add(e));
  const xs = [...pts].filter((x) => x >= 0 && x <= end).sort((a, b) => a - b);
  const sign = g.home.tri === team ? 1 : -1;
  // Points logged at 12:00 of Q1 (before the clock ran) belong to the starting lineup: start from 0–0.
  const margin = (t: number) => {
    if (t === 0) return 0;
    const [h, a] = scoreAt(g, t);
    return sign * (h - a);
  };
  const segs: LineupSegment[] = [];
  for (let i = 0; i < xs.length - 1; i++) {
    const [a, b] = [xs[i]!, xs[i + 1]!];
    const players = onCourtAt(g, team, a).map((p) => p.id).sort((x, y) => x - y);
    const last = segs[segs.length - 1];
    if (last && last.players.join() === players.join()) last.end = b;
    else segs.push({ start: a, end: b, players, pm: 0 });
  }
  for (const s of segs) s.pm = margin(s.end) - margin(s.start);
  return segs;
}

export interface CursorInfo {
  t: number;
  clock: string;
  score: [number, number];
  teams: { team: string; since: number; sinceClock: string; players: { p: PlayerGame; fouls: number }[] }[];
}

export function cursorInfo(g: Game, t: number, segments?: Record<string, LineupSegment[]>): CursorInfo {
  const end = gameLength(g.periods);
  const tt = Math.max(0, Math.min(t, end));
  return {
    t: tt,
    clock: clockLabel(tt, tt < end),
    score: scoreAt(g, tt),
    teams: [g.away.tri, g.home.tri].map((team) => {
      const segs = segments?.[team] ?? lineupSegments(g, team);
      const seg = segs.find((s) => s.start <= tt && (tt < s.end || (tt === end && s.end === end))) ?? segs[segs.length - 1]!;
      return {
        team,
        since: seg.start,
        sinceClock: clockLabel(seg.start, true),
        players: onCourtAt(g, team, tt)
          .map((p) => ({ p, fouls: foulsAt(p, tt) }))
          .sort((a, b) => b.p.min - a.p.min),
      };
    }),
  };
}

// ---------- axis ----------

/** Clock tick marks per period: 12:00/9:00/6:00/3:00 in quarters; 5:00/2:30 in OT. */
export function axisTicks(periods: number): { t: number; label: string; period: number }[] {
  const out = [];
  for (let p = 1; p <= periods; p++) {
    const marks = p <= REG_PERIODS ? [720, 540, 360, 180] : [300, 150];
    for (const rem of marks) out.push({ t: periodEnd(p) - rem, label: formatClock(rem), period: p });
  }
  return out;
}

// ---------- row label layout ----------

export type Lane = 'top' | 'bar' | 'bottom';
export interface Box {
  x: number;
  w: number;
  lane: Lane;
}
export interface BarLayout {
  st: Stint;
  x: number;
  w: number;
  segments: (Segment & { x: number; w: number })[];
  label: Box & { text: string; inside: boolean };
}
export interface TickLayout extends FoulMark {
  x: number;
  label: Box;
}
export interface BadgeLayout {
  period: number;
  n: number;
  box: Box;
}
export interface RowLayout {
  width: number;
  pxPerSec: number;
  bars: BarLayout[];
  ticks: TickLayout[];
  badges: BadgeLayout[];
  usesBottom: boolean;
  height: number;
}

/** Timeline width for a container: never below the minimum scale. */
export const timelineWidth = (periods: number, containerPx: number) => Math.max(containerPx, (gameLength(periods) / 60) * CHART.minPxPerMinute);

export const durationText = (sec: number) => formatClock(sec);
export const labelWidth = (text: string) => text.length * CHART.labelCharPx + 2 * CHART.labelPadPx;
const tickWidth = (n: number) => String(n).length * CHART.tickCharPx + 2;
const BADGE_W = 14;
const GAP = 2;

type Occ = [number, number][];
const free = (x: number, w: number, occ: Occ) => occ.every(([a, b]) => x + w + GAP <= a || x >= b + GAP);

/** Closest x to `desired` where [x, x+w] fits inside [min, max] without touching occupied intervals. */
function nearestFree(desired: number, w: number, occ: Occ, min: number, max: number): number | null {
  const cands = [desired, ...occ.flatMap(([a, b]) => [b + GAP, a - GAP - w])]
    .map((x) => Math.max(min, Math.min(max - w, x)))
    .filter((x) => free(x, w, occ));
  if (!cands.length) return null;
  return cands.reduce((best, x) => (Math.abs(x - desired) < Math.abs(best - desired) ? x : best));
}

export function layoutRow(p: PlayerGame, periods: number, width: number, opts: { trouble?: boolean } = {}): RowLayout {
  const total = gameLength(periods);
  const k = width / total;
  const occ: Record<Lane, Occ> = { top: [], bar: [], bottom: [] };
  const display = mergeContinuous(p.stints);
  const marks = foulMarks(p);

  // Bars (fixed geometry, proportional to time).
  const bars: BarLayout[] = display.map((st) => {
    const x = st[0] * k;
    const w = Math.max(2, (st[1] - st[0]) * k);
    occ.bar.push([x, x + w]);
    const segments = (opts.trouble === false ? [{ a: st[0], b: st[1], level: 'ok' as Trouble }] : barSegments(st, p)).map((s) => ({
      ...s,
      x: s.a * k,
      w: Math.max(st[1] === st[0] ? 2 : 0, (s.b - s.a) * k),
    }));
    return { st, x, w, segments, label: { text: durationText(st[1] - st[0]), x: 0, w: 0, lane: 'bar', inside: false } };
  });

  // Per-quarter PF badges, right-aligned at the end of the quarter, in the top lane.
  const badges: BadgeLayout[] = [];
  for (const q of quarterStats(p, periods)) {
    if (!q.pf) continue;
    const x = periodEnd(q.period) * k - BADGE_W - 1;
    badges.push({ period: q.period, n: q.pf, box: { x, w: BADGE_W, lane: 'top' } });
    occ.top.push([x, x + BADGE_W]);
  }

  // Foul tick numbers, as close to the tick as possible. Tick lines also occupy the top lane.
  const ticks: TickLayout[] = [];
  for (const m of marks) {
    const x = m.t * k;
    const w = tickWidth(m.n);
    const lx = nearestFree(x - w / 2, w, occ.top, 0, width) ?? x - w / 2;
    occ.top.push([lx, lx + w]);
    ticks.push({ ...m, x, label: { x: lx, w, lane: 'top' } });
  }
  for (const t of ticks) occ.top.push([t.x - 0.5, t.x + 0.5]);

  // Duration labels: inside for long stints; beside, then above, then below for short ones.
  let usesBottom = false;
  for (const b of bars) {
    const w = labelWidth(b.label.text);
    const dur = b.st[1] - b.st[0];
    if (dur >= CHART.insideLabelMinSeconds && w <= b.w) {
      b.label = { ...b.label, x: b.x + (b.w - w) / 2, w, lane: 'bar', inside: true };
      continue;
    }
    const right = b.x + b.w + GAP + 1;
    const left = b.x - GAP - 1 - w;
    let placed: Box | null = null;
    for (const x of [right, left]) {
      if (x >= 0 && x + w <= width && free(x, w, occ.bar)) {
        placed = { x, w, lane: 'bar' };
        break;
      }
    }
    if (!placed) {
      const center = b.x + b.w / 2 - w / 2;
      const x = nearestFree(center, w, occ.top, Math.max(0, center - 24), Math.min(width, center + w + 24));
      if (x !== null) placed = { x, w, lane: 'top' };
    }
    if (!placed) {
      const x = nearestFree(b.x + b.w / 2 - w / 2, w, occ.bottom, 0, width) ?? b.x;
      placed = { x, w, lane: 'bottom' };
      usesBottom = true;
    }
    occ[placed.lane].push([placed.x, placed.x + placed.w]);
    b.label = { ...b.label, ...placed, inside: false };
  }

  return {
    width,
    pxPerSec: k,
    bars,
    ticks,
    badges,
    usesBottom,
    height: CHART.laneTopPx + CHART.barPx + (usesBottom ? CHART.laneBottomPx : 0),
  };
}

/** All boxes of a row in one list (for collision checks). */
export function rowBoxes(r: RowLayout): (Box & { kind: string })[] {
  return [
    ...r.bars.map((b) => ({ ...b.label, kind: b.label.inside ? 'inside' : 'label' })),
    ...r.ticks.map((t) => ({ ...t.label, kind: 'tick' })),
    ...r.badges.map((b) => ({ ...b.box, kind: 'badge' })),
  ];
}

