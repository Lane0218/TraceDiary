import { expect, test } from '@playwright/test'
import {
  buildRunMarker,
  clickManualSync,
  ensureReadySession,
  expectSyncSuccess,
  gotoWorkspace,
  waitForDailyDiaryPersisted,
  waitForSyncIdle,
} from '../fixtures/app'
import { getE2EEnv } from '../fixtures/env'

const TEST_DATE = '2100-06-06'

async function writeDailyContentInSourceMode(page: Parameters<typeof writeDailyContent>[0], content: string) {
  const sourceEditor = page.locator('textarea[data-testid="daily-editor"]').first()
  if (!(await sourceEditor.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: '源码' }).click()
    await expect(sourceEditor).toBeVisible()
  }
  await sourceEditor.fill(content)
}

test('新本地设备解锁后应自动拉取远端已有日记到本地 @remote', async ({ browser }) => {
  const env = getE2EEnv()
  const marker = buildRunMarker('remote-pull')

  const writerContext = await browser.newContext()
  const writerPage = await writerContext.newPage()

  await gotoWorkspace(writerPage, TEST_DATE)
  await ensureReadySession(writerPage, env)
  await writeDailyContentInSourceMode(writerPage, `E2E 云端预置 ${marker}`)
  await waitForDailyDiaryPersisted(writerPage, TEST_DATE, marker)
  await clickManualSync(writerPage)
  await expectSyncSuccess(writerPage)
  await waitForSyncIdle(writerPage, { timeoutMs: 45_000 })
  const storageState = await writerContext.storageState()
  await writerContext.close()

  const readerContext = await browser.newContext({ storageState })
  const readerPage = await readerContext.newPage()

  await gotoWorkspace(readerPage, TEST_DATE)
  await ensureReadySession(readerPage, env)
  await expect(readerPage.getByRole('heading', { name: `${TEST_DATE} 日记` })).toBeVisible()
  await waitForDailyDiaryPersisted(readerPage, TEST_DATE, marker)
  await expect(readerPage.getByLabel(`${TEST_DATE} 已记录`)).toBeVisible({ timeout: 45_000 })

  await readerContext.close()
})
