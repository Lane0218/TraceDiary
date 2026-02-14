import { expect, test, type Route } from '@playwright/test'
import { clickManualSync, ensureReadySession, gotoWorkspace, writeDailyContent } from '../fixtures/app'
import { getE2EEnv } from '../fixtures/env'

const TEST_DATE = '2100-01-09'

test('内容为空时点击 push 应拦截上传并提示无需 push @smoke', async ({ page }) => {
  const env = getE2EEnv()
  let targetDiaryUploadCount = 0

  const handler = async (route: Route): Promise<void> => {
    const request = route.request()
    const isTargetDiaryUpload =
      (request.method() === 'PUT' || request.method() === 'POST') &&
      request.url().includes(`${TEST_DATE}.md.enc`)
    if (isTargetDiaryUpload) {
      targetDiaryUploadCount += 1
    }
    await route.continue()
  }

  await page.route('**/api/v5/repos/**/contents/**', handler)

  try {
    await gotoWorkspace(page, TEST_DATE)
    await ensureReadySession(page, env)
    await writeDailyContent(page, '')
    await clickManualSync(page)

    await expect(page.getByTestId('toast-push')).toContainText('当前内容为空，无需 push')
    await expect(page.getByTestId('push-status-pill')).toContainText('Push：未执行')
    expect(targetDiaryUploadCount).toBe(0)
  } finally {
    await page.unroute('**/api/v5/repos/**/contents/**', handler)
  }
})

