import { defineConfig, devices } from '@playwright/test'

const HOST = '127.0.0.1'
const PORT = 4173

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim()
  if (!raw) {
    return fallback
  }

  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }
  return parsed
}

function readNonNegativeIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim()
  if (!raw) {
    return fallback
  }

  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback
  }
  return parsed
}

function readTraceModeEnv(
  name: string,
  fallback: 'off' | 'on' | 'on-first-retry' | 'on-all-retries' | 'retain-on-failure' | 'retain-on-first-failure',
): 'off' | 'on' | 'on-first-retry' | 'on-all-retries' | 'retain-on-failure' | 'retain-on-first-failure' {
  const raw = process.env[name]?.trim()
  if (!raw) {
    return fallback
  }

  switch (raw) {
    case 'off':
    case 'on':
    case 'on-first-retry':
    case 'on-all-retries':
    case 'retain-on-failure':
    case 'retain-on-first-failure':
      return raw
    default:
      return fallback
  }
}

export default defineConfig({
  testDir: './e2e/specs',
  timeout: 90_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  workers: readPositiveIntEnv('PW_WORKERS', 2),
  retries: readNonNegativeIntEnv('PW_RETRIES', 1),
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://${HOST}:${PORT}`,
    trace: readTraceModeEnv('PW_TRACE_MODE', 'on-first-retry'),
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
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
