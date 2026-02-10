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

test('手动上传后衔接自动上传悬挂时，应在超时后退出 syncing', async ({ page }) => {
  test.setTimeout(210_000)
  const env = getE2EEnv()
  const marker = `hang-guard-${Date.now()}`

  await gotoWorkspace(page, TEST_DATE)
  await ensureReadySession(page, env)
  await writeDailyContent(page, `E2E ${marker}`)
  await waitForDailyDiaryPersisted(page, TEST_DATE, marker)

  let interceptedManual = false
  let interceptedAuto = false
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
      // 让手动上传覆盖自动防抖触发时间窗，稳定复现“手动后衔接自动上传”链路。
      await new Promise((resolve) => {
        setTimeout(resolve, 31_000)
      })
      await route.continue()
      return
    }

    if (!interceptedAuto && message.includes('自动同步日记')) {
      interceptedAuto = true
      // 远端迟迟不返回：验证自动上传超时保护能否让 UI 退出 syncing。
      await new Promise((resolve) => {
        setTimeout(resolve, 90_000)
      })
      await route.continue()
      return
    }

    await route.continue()
  }
  await page.route('**/api/v5/repos/**/contents/**', handler)

  try {
    await clickManualSync(page)
    await expect(page.getByTestId('manual-sync-error')).toContainText('手动上传已触发，正在等待结果...')

    await expect
      .poll(() => interceptedManual, {
        timeout: 90_000,
      })
      .toBe(true)
    await expect
      .poll(() => interceptedAuto, {
        timeout: 90_000,
      })
      .toBe(true)

    await expect(page.getByTestId('sync-status-pill')).not.toContainText('云端同步中', {
      timeout: 90_000,
    })
    await expect(page.getByTestId('sync-status-pill')).toContainText('云端同步失败', {
      timeout: 20_000,
    })
    await expect(page.getByTestId('manual-sync-error')).toContainText('同步超时，请检查网络后重试', {
      timeout: 20_000,
    })
  } finally {
    if (!page.isClosed()) {
      await page.unroute('**/api/v5/repos/**/contents/**', handler)
    }
  }
})
