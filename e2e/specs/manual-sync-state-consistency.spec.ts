import { expect, test, type Request, type Route } from '@playwright/test'
import {
  buildRunMarker,
  clickManualSync,
  ensureReadySession,
  gotoWorkspace,
  waitForDailyDiaryPersisted,
  writeDailyContent,
} from '../fixtures/app'
import { getE2EEnv } from '../fixtures/env'

const TEST_DATE = '2100-01-07'

function readCommitMessage(request: Request): string {
  try {
    const payload = request.postDataJSON() as { message?: unknown } | null
    if (payload && typeof payload.message === 'string') {
      return payload.message
    }
  } catch {
    // ignore: 非 JSON 请求体无需读取 message
  }
  return ''
}

test('手动上传成功后应收敛为已同步，且不展示未提交改动与分支徽标', async ({ page }) => {
  const env = getE2EEnv()
  const marker = buildRunMarker('manual-sync-state')

  await gotoWorkspace(page, TEST_DATE)
  await ensureReadySession(page, env)
  await writeDailyContent(page, `E2E ${marker}`)
  await waitForDailyDiaryPersisted(page, TEST_DATE, marker)
  await page.waitForTimeout(800)

  let delayedManualUpload = false
  let targetDiaryUploadCount = 0
  let latestTargetDiaryMessage = ''
  const handler = async (route: Route): Promise<void> => {
    const request = route.request()
    const isTargetDiaryUpload =
      (request.method() === 'PUT' || request.method() === 'POST') &&
      request.url().includes(`${TEST_DATE}.md.enc`)
    if (isTargetDiaryUpload) {
      targetDiaryUploadCount += 1
      latestTargetDiaryMessage = readCommitMessage(request)

      // 放慢首个手动上传，确保“等待结果”提示稳定可见。
      if (!delayedManualUpload && latestTargetDiaryMessage.includes('手动同步日记')) {
        delayedManualUpload = true
        await new Promise((resolve) => {
          setTimeout(resolve, 1_200)
        })
      }
    }
    await route.continue()
  }
  await page.route('**/api/v5/repos/**/contents/**', handler)

  try {
    await clickManualSync(page)
    await expect(page.getByTestId('manual-sync-error')).toContainText('手动上传已触发，正在等待结果...')
    await expect(page.getByTestId('manual-sync-error')).toHaveCount(0, { timeout: 30_000 })

    await expect
      .poll(() => targetDiaryUploadCount, {
        timeout: 30_000,
      })
      .toBeGreaterThan(0)
    expect(latestTargetDiaryMessage).toContain('手动同步日记')

    await expect(page.getByTestId('sync-status-pill')).toContainText('云端已同步', { timeout: 30_000 })
    await expect(page.getByText(/未提交改动：/u)).toHaveCount(0)
    await expect(page.getByText(/分支：/u)).toHaveCount(0)
    await expect(page.getByTestId('sync-status-pill')).not.toContainText('云端待同步')

    await page.reload()
    await ensureReadySession(page, env)
    await expect(page.getByTestId('sync-status-pill')).toContainText('云端已同步', { timeout: 30_000 })
    await expect(page.getByTestId('sync-status-pill')).not.toContainText('云端待同步')
  } finally {
    if (!page.isClosed()) {
      await page.unroute('**/api/v5/repos/**/contents/**', handler)
    }
  }
})
