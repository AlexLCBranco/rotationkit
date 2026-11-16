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
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4173', trace: 'off' },
  webServer: { command: 'npm run preview', url: 'http://localhost:4173', reuseExistingServer: true, timeout: 60_000 },
  projects: [
    // Desktop only (phone tests removed 2026-11-14).
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 }, launchOptions } },
  ],
});
