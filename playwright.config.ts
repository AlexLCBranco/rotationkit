import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Claude Code cloud sessions ship one Chromium build at this path (the version Playwright downloads is not
// installable there); use it when present so `npm run e2e` works before pushing. CI installs its own and skips this.
const SESSION_CHROMIUM = '/opt/pw-browsers/chromium';
const launchOptions = existsSync(SESSION_CHROMIUM) ? { executablePath: SESSION_CHROMIUM } : {};

// Runs against the production build served by `vite preview` (same files Vercel serves).
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 2,
  // On GitHub's shared runners the timing tests (click under 100 ms, layout shift) are noisy: one retry there.
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4173', trace: 'off' },
  webServer: { command: 'npm run preview', url: 'http://localhost:4173', reuseExistingServer: true, timeout: 60_000 },
  projects: [
    // Desktop (1280 × 900): every spec except the phone ones.
    { name: 'desktop', testIgnore: /phone.*\.spec\.ts$/, use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 }, launchOptions } },
    // Phone (RK-4): Pixel 7 with touch at 390 × 844, the phone specs (e2e/phone*.spec.ts).
    { name: 'phone', testMatch: /phone.*\.spec\.ts$/, use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, launchOptions } },
  ],
});
