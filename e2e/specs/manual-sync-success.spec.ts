import { expect, test } from '@playwright/test'
import {
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

const TEST_DATE = '2099-12-30'

test('手动保存并立即上传成功时应显示同步成功状态 @smoke', async ({ page }) => {
  const env = getE2EEnv()
  const marker = buildRunMarker('manual-sync-ok')

  await gotoWorkspace(page, TEST_DATE)
  await ensureReadySession(page, env)
  await writeDailyContent(page, `E2E ${marker}`)
  await waitForDailyDiaryPersisted(page, TEST_DATE, marker)
  await page.waitForTimeout(800)

  await clickManualSync(page)
  await waitForSyncIdle(page)
  await expectSyncSuccess(page)
  await expect(page.getByTestId('manual-sync-error')).toHaveCount(0)
})
