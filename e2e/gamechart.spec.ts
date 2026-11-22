// Single-game chart: labels, ticks, colors, cursor, lineups, tables, badges — against the production build.

import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { foulMarks, foulReadout, quarterStats } from '../src/domain/gameChart.ts';
import type { Game } from '../src/domain/types.ts';

const load = (season: string, id: string) => JSON.parse(readFileSync(`data/${season}/games/${id}.json`, 'utf8')) as Game;
const index = (season: string) => JSON.parse(readFileSync(`data/${season}/index.json`, 'utf8')) as { id: string }[];

// Sample: fixtures + flagged + OT + every 40th game of 2025-26 + all of 2026-27. E2E_ALL_GAMES=1 → every game.
const ALL = !!process.env.E2E_ALL_GAMES;
const sample = ALL
  ? [...index('2025-26').map((g) => g.id), ...index('2026-27').map((g) => g.id)]
  : [
      ...new Set([
        '0022500093', '0022500374', '0022500722', '0022500753', '0022500811', '0022501147', '0022500458', '0022500020', '0022500184',
        '0022500643', '0022600088', '0022600092', '0022600085', '0022600090',
        ...index('2025-26').filter((_, i) => i % 40 === 0).map((g) => g.id),
        ...index('2026-27').map((g) => g.id),
      ]),
    ];

function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && !m.location().url.includes('cdn.nba.com') && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

/** Runs in the page: checks every player row of the chart; returns problems. */
function inspectChart(): string[] {
  const out: string[] = [];
  const overlap = (a: DOMRect, b: DOMRect) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
  let ratio: number | null = null;
  for (const row of document.querySelectorAll<HTMLElement>('[data-testid=gc-player-row]')) {
    const who = row.querySelector('.gc-name')?.textContent ?? '?';
    const bars = [...row.querySelectorAll<HTMLElement>('[data-testid=stint]')];
    const labels = [...row.querySelectorAll<HTMLElement>('[data-testid=stint-label]')];
    if (bars.length !== labels.length) out.push(`${who}: ${bars.length} stints, ${labels.length} labels`);
    const barRects = bars.map((b) => b.getBoundingClientRect());
    bars.forEach((b, i) => {
      const dur = Number(b.dataset.end) - Number(b.dataset.start);
      const r = barRects[i]!;
      // Stints drawn at the 2 px minimum (a few seconds) are excluded from the proportionality check.
      if (r.width > 3) {
        const k = r.width / dur;
        if (ratio === null) ratio = k;
        else if (Math.abs(k - ratio) * dur > 1) out.push(`${who}: bar width not proportional (${r.width} for ${dur}s)`);
      }
      const l = labels[i];
      if (!l) return;
      const text = l.textContent ?? '';
      if (!/^\d+:\d\d$/.test(text)) out.push(`${who}: bad label "${text}"`);
      const lr = l.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(l);
      const tr = range.getBoundingClientRect();
      if (tr.width > lr.width + 0.5) out.push(`${who}: label "${text}" text ${tr.width.toFixed(1)}px > box ${lr.width.toFixed(1)}px`);
      const fs = parseFloat(getComputedStyle(l).fontSize);
      const inside = l.dataset.inside === 'true';
      if (dur >= 120) {
        if (!inside) out.push(`${who}: ${text} (≥2:00) not inside`);
        if (fs < 12) out.push(`${who}: inside label ${fs}px`);
        if (tr.left < r.left - 0.5 || tr.right > r.right + 0.5) out.push(`${who}: inside label ${text} spills out of its bar`);
      } else {
        if (inside) out.push(`${who}: short stint ${text} labelled inside`);
        for (const br of barRects) if (overlap(tr, br)) out.push(`${who}: label ${text} covers a bar`);
      }
    });
    const pf = Number(row.querySelector('[data-testid=gc-pf]')?.textContent);
    const ticks = [...row.querySelectorAll<HTMLElement>('[data-testid=foul-tick]')];
    if (ticks.length !== pf) out.push(`${who}: ${ticks.length} foul ticks vs PF ${pf}`);
    if (ticks.some((t, i) => Number(t.dataset.n) !== i + 1)) out.push(`${who}: foul numbers not 1..n`);
    const boxes = [
      ...labels.filter((l) => l.dataset.inside !== 'true').map((l) => ['label', l] as const),
      ...ticks.map((t) => ['tick', t] as const),
      ...[...row.querySelectorAll<HTMLElement>('[data-testid=pf-badge]')].map((b) => ['badge', b] as const),
    ].map(([k, el]) => [k, el.getBoundingClientRect()] as const);
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) if (overlap(boxes[i]![1], boxes[j]![1])) out.push(`${who}: ${boxes[i]![0]} overlaps ${boxes[j]![0]}`);
  }
  return out;
}

test(`labels, bars, ticks and badges on ${sample.length} games${ALL ? ' (all)' : ''}`, async ({ page }) => {
  test.setTimeout(ALL ? 3_600_000 : 300_000);
  const errors = trackErrors(page);
  const problems: string[] = [];
  for (const id of sample) {
    await page.goto(`/game/${id}`);
    await expect(page.getByTestId('gc-player-row').first()).toBeVisible();
    await page.waitForFunction(() => document.querySelector('.gc-box')!.clientWidth > 0);
    const p = await page.evaluate(inspectChart);
    problems.push(...p.map((x) => `${id} ${x}`));
  }
  expect(problems.slice(0, 30)).toEqual([]);
  // The page itself never scrolls sideways; the chart scrolls inside its own box.
  const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  expect(sw).toBeLessThanOrEqual(cw);
  expect(errors).toEqual([]);
});

test('foul tick readout: player, number, type, quarter, clock', async ({ page }) => {
  const g = load('2025-26', '0022500093');
  const p = g.players.find((x) => x.name === 'Isaiah Stewart')!;
  const marks = foulMarks(p);
  await page.goto('/game/0022500093');
  const row = page.locator(`[data-testid=gc-player-row][data-player="${p.id}"]`);
  await expect(row.getByTestId('foul-tick')).toHaveCount(p.pf);
  for (const m of [marks[0]!, marks[2]!, marks[5]!]) {
    const tick = row.locator(`[data-testid=foul-tick][data-n="${m.n}"]`);
    await tick.scrollIntoViewIfNeeded();
    await tick.hover();
    await expect(page.getByTestId('chart-tip')).toHaveText(foulReadout(p.name, m));
  }
  expect(foulReadout(p.name, marks[2]!)).toBe('Isaiah Stewart — foul #3 — offensive foul (turnover) — Q2 10:04');
});

test('foul-trouble toggle: colors on by default, single neutral color when off', async ({ page }) => {
  await page.goto('/game/0022500093');
  await expect(page.getByTestId('trouble-legend')).toHaveCount(2);
  await expect(page.getByTestId('trouble-legend').first()).toContainText('Foul Trouble:');
  await expect(page.locator('.gc-seg.lvl-trouble').first()).toBeAttached();
  await expect(page.locator('.gc-seg.lvl-caution').first()).toBeAttached();
  await page.getByRole('checkbox', { name: 'Foul trouble' }).click();
  await expect(page.locator('.gc-seg.lvl-trouble, .gc-seg.lvl-caution, .gc-seg.lvl-ok')).toHaveCount(0);
  expect(await page.locator('.gc-seg.lvl-neutral').count()).toBeGreaterThan(20);
  await page.getByRole('checkbox', { name: 'Foul trouble' }).click();
});

test('lineup cursor: 5 per team, fouls at that moment, pin; lineup list moves the cursor', async ({ page }, info) => {
  await page.goto('/game/0022500093');
  const chart = page.getByTestId('game-chart');
  await expect(page.getByTestId('gc-player-row').first()).toBeVisible();
  // Lineup list row → pinned cursor at its start.
  const list = page.getByTestId('lineup-list').first();
  await list.locator('summary').click();
  const row = list.getByTestId('lineup-row').nth(3);
  const start = (await row.locator('td').first().textContent())!;
  await row.locator('td').first().click(); // not on a name: names are player links
  await expect(page.getByTestId('cursor-clock')).toContainText(start);
  await expect(page.getByTestId('cursor-team')).toHaveCount(2);
  for (const t of await page.getByTestId('cursor-team').all()) await expect(t.getByTestId('cursor-player')).toHaveCount(5);
  await expect(page.getByTestId('cursor-panel')).toContainText('pinned');
  // Tap/click on the chart moves the cursor.
  const box = (await chart.boundingBox())!;
  await chart.click({ position: { x: box.width - 120, y: 120 } });
  await expect(page.getByTestId('cursor-line')).toBeVisible();
  for (const t of await page.getByTestId('cursor-team').all()) await expect(t.getByTestId('cursor-player')).toHaveCount(5);
  await page.screenshot({ path: `screenshots/game-cursor-${info.project.name}.png` });
});

test('minutes & fouls by quarter: PF totals equal the box score; per-quarter sums match; sortable', async ({ page }) => {
  const g = load('2025-26', '0022500093');
  await page.goto('/game/0022500093');
  for (const t of [g.home.tri, g.away.tri]) {
    const table = page.locator(`[data-testid=quarter-table][data-team="${t}"]`);
    const rows = table.getByTestId('quarter-row');
    const players = g.players.filter((p) => p.team === t && p.played && p.stints.length);
    await expect(rows).toHaveCount(players.length);
    for (const p of players) {
      const r = rows.filter({ hasText: p.name }).first();
      await expect(r.getByTestId('q-pf-total')).toHaveText(String(p.pf));
      const q = quarterStats(p, g.periods);
      expect(q.reduce((x, y) => x + y.pf, 0)).toBe(p.pf);
    }
  }
  const table = page.locator('[data-testid=quarter-table]').first();
  await table.getByRole('button', { name: 'Player' }).click();
  const names = await table.getByTestId('quarter-row').locator('td.name-cell').allTextContents();
  expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
});

test('game badges: header and player-view rows; garbage time on a known blowout', async ({ page }) => {
  await page.goto('/game/0022600088'); // TOR by 43
  await expect(page.getByTestId('game-badge').first()).toContainText('Blowout (43)');
  await expect(page.getByTestId('garbage-badge').first()).toContainText(/Garbage time \d+:\d\d/);
  await page.goto('/game/0022600001'); // DET by 8
  await expect(page.getByTestId('game-badge').first()).toContainText('Competitive (8)');
  await expect(page.getByTestId('garbage-badge')).toHaveCount(0);
  await page.goto('/player/ORL/1630532?s=2025-26');
  await expect(page.getByTestId('game-log-row').first().getByTestId('game-badge')).toBeVisible();
  await expect(page.getByTestId('game-log-avg')).toContainText('Average');
});

test('team without a game id → its most recent game', async ({ page }) => {
  await page.goto('/game/latest?t=PHI&s=2025-26');
  await expect(page.locator('h1')).toContainText('PHI');
  const last = index('2025-26').map((e) => load('2025-26', e.id)).filter((g) => g.home.tri === 'PHI' || g.away.tri === 'PHI').at(-1)!;
  await expect(page.locator('h1')).toContainText(`${last.away.tri} ${last.away.score}`);
});

test('team pattern: minutes & fouls per game table respects filters; matchup mode shows both teams with identical filters', async ({ page }) => {
  await page.goto('/team/PHI?s=2025-26&w=10&v=home');
  await expect(page.getByTestId('averages-table')).toBeVisible();
  await expect(page.locator('.avg-table:not(.closers) summary')).toContainText('based on 10 games');
  await page.getByTestId('vs-picker').locator('[data-value=BOS]').click();
  const blocks = page.getByTestId('team-block');
  await expect(blocks).toHaveCount(2);
  await expect(blocks.nth(0).getByTestId('selection-label')).toHaveText('Last 10 home games · based on 10 games · regular season');
  await expect(blocks.nth(1).getByTestId('selection-label')).toHaveText('Last 10 home games · based on 10 games · regular season');
  await expect(blocks.nth(1)).toHaveAttribute('data-team', 'BOS');
  await page.getByRole('button', { name: 'Last 5' }).click();
  await expect(blocks.nth(0).getByTestId('selection-label')).toHaveText('Last 5 home games · based on 5 games · regular season');
  await expect(blocks.nth(1).getByTestId('selection-label')).toHaveText('Last 5 home games · based on 5 games · regular season');
});

test('headshots fall back to initials when the image fails', async ({ page }) => {
  await page.route('**/cdn.nba.com/headshots/**', (r) => r.abort());
  await page.goto('/game/0022600001');
  await expect(page.locator('.headshot.initials').first()).toBeVisible();
  expect(await page.locator('.headshot.initials').first().textContent()).toMatch(/^[A-Z]{1,2}$/);
});

test('reference screenshots', async ({ page }, info) => {
  await page.goto('/game/0022500093');
  await expect(page.getByTestId('gc-player-row').first()).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `screenshots/gamechart-${info.project.name}.png`, fullPage: true });
});

test('rows (incl. DNP rows) show full names', async ({ page }) => {
  await page.goto('/game/0022500093');
  await expect(page.getByTestId('dnp-row').first().locator('.gc-name .full')).toBeVisible();
});

test('"when does he sit?" in the team table and the player view header', async ({ page }) => {
  await page.goto('/team/ORL?s=2025-26&w=10');
  const row = page.getByTestId('avg-row').filter({ hasText: 'Banchero' });
  await expect(row.getByTestId('sit-cell')).toHaveText(/^Q1 out ~\d+:\d0 \(\d+\)/);
  await page.goto('/player/ORL/1631094?s=2025-26&w=10');
  await expect(page.getByTestId('sit-line')).toContainText(/When he sits: Q1 out ~\d+:\d0 \(\d+\)/);
});

test('minutes trend: one mark per game with the team, values = per-game minutes, DNP and garbage-time marks', async ({ page }, info) => {
  await page.goto('/player/ORL/1630532?s=2025-26&b=0');
  const chart = page.getByTestId('minutes-trend');
  await expect(chart.getByTestId('trend-point')).toHaveCount(34);
  await expect(chart.getByTestId('trend-dnp')).toHaveCount(48);
  await expect(chart.getByTestId('trend-avg')).toBeAttached();
  const mins = (await chart.getByTestId('trend-point').evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-min'))))) as number[];
  const games = index('2025-26').filter((e) => e.id.startsWith('002')).map((e) => load('2025-26', e.id)).filter((g) => g.home.tri === 'ORL' || g.away.tri === 'ORL');
  const expected = games.flatMap((g) => {
    const p = g.players.find((x) => x.id === 1630532 && x.played && x.stints.length);
    return p ? [p.stints.reduce((x, [a, b]) => x + b - a, 0)] : [];
  });
  expect(mins.map((m) => Math.round(m))).toEqual(expected.map((m) => Math.round(m)));
  expect(await chart.locator('[data-garbage=true]').count()).toBeGreaterThan(0);
  await chart.screenshot({ path: `screenshots/minutes-trend-${info.project.name}.png` });
});

test('rest filter: back-to-back / rested in the filter chain with "based on N games"', async ({ page }) => {
  const { restForTeam } = await import('../src/domain/rest.ts');
  const idx = JSON.parse(readFileSync('data/2025-26/index.json', 'utf8')) as { id: string; date: string; home: string; away: string }[];
  const rest = restForTeam(idx, 'ORL');
  // rest days come from every game; the selection counts regular-season games (ids 002…)
  const b2b = [...rest].filter(([id, r]) => id.startsWith('002') && r.rest === 'b2b').length;
  await page.goto('/team/ORL?s=2025-26');
  await page.getByRole('button', { name: 'Back-to-back' }).click();
  await expect(page.getByTestId('selection-label')).toHaveText(`All 2025-26 games on the second night of a back-to-back · based on ${b2b} games · regular season`);
  await page.getByRole('button', { name: 'Rested' }).click();
  await expect(page.getByTestId('selection-label')).toHaveText(`All 2025-26 games with 1+ days of rest · based on ${82 - b2b} games · regular season`);
  await page.getByRole('button', { name: 'Last 5' }).click();
  await expect(page.getByTestId('selection-label')).toHaveText('Last 5 games with 1+ days of rest · based on 5 games · regular season');
  await page.getByRole('button', { name: 'Any rest' }).click();
  await expect(page.getByTestId('selection-label')).toHaveText('Last 5 games · based on 5 games · regular season');
});
