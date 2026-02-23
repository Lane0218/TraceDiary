import { expect, test } from '@playwright/test'
import {
  buildRunMarker,
  ensureReadySession,
  gotoDiary,
  waitForDailyDiaryPersisted,
  writeDailyContent,
} from '../fixtures/app'
import { getE2EEnv } from '../fixtures/env'

const TEST_DATE = '2100-01-03'

test('设置页执行全量 push 后应展示结果汇总 @remote', async ({ page }) => {
  const env = getE2EEnv()
  const marker = buildRunMarker('bulk-push')

  await gotoDiary(page, TEST_DATE)
  await ensureReadySession(page, env)
  await writeDailyContent(page, `E2E ${marker}`)
  await waitForDailyDiaryPersisted(page, TEST_DATE, marker)

  await page.getByTestId('app-nav-settings').click()
  await expect(page.getByLabel('settings-page')).toBeVisible()
  await expect(page.getByTestId('settings-bulk-push-button')).toBeVisible()

  await page.once('dialog', (dialog) => dialog.accept())
  await page.getByTestId('settings-bulk-push-button').click()

  await expect(page.getByTestId('settings-bulk-push-result')).toBeVisible({ timeout: 45_000 })
  await expect(page.getByTestId('settings-bulk-push-result')).toContainText('成功')
})
