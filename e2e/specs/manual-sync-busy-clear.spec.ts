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

const TEST_DATE = '2100-01-02'

test('手动上传并发触发忙碌提示后，toast 应被成功消息覆盖', async ({ page }) => {
  const env = getE2EEnv()
  const marker = buildRunMarker('manual-sync-busy-clear')

  await gotoWorkspace(page, TEST_DATE)
  await ensureReadySession(page, env)
  await writeDailyContent(page, `E2E ${marker}`)
  await waitForDailyDiaryPersisted(page, TEST_DATE, marker)
  await page.waitForTimeout(800)

  let releaseFirstUpload!: () => void
  const firstUploadGate = new Promise<void>((resolve) => {
    releaseFirstUpload = resolve
  })

  let intercepted = false
  const handler = async (route: Route): Promise<void> => {
    const request = route.request()
    const isTarget = request.method() === 'PUT' && request.url().includes(`${TEST_DATE}.md.enc`)

    if (!intercepted && isTarget) {
      intercepted = true
      await firstUploadGate
      await route.continue()
      return
    }

    await route.continue()
  }

  await page.route('**/api/v5/repos/**/contents/**', handler)

  try {
    await clickManualSync(page)
    await expect(page.getByRole('button', { name: 'pushing...' })).toBeVisible()

    await clickManualSync(page)
    await expect(page.getByTestId('toast-push')).toContainText('当前正在上传，请稍候重试')

    releaseFirstUpload()
    await expectSyncSuccess(page)
    await expect(page.getByTestId('toast-push')).toContainText('push 已完成，同步成功')
  } finally {
    releaseFirstUpload?.()
    await page.unroute('**/api/v5/repos/**/contents/**', handler)
  }
})
