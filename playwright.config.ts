import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

// BrowserStack CDP endpoint configuration (Task T013)
const browserStackCaps = (browser: string, os: string, osVersion: string, device: string) => ({
  browser,
  os,
  os_version: osVersion,
  device,
  'browserstack.username': process.env.BROWSERSTACK_USERNAME,
  'browserstack.accessKey': process.env.BROWSERSTACK_ACCESS_KEY,
  'browserstack.local': 'false',
});

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
  },

  projects: [
    // Local development projects
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    // BrowserStack mobile projects (per research.md device matrix)
    // Run with: npx playwright test --project="ios-safari" (requires BrowserStack credentials)
    {
      name: 'ios-safari',
      use: {
        browserName: 'webkit',
        connectOptions: {
          wsEndpoint: `wss://cdp.browserstack.com/playwright?caps=${encodeURIComponent(
            JSON.stringify(browserStackCaps('playwright-webkit', 'ios', '17', 'iPhone 14'))
          )}`,
        },
      },
    },
    {
      name: 'ios-safari-se',
      use: {
        browserName: 'webkit',
        connectOptions: {
          wsEndpoint: `wss://cdp.browserstack.com/playwright?caps=${encodeURIComponent(
            JSON.stringify(browserStackCaps('playwright-webkit', 'ios', '17', 'iPhone SE 2022'))
          )}`,
        },
      },
    },
    {
      name: 'android-chrome',
      use: {
        browserName: 'chromium',
        connectOptions: {
          wsEndpoint: `wss://cdp.browserstack.com/playwright?caps=${encodeURIComponent(
            JSON.stringify(browserStackCaps('playwright-chromium', 'android', '13.0', 'Samsung Galaxy A14'))
          )}`,
        },
      },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
