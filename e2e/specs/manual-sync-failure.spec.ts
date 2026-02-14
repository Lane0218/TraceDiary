import { expect, test } from '@playwright/test'
import {
  buildRunMarker,
  clickManualSync,
  ensureReadySession,
  expectManualSyncError,
  expectSyncSuccess,
  gotoDiary,
  waitForDailyDiaryPersisted,
  writeDailyContent,
} from '../fixtures/app'
import { getE2EEnv } from '../fixtures/env'

const TEST_DATE = '2099-12-31'

test('离线失败恢复在线后，可再次手动上传成功', async ({ page, context }) => {
  const env = getE2EEnv()
  const marker = buildRunMarker('manual-sync-offline')

  await gotoDiary(page, TEST_DATE)
  await ensureReadySession(page, env)
  await writeDailyContent(page, `E2E ${marker}`)
  await waitForDailyDiaryPersisted(page, TEST_DATE, marker)
  await page.waitForTimeout(800)

  await context.setOffline(true)
  await clickManualSync(page)
  await expectManualSyncError(page, [/离线/u, /手动上传/u])
  await expect(page.getByTestId('push-status-pill')).toContainText('Push：失败', { timeout: 30_000 })
  await expect(page.getByText(/未提交改动：/u)).toHaveCount(0)
  await expect(page.getByText(/分支：/u)).toHaveCount(0)

  await context.setOffline(false)

  await clickManualSync(page)
  await expectSyncSuccess(page)
})
