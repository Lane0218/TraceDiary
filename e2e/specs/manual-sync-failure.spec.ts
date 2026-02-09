import { expect, test } from '@playwright/test'
import {
  buildRunMarker,
  clickManualSync,
  ensureReadySession,
  expectManualSyncError,
  expectSyncSuccess,
  gotoWorkspace,
  waitForDailyDiaryPersisted,
  writeDailyContent,
} from '../fixtures/app'
import { getE2EEnv } from '../fixtures/env'

const TEST_DATE = '2099-12-31'

test('离线时手动上传失败后，恢复在线应自动重试并同步成功', async ({ page, context }) => {
  const env = getE2EEnv()
  const marker = buildRunMarker('manual-sync-offline')

  await gotoWorkspace(page, TEST_DATE)
  await ensureReadySession(page, env)
  await writeDailyContent(page, `E2E ${marker}`)
  await waitForDailyDiaryPersisted(page, TEST_DATE, marker)
  await page.waitForTimeout(800)

  await context.setOffline(true)
  await clickManualSync(page)
  await expectManualSyncError(page, [/网络/u, /上传/u, /重试/u])
  await expect(page.getByTestId('sync-status-pill')).toContainText('离线待重试', { timeout: 30_000 })

  await context.setOffline(false)
  await expect(page.getByTestId('sync-status-pill')).not.toContainText('离线待重试', { timeout: 30_000 })
  await expectSyncSuccess(page)
})
