import { expect, type Locator, type Page } from '@playwright/test'
import type { E2EEnv } from './env'

export function buildRunMarker(prefix: string): string {
  const now = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)
  return `${prefix}-${now}-${Math.random().toString(16).slice(2, 8)}`
}

export async function gotoWorkspace(page: Page, date: string): Promise<void> {
  await page.goto(`/workspace?date=${date}`)
  await expect(page.getByLabel('workspace-layout')).toBeVisible()
}

async function fillSetupForm(page: Page, env: E2EEnv): Promise<void> {
  await page.getByTestId('auth-setup-repo-input').fill(`${env.owner}/${env.repo}`)
  await page.getByTestId('auth-setup-branch-input').fill(env.branch)
  await page.getByTestId('auth-setup-token-input').fill(env.token)
  await page.getByTestId('auth-setup-password-input').fill(env.masterPassword)
  await page.getByTestId('auth-setup-submit').click()
}

async function fillUnlockForm(page: Page, env: E2EEnv): Promise<void> {
  await page.getByTestId('auth-unlock-password-input').fill(env.masterPassword)
  await page.getByTestId('auth-unlock-submit').click()
}

async function fillRefreshForm(page: Page, env: E2EEnv): Promise<void> {
  await page.getByTestId('auth-refresh-token-input').fill(env.token)
  const passwordInput = page.getByTestId('auth-refresh-password-input')
  if (await passwordInput.isVisible()) {
    await passwordInput.fill(env.masterPassword)
  }
  await page.getByTestId('auth-refresh-submit').click()
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
      await fillUnlockForm(page, env)
      continue
    }

    if (await page.getByTestId('auth-refresh-submit').isVisible()) {
      await fillRefreshForm(page, env)
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

export async function writeDailyContent(page: Page, content: string): Promise<void> {
  const editor = dailyEditorLocator(page)
  await expect(editor).toBeVisible()

  await editor.fill(content)

  await expect(page.getByText('本地已保存')).toBeVisible({ timeout: 15_000 })
}

export async function waitForDailyDiaryPersisted(
  page: Page,
  date: string,
  expectedContentFragment: string,
): Promise<void> {
  const entryId = `daily:${date}`

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
