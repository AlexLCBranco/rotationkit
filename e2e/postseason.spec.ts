// RK-13 (desktop): play-in, playoff and Cup final games are tagged, open like any game, and never mix into
// regular-season averages; the "Regular season | Postseason" chip switches Averages, the player page, Leaders and
// Full Q4. Runs on the real postseason games in data/ (2025-26, added by the backfill); skipped while there are none.

import { test, expect } from '@playwright/test';
import { index, noSidewaysScroll, settle, trackErrors } from './helpers.ts';

const S = '2025-26';
const all = index(S);
const kind = (id: string) => ({ '004': 'playoffs', '005': 'play-in', '006': 'cup-final' })[id.slice(0, 3)];
const post = all.filter((e) => /^00[45]/.test(e.id));
const cupFinal = all.find((e) => e.id.startsWith('006'));
// The team with the most postseason games, and one of its games.
const count = new Map<string, number>();
for (const e of post) for (const t of [e.home, e.away]) count.set(t, (count.get(t) ?? 0) + 1);
const TEAM = [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? '';
const mine = post.filter((e) => e.home === TEAM || e.away === TEAM);
const regular = all.filter((e) => e.id.startsWith('002') && (e.home === TEAM || e.away === TEAM));
const TAG: Record<string, string> = { playoffs: 'PLAYOFFS', 'play-in': 'PLAY-IN', 'cup-final': 'CUP FINAL' };

test.describe('RK-13: postseason games', () => {
  test.skip(post.length === 0, 'no postseason games in data/ yet (the backfill adds them)');

  test('a postseason game opens like any game, with its tag in the header, the list and By day', async ({ page }) => {
    const errors = trackErrors(page);
    const g = mine.at(-1)!;
    await page.goto(`/game/${g.id}?t=${TEAM}`);
    await settle(page);
    await expect(page.locator('h1')).toContainText(`${g.away} ${g.as} @ ${g.home} ${g.hs}`);
    await expect(page.locator('h1').getByTestId('kind-tag')).toHaveText(new RegExp(`^${TAG[kind(g.id)!]}`));
    await expect(page.getByTestId('gc-player-row').first()).toBeVisible();
    // the team's list: regular-season games untagged, postseason ones tagged
    await expect(page.locator(`[data-testid=list-row][data-id="${g.id}"]`).getByTestId('kind-tag')).toHaveText(new RegExp(`^${TAG[kind(g.id)!]}`));
    await expect(page.locator(`[data-testid=list-row][data-id="${regular.at(-1)!.id}"]`).getByTestId('kind-tag')).toHaveCount(0);
    await expect(page.getByTestId('list-row')).toHaveCount(all.filter((e) => e.home === TEAM || e.away === TEAM).length);
    // By day
    await page.goto(`/games?view=day&date=${g.date}&s=${S}`);
    await settle(page);
    await expect(page.getByTestId('kind-tag').first()).toHaveText(new RegExp(`^${TAG[kind(g.id)!]}`));
    expect(errors).toEqual([]);
  });

  test('Averages: regular season by default (same N as before); the chip switches every table to the postseason', async ({ page }, info) => {
    await page.goto(`/team/${TEAM}?s=${S}`);
    await settle(page);
    const chips = page.getByTestId('set-chips');
    await expect(chips.getByRole('radio')).toHaveText(['Regular season', 'Postseason']);
    await expect(chips.locator('[aria-checked=true]')).toHaveText('Regular season');
    await expect(page.getByTestId('selection-label')).toHaveText(`All ${S} games · based on ${regular.length} games · regular season`);
    await chips.getByRole('radio', { name: 'Postseason' }).click();
    await expect(page).toHaveURL(/gs=post/);
    await expect(page.getByTestId('selection-label')).toHaveText(`All ${S} games · based on ${mine.length} game${mine.length === 1 ? '' : 's'} · postseason (play-in + playoffs)`);
    await expect(page.locator('.avg-table:not(.closers) summary')).toContainText('postseason (play-in + playoffs)');
    await noSidewaysScroll(page, 'averages, postseason');
    await page.screenshot({ path: `screenshots/postseason-averages-${info.project.name}.png`, fullPage: true });
    // a reload keeps it; a player link keeps it; back to regular drops it from the URL
    await page.reload();
    await settle(page);
    await expect(chips.locator('[aria-checked=true]')).toHaveText('Postseason');
    await page.getByTestId('player-link').first().click();
    await settle(page);
    await expect(page).toHaveURL(/\/player\/.*gs=post/);
    await expect(page.getByTestId('set-chips').locator('[aria-checked=true]')).toHaveText('Postseason');
    await expect(page.getByTestId('selection-label')).toContainText('postseason (play-in + playoffs)');
    await page.getByTestId('set-chips').getByRole('radio', { name: 'Regular season' }).click();
    await expect(page).not.toHaveURL(/gs=/);
    await expect(page.getByTestId('selection-label')).toContainText('· regular season');
  });

  test('Leaders and Full Q4: one set at a time, and the note says which', async ({ page }) => {
    await page.goto(`/leaders?s=${S}`);
    await settle(page);
    await expect(page.getByTestId('leaders-set')).toHaveText('regular season games only');
    const before = await page.getByTestId('leaders-note').textContent();
    await page.getByTestId('set-chips').getByRole('radio', { name: 'Postseason' }).click();
    await expect(page.getByTestId('leaders-set')).toHaveText('postseason (play-in + playoffs) games only');
    expect(await page.getByTestId('leaders-note').textContent()).not.toBe(before);
    await page.getByTestId('how-fullq4').click();
    await settle(page);
    await expect(page.getByTestId('set-chips').locator('[aria-checked=true]')).toHaveText('Postseason');
    await expect(page.getByTestId('fq-set')).toHaveText('Counts postseason (play-in + playoffs) games only.');
    await page.getByTestId('set-chips').getByRole('radio', { name: 'Regular season' }).click();
    await expect(page.getByTestId('fq-set')).toHaveText('Counts regular season games only.');
  });

  test('the Cup final is a single game only: tagged, in neither set', async ({ page }) => {
    test.skip(!cupFinal, 'no Cup final in data/');
    const g = cupFinal!;
    await page.goto(`/game/${g.id}`);
    await settle(page);
    await expect(page.locator('h1').getByTestId('kind-tag')).toHaveText('CUP FINAL');
    for (const team of [g.home, g.away]) {
      const reg = all.filter((e) => e.id.startsWith('002') && (e.home === team || e.away === team)).length;
      await page.goto(`/team/${team}?s=${S}`);
      await settle(page);
      await expect(page.getByTestId('selection-label')).toContainText(`based on ${reg} games · regular season`);
    }
  });
});

test('RK-13: a season without postseason games shows no chip, and its labels still say "regular season"', async ({ page }) => {
  test.skip(index('2026-27').some((e) => /^00[45]/.test(e.id)), '2026-27 has postseason games now');
  await page.goto('/team/ORL?s=2026-27');
  await settle(page);
  await expect(page.getByTestId('season-chips')).toBeVisible();
  await expect(page.getByTestId('set-chips')).toHaveCount(0);
  await expect(page.getByTestId('selection-label')).toContainText('· regular season');
  await page.goto('/leaders?s=2026-27');
  await settle(page);
  await expect(page.getByTestId('set-chips')).toHaveCount(0);
  await expect(page.getByTestId('leaders-set')).toHaveText('regular season games only');
});
