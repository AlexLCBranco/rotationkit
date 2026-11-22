// Draws the site-wide link preview image (RK-9): public/og.png, 1200 × 630, dark, the logo plus the site's name and
// its one-line description (both from src/app/site.ts, so a rename is: change SITE_NAME, run this, commit the PNG).
// Usage: npx tsx scripts/make-og-image.ts

import { existsSync, readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { OG_IMAGE, SITE_NAME, SITE_TAGLINE } from '../src/app/site.ts';

const SESSION_CHROMIUM = '/opt/pw-browsers/chromium';
const logo = readFileSync('public/favicon.svg', 'utf8');
const bar = (x: number, y: number, w: number, c: string) => `<i style="left:${x}px;top:${y}px;width:${w}px;background:${c}"></i>`;
const html = `<!doctype html><html><body style="margin:0;width:${OG_IMAGE.width}px;height:${OG_IMAGE.height}px;background:#111;color:#f2f2f2;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;position:relative;overflow:hidden">
<style>i{position:absolute;height:26px;border-radius:13px;opacity:.9}</style>
<div style="position:absolute;left:90px;top:120px;display:flex;align-items:center;gap:36px">
  <div style="width:150px;height:150px">${logo.replace('<svg ', '<svg width="150" height="150" ')}</div>
  <div style="font-size:96px;font-weight:700;letter-spacing:-1px">${SITE_NAME}</div>
</div>
<div style="position:absolute;left:90px;top:318px;font-size:44px;color:#c9c9c9;max-width:1020px;line-height:1.25">${SITE_TAGLINE}</div>
${bar(90, 470, 330, '#22c55e')}${bar(470, 470, 210, '#22c55e')}${bar(760, 470, 350, '#eab308')}
${bar(250, 516, 300, '#22c55e')}${bar(620, 516, 190, '#ef4444')}${bar(900, 516, 210, '#22c55e')}
${bar(90, 562, 240, '#eab308')}${bar(400, 562, 330, '#22c55e')}${bar(800, 562, 240, '#22c55e')}
</body></html>`;

const browser = await chromium.launch(existsSync(SESSION_CHROMIUM) ? { executablePath: SESSION_CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: OG_IMAGE.width, height: OG_IMAGE.height }, deviceScaleFactor: 1 });
await page.setContent(html);
await page.screenshot({ path: `public${OG_IMAGE.path}` });
await browser.close();
console.log(`public${OG_IMAGE.path} written (${OG_IMAGE.width} × ${OG_IMAGE.height})`);
