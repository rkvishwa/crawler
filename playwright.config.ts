import { defineConfig, devices } from '@playwright/test';

/**
 * Optional default origin for `page.goto('/path')`. The vote smoke spec also reads
 * `process.env.VOTE_SMOKE_BASE_URL` directly and skips if unset.
 * For load or repeated runs, use staging only—never batch against production.
 */
function normalizeOrigin(raw: string | undefined): string | undefined {
  if (!raw?.trim()) return undefined;
  let s = raw.trim().replace(/\/$/, '');
  if (s.endsWith('/buildathon/vote')) {
    s = s.slice(0, -'/buildathon/vote'.length);
  }
  return s.replace(/\/$/, '') || undefined;
}

const baseURL = normalizeOrigin(process.env.VOTE_SMOKE_BASE_URL);

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    ...(baseURL ? { baseURL } : {}),
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
