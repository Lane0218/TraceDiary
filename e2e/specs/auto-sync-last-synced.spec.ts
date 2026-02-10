import { expect, test, type Route } from '@playwright/test'
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

test('自动同步请求超时后应退出 syncing 并保留最近一次成功同步时间', async ({ page }) => {
  test.setTimeout(180_000)
  const env = getE2EEnv()
  const firstMarker = buildRunMarker('auto-sync-base')
  const secondMarker = buildRunMarker('auto-sync-slow')

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

  let delayed = false
  let delayedUploadMessage = ''
  const handler = async (route: Route): Promise<void> => {
    const request = route.request()
    const isTargetDiaryUpload = request.method() === 'PUT' && request.url().includes(`${TEST_DATE}.md.enc`)
    if (!delayed && isTargetDiaryUpload) {
      const body = request.postDataJSON() as { message?: unknown } | null
      if (body && typeof body.message === 'string') {
        delayedUploadMessage = body.message
      }
      delayed = true
      await new Promise((resolve) => {
        setTimeout(resolve, 26_000)
      })
      await route.continue()
      return
    }
    await route.continue()
  }
  await page.route('**/api/v5/repos/**/contents/**', handler)

  try {
    await writeDailyContent(page, `E2E ${secondMarker}`)
    await waitForDailyDiaryPersisted(page, TEST_DATE, secondMarker)

    await expect(page.getByText('未提交改动：有')).toBeVisible({ timeout: 30_000 })
    await expect
      .poll(() => delayed, {
        timeout: 90_000,
      })
      .toBe(true)
    expect(delayedUploadMessage).toContain('自动同步日记')
    await expect(page.getByTestId('sync-status-pill')).toContainText('云端同步失败', { timeout: 90_000 })
    await expect(page.getByText('同步超时，请检查网络后重试')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('未提交改动：有')).toBeVisible()

    const refreshedLabelText = (await lastSyncedLabel.textContent())?.trim() ?? ''
    const refreshedSyncedAt = extractSyncedAt(refreshedLabelText)
    expect(refreshedSyncedAt).toBe(baselineSyncedAt)
  } finally {
    if (!page.isClosed()) {
      await page.unroute('**/api/v5/repos/**/contents/**', handler)
    }
  }
})
