import { expect, test, type Locator, type Page } from '@playwright/test'
import { deriveAesKeyFromPassword, encryptWithAesGcm } from '../../src/services/crypto'
import {
  CONFIG_STORAGE_KEY,
  buildRunMarker,
  clickManualSync,
  ensureReadySession,
  expectSyncSuccess,
  gotoWorkspace,
  waitForDailyDiaryPersisted,
  waitForSyncIdle,
  writeDailyContent,
} from '../fixtures/app'
import { getE2EEnv } from '../fixtures/env'
import { armShaMismatchRace } from '../helpers/conflict'

const KEEP_LOCAL_DATE = '2100-01-01'
const KEEP_REMOTE_DATE = '2100-01-03'
const MERGE_DATE = '2100-01-04'
const RETRY_CONFLICT_DATE = '2100-01-05'

test.describe.configure({ timeout: 180_000 })

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

interface StoredKdfParams {
  algorithm: 'PBKDF2'
  hash: 'SHA-256'
  iterations: number
  salt: string
}

async function buildEncryptedDiaryContent(page: Page, masterPassword: string, plain: string): Promise<string> {
  const kdfParams = await page.evaluate((storageKey) => {
    const raw = localStorage.getItem(storageKey)
    if (!raw) {
      return null
    }
    const config = JSON.parse(raw) as {
      kdfParams?: StoredKdfParams
    }
    return config.kdfParams ?? null
  }, CONFIG_STORAGE_KEY)

  if (!kdfParams) {
    throw new Error('缺少 kdfParams，无法构造冲突远端密文')
  }

  const key = await deriveAesKeyFromPassword(masterPassword, kdfParams)
  return encryptWithAesGcm(plain, key)
}

async function syncMarker(
  page: Page,
  env: ReturnType<typeof getE2EEnv>,
  date: string,
  marker: string,
): Promise<void> {
  await writeDailyContent(page, `E2E ${marker}`)
  await waitForDailyDiaryPersisted(page, date, marker)
  await page.waitForTimeout(500)

  let lastError: unknown = null
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await clickManualSync(page)
      await expectSyncSuccess(page)
      await waitForSyncIdle(page, { timeoutMs: 45_000 })
      return
    } catch (error) {
      lastError = error
      if (page.isClosed()) {
        throw error
      }
      await waitForSyncIdle(page, { timeoutMs: 12_000 }).catch(() => undefined)
      await ensureReadySession(page, env, { totalTimeoutMs: 45_000 })
    }
  }

  throw lastError instanceof Error ? lastError : new Error('基线手动同步失败')
}

async function openConflictDialogWithReadableRemote(
  page: Page,
  env: ReturnType<typeof getE2EEnv>,
  params: {
    date: string
    localMarker: string
    remoteMarker: string
  },
): Promise<Locator> {
  // 先确保目标文件存在，后续手动上传会走 PUT + sha 分支。
  await syncMarker(page, env, params.date, buildRunMarker('conflict-base'))

  await writeDailyContent(page, `E2E ${params.localMarker}`)
  await waitForDailyDiaryPersisted(page, params.date, params.localMarker)
  await waitForSyncIdle(page)

  const remoteEncryptedContent = await buildEncryptedDiaryContent(page, env.masterPassword, `E2E ${params.remoteMarker}`)
  const dialog = page.getByTestId('conflict-dialog')
  const syncStatus = page.getByTestId('sync-status-pill')
  let opened = false
  let lastError: unknown = null
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const race = await armShaMismatchRace(page, {
      owner: env.owner,
      repo: env.repo,
      branch: env.branch,
      token: env.token,
      path: `${params.date}.md.enc`,
      conflictContent: remoteEncryptedContent,
      conflictMessage: `test: 构造可解密远端冲突 ${params.date}`,
      triggerTimeoutMs: 30_000,
    })

    try {
      await clickManualSync(page)
      await race.waitForTriggered()
      await expect(dialog).toBeVisible({ timeout: 8_000 })
      opened = true
      break
    } catch (error) {
      lastError = error
      if (await dialog.isVisible().catch(() => false)) {
        opened = true
        break
      }

      if (await syncStatus.textContent().then((text) => text?.includes('检测到冲突') ?? false).catch(() => false)) {
        await expect(dialog).toBeVisible({ timeout: 10_000 })
        opened = true
        break
      }

      if (!page.isClosed()) {
        await waitForSyncIdle(page, { timeoutMs: 8_000 }).catch(() => undefined)
      }
    } finally {
      await race.dispose()
    }
  }

  if (!opened) {
    throw lastError instanceof Error ? lastError : new Error('未能进入冲突处理弹窗')
  }

  await expect(dialog).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('sync-status-pill')).toContainText('检测到冲突', { timeout: 30_000 })
  await expect(dialog).toContainText(params.remoteMarker)
  return dialog
}

async function expectConflictResolved(page: Page, dialog: Locator): Promise<void> {
  await expect(dialog).toBeHidden({ timeout: 30_000 })
  await expect(page.getByTestId('sync-status-pill')).not.toContainText('检测到冲突', { timeout: 30_000 })
  await waitForSyncIdle(page, { timeoutMs: 45_000 })
  await expectSyncSuccess(page)
}

test('发生 sha mismatch 时可选择保留本地版本并完成同步', async ({ page }) => {
  const env = getE2EEnv()
  const localMarker = buildRunMarker('conflict-local-choice')
  const remoteMarker = buildRunMarker('conflict-remote-shadow')

  await gotoWorkspace(page, KEEP_LOCAL_DATE)
  await ensureReadySession(page, env)

  const dialog = await openConflictDialogWithReadableRemote(page, env, {
    date: KEEP_LOCAL_DATE,
    localMarker,
    remoteMarker,
  })

  await page.getByTestId('conflict-keep-local').click()
  await expectConflictResolved(page, dialog)
})

test('发生 sha mismatch 时可选择保留远端版本并完成同步', async ({ page }) => {
  const env = getE2EEnv()
  const localMarker = buildRunMarker('conflict-local-shadow')
  const remoteMarker = buildRunMarker('conflict-remote-choice')

  await gotoWorkspace(page, KEEP_REMOTE_DATE)
  await ensureReadySession(page, env)

  const dialog = await openConflictDialogWithReadableRemote(page, env, {
    date: KEEP_REMOTE_DATE,
    localMarker,
    remoteMarker,
  })

  await page.getByTestId('conflict-keep-remote').click()
  await expectConflictResolved(page, dialog)
})

test('发生 sha mismatch 时可编辑合并内容并提交成功', async ({ page }) => {
  const env = getE2EEnv()
  const localMarker = buildRunMarker('conflict-local-merge')
  const remoteMarker = buildRunMarker('conflict-remote-merge')
  const mergedMarker = buildRunMarker('conflict-merged-result')

  await gotoWorkspace(page, MERGE_DATE)
  await ensureReadySession(page, env)

  const dialog = await openConflictDialogWithReadableRemote(page, env, {
    date: MERGE_DATE,
    localMarker,
    remoteMarker,
  })

  const mergeInput = page.getByTestId('conflict-merge-textarea')
  await expect(mergeInput).toHaveValue(new RegExp(escapeForRegExp(remoteMarker)))

  const mergedContent = [`E2E ${mergedMarker}`, `本地:${localMarker}`, `远端:${remoteMarker}`].join('\n')
  await mergeInput.fill(mergedContent)
  await page.getByTestId('conflict-merge-submit').click()
  await expectConflictResolved(page, dialog)
})

test('冲突处理完成后再次发生冲突仍可再次处理并成功同步', async ({ page }) => {
  const env = getE2EEnv()
  const firstLocalMarker = buildRunMarker('conflict-local-first')
  const firstRemoteMarker = buildRunMarker('conflict-remote-first')
  const secondLocalMarker = buildRunMarker('conflict-local-second')
  const secondRemoteMarker = buildRunMarker('conflict-remote-second')

  await gotoWorkspace(page, RETRY_CONFLICT_DATE)
  await ensureReadySession(page, env)

  const firstDialog = await openConflictDialogWithReadableRemote(page, env, {
    date: RETRY_CONFLICT_DATE,
    localMarker: firstLocalMarker,
    remoteMarker: firstRemoteMarker,
  })
  await page.getByTestId('conflict-keep-local').click()
  await expectConflictResolved(page, firstDialog)

  const secondDialog = await openConflictDialogWithReadableRemote(page, env, {
    date: RETRY_CONFLICT_DATE,
    localMarker: secondLocalMarker,
    remoteMarker: secondRemoteMarker,
  })
  await page.getByTestId('conflict-keep-remote').click()
  await expectConflictResolved(page, secondDialog)
})
