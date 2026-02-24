import { expect, type Locator, type Page } from '@playwright/test'
import type { E2EEnv } from './env'

export type AuthStage = 'checking' | 'needs-setup' | 'needs-unlock' | 'needs-token-refresh' | 'ready'

export interface EnsureReadySessionOptions {
  totalTimeoutMs?: number
  retryIntervalMs?: number
}

export interface WaitForSyncIdleOptions {
  timeoutMs?: number
}

export const CONFIG_STORAGE_KEY = 'trace-diary:app-config'
export const AUTH_LOCK_STATE_KEY = 'trace-diary:auth:lock-state'
export const AUTH_PASSWORD_EXPIRY_KEY = 'trace-diary:auth:password-expiry'
export const AUTH_UNLOCK_SECRET_KEY = 'trace-diary:auth:unlock-secret'
export const AUTH_UNLOCKED_TOKEN_KEY = 'trace-diary:auth:unlocked-token'

export function buildRunMarker(prefix: string): string {
  const now = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)
  return `${prefix}-${now}-${Math.random().toString(16).slice(2, 8)}`
}

export async function gotoDiary(page: Page, date: string): Promise<void> {
  await page.goto(`/diary?date=${date}`)
  const diaryLayout = page.getByLabel('diary-layout')
  const entryAuthModal = page.getByLabel('entry-auth-modal')
  const authModal = page.getByLabel('auth-modal')

  await expect
    .poll(
      async () => {
        if (await diaryLayout.isVisible().catch(() => false)) {
          return 'diary'
        }
        if (await entryAuthModal.isVisible().catch(() => false)) {
          return 'entry'
        }
        if (await authModal.isVisible().catch(() => false)) {
          return 'auth'
        }
        return 'pending'
      },
      { timeout: 15_000 },
    )
    .not.toBe('pending')
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
  payload: { repoInput?: string; giteeBranch?: string; token: string; masterPassword?: string },
): Promise<void> {
  if (payload.repoInput !== undefined) {
    await page.getByTestId('auth-refresh-repo-input').fill(payload.repoInput)
  }
  if (payload.giteeBranch !== undefined) {
    await page.getByTestId('auth-refresh-branch-input').fill(payload.giteeBranch)
  }
  await page.getByTestId('auth-refresh-token-input').fill(payload.token)
  const passwordInput = page.getByTestId('auth-refresh-password-input')
  if (await passwordInput.isVisible()) {
    await passwordInput.fill(payload.masterPassword ?? '')
  }
  await page.getByTestId('auth-refresh-submit').click()
}

function getAuthStageTitle(stage: AuthStage): string {
  switch (stage) {
    case 'needs-setup':
      return '首次配置'
    case 'needs-unlock':
      return '解锁会话'
    case 'needs-token-refresh':
      return '更新 Token'
    case 'checking':
      return '处理中'
    case 'ready':
      return '设置'
    default:
      return '设置'
  }
}

async function detectAuthStageFromModal(authModal: Locator): Promise<AuthStage | 'unknown'> {
  if (await authModal.getByTestId('auth-setup-submit').isVisible().catch(() => false)) {
    return 'needs-setup'
  }
  if (await authModal.getByTestId('auth-unlock-submit').isVisible().catch(() => false)) {
    return 'needs-unlock'
  }
  if (await authModal.getByTestId('auth-refresh-submit').isVisible().catch(() => false)) {
    return 'needs-token-refresh'
  }
  if (await authModal.getByRole('heading', { name: '处理中' }).isVisible().catch(() => false)) {
    return 'checking'
  }
  if (await authModal.getByRole('heading', { name: '设置' }).isVisible().catch(() => false)) {
    return 'ready'
  }
  return 'unknown'
}

export async function expectAuthStage(page: Page, expected: AuthStage | RegExp): Promise<void> {
  const authModal = page.getByLabel('auth-modal')

  await expect(authModal).toBeVisible({ timeout: 30_000 })

  if (expected instanceof RegExp) {
    await expect(authModal).toContainText(expected)
  } else {
    await expect(authModal.getByRole('heading', { name: getAuthStageTitle(expected) })).toBeVisible()
  }
}

export async function expectSessionReady(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'TraceDiary' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('navigation', { name: '应用主导航' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByLabel('entry-auth-modal')).toHaveCount(0)
  await expect(page.getByLabel('auth-modal')).toHaveCount(0)
}

export async function ensureReadySession(
  page: Page,
  env: E2EEnv,
  options: EnsureReadySessionOptions = {},
): Promise<void> {
  const initialUrl = page.url()
  const totalTimeoutMs = Math.max(30_000, options.totalTimeoutMs ?? 90_000)
  const retryIntervalMs = Math.max(250, options.retryIntervalMs ?? 300)
  const authModal = page.getByLabel('auth-modal')
  const entryAuthModal = page.getByLabel('entry-auth-modal')
  const appHeader = page.getByRole('heading', { name: 'TraceDiary' }).first()
  const deadline = Date.now() + totalTimeoutMs
  let lastStage = 'unknown'
  let lastAuthError: string | null = null

  while (Date.now() < deadline) {
    const isUnlocked = await page
      .evaluate((key) => localStorage.getItem(key) === 'unlocked', AUTH_LOCK_STATE_KEY)
      .catch(() => false)
    const headerVisible = await appHeader.isVisible().catch(() => false)
    const modalVisible = await authModal.isVisible().catch(() => false)
    const entryModalVisible = await entryAuthModal.isVisible().catch(() => false)
    if (isUnlocked && headerVisible && !modalVisible && !entryModalVisible) {
      if (page.url() !== initialUrl) {
        await page.goto(initialUrl)
        await page.waitForTimeout(retryIntervalMs)
        continue
      }
      return
    }

    if (entryModalVisible) {
      const goSettingsFromEntry = page.getByTestId('entry-auth-go-settings-btn').first()
      if (await goSettingsFromEntry.isVisible().catch(() => false)) {
        await goSettingsFromEntry.click()
        await page.waitForTimeout(retryIntervalMs)
        continue
      }
      const isSettingsPage = await page
        .evaluate(() => window.location.pathname === '/settings')
        .catch(() => false)
      if (!isSettingsPage) {
        await page.goto('/settings')
        await page.waitForTimeout(retryIntervalMs)
        continue
      }
      await page.waitForTimeout(retryIntervalMs)
      continue
    }

    if (!modalVisible) {
      if (await page.getByTestId('auth-setup-submit').isVisible().catch(() => false)) {
        await fillSetupForm(page, env)
        await page.waitForTimeout(retryIntervalMs)
        continue
      }

      const isSettingsPage = await page
        .evaluate(() => window.location.pathname === '/settings')
        .catch(() => false)
      if (!isSettingsPage) {
        await page.goto('/settings')
        await page.waitForTimeout(retryIntervalMs)
        continue
      }

      await page.waitForTimeout(retryIntervalMs)
      continue
    }

    lastStage = await detectAuthStageFromModal(authModal)

    const modalAlert = authModal.getByRole('alert').first()
    if (await modalAlert.isVisible().catch(() => false)) {
      const text = (await modalAlert.textContent().catch(() => null))?.trim()
      if (text) {
        lastAuthError = text
      }
    }

    if (await page.getByTestId('auth-setup-submit').isVisible()) {
      await fillSetupForm(page, env)
      await page.waitForTimeout(retryIntervalMs)
      continue
    }

    if (await page.getByTestId('auth-unlock-submit').isVisible()) {
      await submitUnlock(page, env.masterPassword)
      await page.waitForTimeout(retryIntervalMs)
      continue
    }

    if (await page.getByTestId('auth-refresh-submit').isVisible()) {
      await submitRefreshToken(page, {
        token: env.token,
        masterPassword: env.masterPassword,
      })
      await page.waitForTimeout(retryIntervalMs)
      continue
    }

    await page.waitForTimeout(retryIntervalMs)
  }

  const unlockedAtEnd = await page
    .evaluate((key) => localStorage.getItem(key) === 'unlocked', AUTH_LOCK_STATE_KEY)
    .catch(() => false)
  if (unlockedAtEnd && (await appHeader.isVisible().catch(() => false))) {
    await expect(authModal).toBeHidden({ timeout: 15_000 })
    return
  }

  const finalStage = await detectAuthStageFromModal(authModal).catch(() => lastStage)

  const finalError = await authModal
    .getByRole('alert')
    .first()
    .textContent()
    .then((text) => text?.trim() || lastAuthError || '无')
    .catch(() => lastAuthError || '无')

  throw new Error(`会话未就绪（${totalTimeoutMs}ms）：stage=${finalStage}，authError=${finalError}`)
}

async function resolveVisibleEditor(
  sourceEditor: Locator,
  wysiwygEditor: Locator,
): Promise<Locator> {
  if (await sourceEditor.isVisible().catch(() => false)) {
    return sourceEditor
  }
  await expect(wysiwygEditor).toBeVisible()
  return wysiwygEditor
}

function parseDiaryDateFromUrl(page: Page): string | null {
  try {
    const url = new URL(page.url())
    const date = url.searchParams.get('date')
    return date && /^\d{4}-\d{2}-\d{2}$/u.test(date) ? date : null
  } catch {
    return null
  }
}

function parseYearlyYearFromUrl(page: Page): number | null {
  try {
    const url = new URL(page.url())
    const match = url.pathname.match(/\/yearly\/(\d{4})$/u)
    if (!match) {
      return null
    }
    const year = Number.parseInt(match[1], 10)
    return Number.isFinite(year) ? year : null
  } catch {
    return null
  }
}

export async function writeDailyContent(page: Page, content: string): Promise<void> {
  const editor = await resolveVisibleEditor(
    page.locator('textarea[data-testid="daily-editor"]').first(),
    page.locator('[data-testid="daily-editor"] .ProseMirror').first(),
  )
  await editor.fill(content)
  const date = parseDiaryDateFromUrl(page)
  if (date) {
    await waitForDailyDiaryPersisted(page, date, content)
    return
  }
  await expect(page.getByText('本地保存异常')).toHaveCount(0)
}

export async function writeYearlyContent(page: Page, content: string): Promise<void> {
  const editor = await resolveVisibleEditor(
    page.locator('section[aria-label="yearly-summary-page"] textarea').first(),
    page.locator('[aria-label="yearly-summary-page"] .ProseMirror').first(),
  )
  await editor.fill(content)
  const year = parseYearlyYearFromUrl(page)
  if (year !== null) {
    await waitForYearlyPersisted(page, year, content)
    return
  }
  await expect(page.getByText('本地保存异常')).toHaveCount(0)
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
  await expect(page.getByTestId('push-status-pill')).toContainText('Push：成功', { timeout: 30_000 })
}

export async function expectManualSyncError(page: Page, patterns: RegExp[]): Promise<void> {
  const error = page.getByTestId('toast-push')
  await expect(error).toBeVisible({ timeout: 20_000 })

  const text = (await error.textContent()) ?? ''
  const matched = patterns.some((pattern) => pattern.test(text))
  expect(matched).toBeTruthy()
}

export async function waitForSyncIdle(page: Page, options: WaitForSyncIdleOptions = {}): Promise<void> {
  await expect(page.getByTestId('push-status-pill')).not.toContainText('Push：进行中', {
    timeout: options.timeoutMs ?? 30_000,
  })
}
