import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 1,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  webServer: { command: 'npm.cmd run preview -- --host 127.0.0.1 --port 4173', port: 4173, reuseExistingServer: true, timeout: 120_000 },
  projects: [{ name: 'iPhone', use: { ...devices['iPhone 13'] } }, { name: 'landscape', use: { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true } }]
});
