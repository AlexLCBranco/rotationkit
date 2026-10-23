import { defineConfig, devices } from '@playwright/test';

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
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } },
    // Desktop only from now on: tests tagged @desktop (new features) don't run on the phone project.
    { name: 'phone', grepInvert: /@desktop/, use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
  ],
});
