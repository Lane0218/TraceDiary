import { expect, test } from '@playwright/test'
import {
  buildRunMarker,
  clickManualSync,
  ensureReadySession,
  expectSyncSuccess,
  gotoWorkspace,
  waitForDailyDiaryPersisted,
  writeDailyContent,
} from '../fixtures/app'
import { getE2EEnv } from '../fixtures/env'

const TEST_DATE = '2100-01-06'

function extractSyncedAt(labelText: string): string {
  const matched = labelText.match(/最近同步：(.+)$/u)
  if (!matched?.[1]) {
    throw new Error(`无法解析最近同步时间：${labelText}`)
  }
  return matched[1].trim()
}

test('编辑后不自动上传，最近同步时间保持不变，手动上传后才更新 @slow @remote', async ({ page }) => {
  test.setTimeout(180_000)
  const env = getE2EEnv()
  const firstMarker = buildRunMarker('manual-sync-base')
  const secondMarker = buildRunMarker('manual-sync-next')

  await gotoWorkspace(page, TEST_DATE)
  await ensureReadySession(page, env)

  await writeDailyContent(page, `E2E ${firstMarker}`)
  await waitForDailyDiaryPersisted(page, TEST_DATE, firstMarker)

  await clickManualSync(page)
  await expectSyncSuccess(page)

  const lastSyncedLabel = page.locator('span').filter({ hasText: /^最近同步：/u }).first()
  await expect(lastSyncedLabel).toBeVisible({ timeout: 30_000 })
  const baselineLabelText = (await lastSyncedLabel.textContent())?.trim() ?? ''
  const baselineSyncedAt = extractSyncedAt(baselineLabelText)

  await writeDailyContent(page, `E2E ${secondMarker}`)
  await waitForDailyDiaryPersisted(page, TEST_DATE, secondMarker)

  await expect(page.getByText('未提交改动：有')).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(31_000)

  const refreshedLabelText = (await lastSyncedLabel.textContent())?.trim() ?? ''
  const refreshedSyncedAt = extractSyncedAt(refreshedLabelText)
  expect(refreshedSyncedAt).toBe(baselineSyncedAt)

  await clickManualSync(page)
  await expectSyncSuccess(page)

  const updatedLabelText = (await lastSyncedLabel.textContent())?.trim() ?? ''
  const updatedSyncedAt = extractSyncedAt(updatedLabelText)
  expect(updatedSyncedAt).not.toBe(baselineSyncedAt)
})
