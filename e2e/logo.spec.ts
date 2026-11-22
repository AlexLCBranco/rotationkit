// Logo (desktop): favicon links, the files are served, and the header shows the logo next to the site name.

import { test, expect } from '@playwright/test';

test('favicon + touch icon are linked and served; the header shows the logo', async ({ page, request }) => {
  await page.goto('/');
  const hrefs = await page.locator('head link[rel~=icon], head link[rel=apple-touch-icon]').evaluateAll((els) => els.map((e) => e.getAttribute('href')));
  expect(hrefs).toEqual(['/favicon.svg', '/favicon-32.png', '/apple-touch-icon.png']);
  for (const [path, type] of [['/favicon.svg', 'image/svg+xml'], ['/favicon-32.png', 'image/png'], ['/apple-touch-icon.png', 'image/png']]) {
    const r = await request.get(path!);
    expect(r.status(), path).toBe(200);
    expect(r.headers()['content-type'], path).toContain(type!);
  }
  const logo = page.locator('.brand .brand-logo');
  await expect(logo).toBeVisible();
  expect(await logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await expect(page.locator('.brand')).toHaveText('Hoop Rotations');
});
