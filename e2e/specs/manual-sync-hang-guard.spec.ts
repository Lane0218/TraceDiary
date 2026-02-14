import { expect, test, type Request, type Route } from '@playwright/test'
import {
  clickManualSync,
  ensureReadySession,
  gotoWorkspace,
  waitForDailyDiaryPersisted,
  writeDailyContent,
} from '../fixtures/app'
import { getE2EEnv } from '../fixtures/env'

const TEST_DATE = '2100-01-08'

async function writeDailyContentInSourceMode(page: Parameters<typeof writeDailyContent>[0], content: string) {
  const sourceEditor = page.locator('textarea[data-testid="daily-editor"]').first()
  if (!(await sourceEditor.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: '源码' }).click()
    await expect(sourceEditor).toBeVisible()
  }
  await sourceEditor.fill(content)
}

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

test('单次手动上传超时后应退出 syncing 并展示错误 @slow @remote', async ({ page }) => {
  test.setTimeout(210_000)
  const env = getE2EEnv()
  const marker = `hang-guard-${Date.now()}`

  await gotoWorkspace(page, TEST_DATE)
  await ensureReadySession(page, env)
  await writeDailyContentInSourceMode(page, `E2E ${marker}`)
  await waitForDailyDiaryPersisted(page, TEST_DATE, marker)

  let interceptedManual = false
  let manualCommitMessage = ''
  const handler = async (route: Route): Promise<void> => {
    const request = route.request()
    const isTargetDiaryUpload =
      (request.method() === 'PUT' || request.method() === 'POST') &&
      request.url().includes(`${TEST_DATE}.md.enc`)
    if (!isTargetDiaryUpload) {
      await route.continue()
      return
    }

    const message = readCommitMessage(request)

    if (!interceptedManual && message.includes('手动同步日记')) {
      interceptedManual = true
      manualCommitMessage = message
      // 模拟单次手动上传请求卡住，验证超时保护可以收敛状态。
      await new Promise((resolve) => {
        setTimeout(resolve, 31_000)
      })
      await route.continue()
      return
    }

    await route.continue()
  }
  await page.route('**/api/v5/repos/**/contents/**', handler)

  try {
    await clickManualSync(page)

    await expect
      .poll(() => interceptedManual, {
        timeout: 90_000,
      })
      .toBe(true)
    expect(manualCommitMessage).toContain('手动同步日记')

    await expect(page.getByTestId('push-status-pill')).toContainText('Push：失败', {
      timeout: 90_000,
    })
    await expect(page.getByTestId('push-status-pill')).not.toContainText('Push：进行中', {
      timeout: 20_000,
    })
    await expect(page.getByTestId('toast-push')).toContainText('同步超时，请检查网络后重试', {
      timeout: 20_000,
    })
  } finally {
    if (!page.isClosed()) {
      await page.unroute('**/api/v5/repos/**/contents/**', handler)
    }
  }
})
