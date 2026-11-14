// Panels around the game chart: lineup cursor readout, lineup list, minutes & fouls by quarter.

import { useMemo, useState } from 'react';
import { formatMin, signed } from '../app/labels.ts';
import { shortNames } from '../app/names.ts';
import { clockLabel, cursorInfo, lineupSegments, periodName, quarterStats, troubleLevel, type LineupSegment } from '../domain/gameChart.ts';
import { periodAt } from '../domain/time.ts';
import type { Game } from '../domain/types.ts';
import type { Cursor } from './GameChart.tsx';
import { totalPlayed } from './GameChart.tsx';
import { PlayerLink, TeamLink } from './Links.tsx';
import { seasonOf } from '../domain/season.ts';

export function useGameNames(g: Game) {
  return useMemo(() => {
    const out = new Map<number, string>();
    for (const tri of [g.home.tri, g.away.tri]) for (const [id, n] of shortNames(g.players.filter((p) => p.team === tri))) out.set(id, n);
    return out;
  }, [g]);
}

export function CursorPanel({
  g,
  cursor,
  segments,
  names,
  onClose,
}: {
  g: Game;
  cursor: Cursor | null;
  segments: Record<string, LineupSegment[]>;
  names: Map<number, string>;
  onClose?: () => void;
}) {
  if (!cursor) return null;
  const c = cursorInfo(g, cursor.t, segments);
  const p = periodAt(c.t + 0.05);
  return (
    <div className="cursor-panel" data-testid="cursor-panel">
      <div className="cursor-title">
        <strong data-testid="cursor-clock">
          {c.clock} ·{' '}
          <TeamLink team={g.away.tri} season={seasonOf(g.id)}>
            {g.away.tri}
          </TeamLink>{' '}
          {c.score[1]}–{c.score[0]}{' '}
          <TeamLink team={g.home.tri} season={seasonOf(g.id)}>
            {g.home.tri}
          </TeamLink>
        </strong>
        <span className="muted">{cursor.pinned ? ' · pinned' : ''}</span>
        {onClose && (
          <button className="link cursor-close" onClick={onClose}>
            Close
          </button>
        )}
      </div>
      {c.teams.map((t) => (
        <div key={t.team} className="cursor-team" data-testid="cursor-team" data-team={t.team}>
          <TeamLink team={t.team} season={seasonOf(g.id)} className="cursor-tri">
            {t.team}
          </TeamLink>
          <span className="muted">on since {t.sinceClock}:</span>{' '}
          {t.players.map((x) => (
            <span key={x.p.id} className={`cursor-player lvl-text-${troubleLevel(p, x.fouls)}`} data-testid="cursor-player" data-fouls={x.fouls}>
              <PlayerLink id={x.p.id} team={x.p.team} season={seasonOf(g.id)}>
                {names.get(x.p.id) ?? x.p.name}
              </PlayerLink>{' '}
              <span className="pf-pill">{x.fouls} PF</span>
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

export function LineupList({ g, team, segs, names, onPick }: { g: Game; team: string; segs: LineupSegment[]; names: Map<number, string>; onPick: (t: number) => void }) {
  return (
    <details className="lineups" data-testid="lineup-list">
      <summary>
        {team} lineups ({segs.length})
      </summary>
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Start</th>
              <th>End</th>
              <th className="num">Time</th>
              <th>Lineup</th>
              <th className="num">+/-</th>
            </tr>
          </thead>
          <tbody>
            {segs.map((s) => (
              <tr key={s.start} className="clickable" onClick={() => onPick(s.start)} data-testid="lineup-row">
                <td>{clockLabel(s.start, true)}</td>
                <td>{clockLabel(s.end)}</td>
                <td className="num">{formatMin(s.end - s.start)}</td>
                <td>
                  {s.players.map((id, i) => (
                    <span key={id}>
                      {i > 0 && ', '}
                      <PlayerLink id={id} team={team} season={seasonOf(g.id)}>
                        {names.get(id) ?? g.players.find((p) => p.id === id)?.name}
                      </PlayerLink>
                    </span>
                  ))}
                </td>
                <td className="num">{signed(s.pm)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

type SortKey = string;

export function QuarterTable({ g, team }: { g: Game; team: string }) {
  const rows = useMemo(
    () =>
      g.players
        .filter((p) => p.team === team && p.played && p.stints.length)
        .map((p) => ({ p, q: quarterStats(p, g.periods), min: totalPlayed(p) })),
    [g, team],
  );
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'min', dir: -1 });
  const value = (r: (typeof rows)[number], key: SortKey): number | string => {
    if (key === 'name') return r.p.name;
    if (key === 'starter') return r.p.starter ? 1 : 0;
    if (key === 'min') return r.min;
    if (key === 'pf') return r.p.pf;
    const [kind, qs] = key.split(':');
    const q = r.q[Number(qs) - 1]!;
    return kind === 'qmin' ? q.min : kind === 'qpf' ? q.pf : q.cum;
  };
  const sorted = [...rows].sort((a, b) => {
    const [x, y] = [value(a, sort.key), value(b, sort.key)];
    return (typeof x === 'string' ? x.localeCompare(String(y)) : x - (y as number)) * sort.dir || b.min - a.min;
  });
  const th = (key: SortKey, label: string, cls = 'num') => (
    <th className={`${cls} sortable`} aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button onClick={() => setSort({ key, dir: sort.key === key ? ((-sort.dir) as 1 | -1) : key === 'name' ? 1 : -1 })}>{label}</button>
    </th>
  );
  const periods = Array.from({ length: g.periods }, (_, i) => i + 1);
  return (
    <div className="table-wrap">
      <table className="tbl quarter-table" data-testid="quarter-table" data-team={team}>
        <thead>
          <tr>
            <th colSpan={3} />
            {periods.map((q) => (
              <th key={q} colSpan={3} className="qgroup">
                {periodName(q)}
              </th>
            ))}
            <th />
          </tr>
          <tr>
            {th('name', 'Player', '')}
            {th('starter', 'Starter')}
            {th('min', 'MIN')}
            {periods.flatMap((q) => [
              <th key={`m${q}`} className="num sortable qgroup-start" aria-sort={sort.key === `qmin:${q}` ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
                <button onClick={() => setSort({ key: `qmin:${q}`, dir: sort.key === `qmin:${q}` ? ((-sort.dir) as 1 | -1) : -1 })}>MIN</button>
              </th>,
              <th key={`f${q}`} className="num sortable" aria-sort={sort.key === `qpf:${q}` ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
                <button onClick={() => setSort({ key: `qpf:${q}`, dir: sort.key === `qpf:${q}` ? ((-sort.dir) as 1 | -1) : -1 })}>PF</button>
              </th>,
              <th key={`c${q}`} className="num sortable" title="Cumulative fouls" aria-sort={sort.key === `qcum:${q}` ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
                <button onClick={() => setSort({ key: `qcum:${q}`, dir: sort.key === `qcum:${q}` ? ((-sort.dir) as 1 | -1) : -1 })}>Σ</button>
              </th>,
            ])}
            {th('pf', 'PF')}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.p.id} data-testid="quarter-row">
              <td className="name-cell">
                <PlayerLink id={r.p.id} team={team} season={seasonOf(g.id)}>
                  {r.p.name}
                </PlayerLink>
              </td>
              <td className="num">{r.p.starter ? '✓' : ''}</td>
              <td className="num strong">{formatMin(r.min)}</td>
              {r.q.flatMap((q) => [
                <td key={`m${q.period}`} className="num qgroup-start">
                  {q.min > 0 ? formatMin(q.min) : '—'}
                </td>,
                <td key={`f${q.period}`} className="num" data-testid="q-pf">
                  {q.pf || ''}
                </td>,
                <td key={`c${q.period}`} className="num muted">
                  {q.cum}
                </td>,
              ])}
              <td className="num strong" data-testid="q-pf-total">
                {r.p.pf}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const segmentsByTeam = (g: Game) => Object.fromEntries([g.home.tri, g.away.tri].map((t) => [t, lineupSegments(g, t)]));
