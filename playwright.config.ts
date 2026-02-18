import { defineConfig, devices } from '@playwright/test';

/**
 * Groot Finance UAT Test Configuration
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // Run tests sequentially for UAT
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Single worker for sequential tests
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list']
  ],
  use: {
    baseURL: 'http://localhost:3001',
    trace: 'on',
    screenshot: 'on',
    video: 'retain-on-failure',
    headless: true,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Run local dev server before starting the tests
  webServer: {
    command: 'npm run dev:next-only',
    url: 'http://localhost:3001',
    reuseExistingServer: true,
  },
});
