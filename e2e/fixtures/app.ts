import { expect, type Locator, type Page } from '@playwright/test'
import type { E2EEnv } from './env'

export type AuthStage = 'checking' | 'needs-setup' | 'needs-unlock' | 'needs-token-refresh' | 'ready'

export const CONFIG_STORAGE_KEY = 'trace-diary:app-config'
export const AUTH_LOCK_STATE_KEY = 'trace-diary:auth:lock-state'
export const AUTH_PASSWORD_EXPIRY_KEY = 'trace-diary:auth:password-expiry'
export const AUTH_UNLOCK_SECRET_KEY = 'trace-diary:auth:unlock-secret'
export const AUTH_UNLOCKED_TOKEN_KEY = 'trace-diary:auth:unlocked-token'

export function buildRunMarker(prefix: string): string {
  const now = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)
  return `${prefix}-${now}-${Math.random().toString(16).slice(2, 8)}`
}

export async function gotoWorkspace(page: Page, date: string): Promise<void> {
  await page.goto(`/workspace?date=${date}`)
  await expect(page.getByLabel('workspace-layout')).toBeVisible()
}

export async function gotoYearly(page: Page, year: number): Promise<void> {
  await page.goto(`/yearly/${year}`)
  await expect(page.getByLabel('yearly-summary-page')).toBeVisible()
}

async function fillSetupForm(page: Page, env: E2EEnv): Promise<void> {
  await page.getByTestId('auth-setup-repo-input').fill(`${env.owner}/${env.repo}`)
  await page.getByTestId('auth-setup-branch-input').fill(env.branch)
  await page.getByTestId('auth-setup-token-input').fill(env.token)
  await page.getByTestId('auth-setup-password-input').fill(env.masterPassword)
  await page.getByTestId('auth-setup-submit').click()
}

export async function submitUnlock(page: Page, masterPassword: string): Promise<void> {
  await page.getByTestId('auth-unlock-password-input').fill(masterPassword)
  await page.getByTestId('auth-unlock-submit').click()
}

export async function submitRefreshToken(
  page: Page,
  payload: { token: string; masterPassword?: string },
): Promise<void> {
  await page.getByTestId('auth-refresh-token-input').fill(payload.token)
  const passwordInput = page.getByTestId('auth-refresh-password-input')
  if (await passwordInput.isVisible()) {
    await passwordInput.fill(payload.masterPassword ?? '')
  }
  await page.getByTestId('auth-refresh-submit').click()
}

export async function expectAuthStage(page: Page, expected: AuthStage | RegExp): Promise<void> {
  const authModal = page.getByLabel('auth-modal')
  const stageLine = authModal.locator('p').filter({ hasText: /^状态：/u }).first()

  await expect(authModal).toBeVisible({ timeout: 30_000 })
  await expect(stageLine).toBeVisible()

  if (expected instanceof RegExp) {
    await expect(stageLine).toContainText(expected)
  } else {
    await expect(stageLine).toContainText(`状态：${expected}`)
  }
}

export async function expectSessionReady(page: Page): Promise<void> {
  await expect(page.getByText('会话：已解锁')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByLabel('auth-modal')).toHaveCount(0)
}

export async function ensureReadySession(page: Page, env: E2EEnv): Promise<void> {
  const authModal = page.getByLabel('auth-modal')
  const sessionReady = page.getByText('会话：已解锁')

  for (let attempt = 0; attempt < 6; attempt += 1) {
    if (await sessionReady.isVisible()) {
      break
    }

    if (!(await authModal.isVisible())) {
      await page.waitForTimeout(300)
      continue
    }

    if (await page.getByTestId('auth-setup-submit').isVisible()) {
      await fillSetupForm(page, env)
      continue
    }

    if (await page.getByTestId('auth-unlock-submit').isVisible()) {
      await submitUnlock(page, env.masterPassword)
      continue
    }

    if (await page.getByTestId('auth-refresh-submit').isVisible()) {
      await submitRefreshToken(page, {
        token: env.token,
        masterPassword: env.masterPassword,
      })
      continue
    }

    await page.waitForTimeout(300)
  }

  await expect(sessionReady).toBeVisible({ timeout: 30_000 })
  await expect(authModal).toBeHidden()
}

function dailyEditorLocator(page: Page): Locator {
  return page.locator('[data-testid="daily-editor"] .ProseMirror').first()
}

function yearlyEditorLocator(page: Page): Locator {
  return page.locator('[aria-label="yearly-summary-page"] .ProseMirror').first()
}

export async function writeDailyContent(page: Page, content: string): Promise<void> {
  const editor = dailyEditorLocator(page)
  await expect(editor).toBeVisible()

  await editor.fill(content)

  await expect(page.getByText('本地已保存')).toBeVisible({ timeout: 15_000 })
}

export async function writeYearlyContent(page: Page, content: string): Promise<void> {
  const editor = yearlyEditorLocator(page)
  await expect(editor).toBeVisible()

  await editor.fill(content)

  await expect(page.getByText('本地已保存')).toBeVisible({ timeout: 15_000 })
}

async function waitForDiaryPersisted(
  page: Page,
  entryId: string,
  expectedContentFragment: string,
): Promise<void> {
  await page.waitForFunction(
    async ({ dbName, storeName, key, expectedFragment }) => {
      const readContent = await new Promise<string | null>((resolve, reject) => {
        const request = indexedDB.open(dbName, 1)

        request.onerror = () => {
          reject(request.error ?? new Error('open indexeddb failed'))
        }

        request.onsuccess = () => {
          const db = request.result
          const tx = db.transaction(storeName, 'readonly')
          const store = tx.objectStore(storeName)
          const getRequest = store.get(key)

          getRequest.onerror = () => {
            reject(getRequest.error ?? new Error('get diary failed'))
          }
          getRequest.onsuccess = () => {
            const record = getRequest.result as { content?: unknown } | undefined
            resolve(typeof record?.content === 'string' ? record.content : null)
          }
        }
      })

      return typeof readContent === 'string' && readContent.includes(expectedFragment)
    },
    {
      dbName: 'TraceDiary',
      storeName: 'diaries',
      key: entryId,
      expectedFragment: expectedContentFragment,
    },
    { timeout: 15_000 },
  )
}

export async function waitForDailyDiaryPersisted(
  page: Page,
  date: string,
  expectedContentFragment: string,
): Promise<void> {
  await waitForDiaryPersisted(page, `daily:${date}`, expectedContentFragment)
}

export async function waitForYearlyPersisted(
  page: Page,
  year: number,
  expectedContentFragment: string,
): Promise<void> {
  await waitForDiaryPersisted(page, `summary:${year}`, expectedContentFragment)
}

export async function clickManualSync(page: Page): Promise<void> {
  await page.getByTestId('manual-sync-button').click()
}

export async function expectSyncSuccess(page: Page): Promise<void> {
  await expect(page.getByTestId('sync-status-pill')).toContainText('云端已同步', { timeout: 30_000 })
}

export async function expectManualSyncError(page: Page, patterns: RegExp[]): Promise<void> {
  const error = page.getByTestId('manual-sync-error')
  await expect(error).toBeVisible({ timeout: 20_000 })

  const text = (await error.textContent()) ?? ''
  const matched = patterns.some((pattern) => pattern.test(text))
  expect(matched).toBeTruthy()
}

export async function waitForSyncIdle(page: Page): Promise<void> {
  await expect(page.getByTestId('sync-status-pill')).not.toContainText('云端同步中', { timeout: 30_000 })
}
