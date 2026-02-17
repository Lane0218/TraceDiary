import { defineConfig, devices } from '@playwright/test'

const HOST = '127.0.0.1'
const PORT = 4173

export default defineConfig({
  testDir: '../e2e/specs',
  timeout: 90_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ['line'],
    ['html', { open: 'never', outputFolder: 'playwright-report/compatibility' }],
  ],
  use: {
    baseURL: `http://${HOST}:${PORT}`,
    trace: 'off',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chrome-desktop',
      use: {
        ...devices['Desktop Chrome'],
        browserName: 'chromium',
      },
    },
    {
      name: 'edge-desktop',
      use: {
        ...devices['Desktop Edge'],
        browserName: 'chromium',
      },
    },
    {
      name: 'safari-desktop',
      use: {
        ...devices['Desktop Safari'],
        browserName: 'webkit',
      },
    },
    {
      name: 'firefox-desktop',
      use: {
        ...devices['Desktop Firefox'],
        browserName: 'firefox',
      },
    },
    {
      name: 'android-pixel-7',
      use: {
        ...devices['Pixel 7'],
        browserName: 'chromium',
      },
    },
    {
      name: 'ios-iphone-14',
      use: {
        ...devices['iPhone 14'],
        browserName: 'webkit',
      },
    },
  ],
  webServer: {
    command: `npm run build && npm run preview -- --host ${HOST} --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: true,
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 180_000,
  },
})
