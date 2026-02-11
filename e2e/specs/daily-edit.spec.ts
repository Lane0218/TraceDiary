import { expect, test } from '@playwright/test'
import {
  buildRunMarker,
  ensureReadySession,
  gotoWorkspace,
  waitForDailyDiaryPersisted,
  writeDailyContent,
} from '../fixtures/app'
import { getE2EEnv } from '../fixtures/env'

const TEST_DATE = '2099-12-29'

test('日记编辑后应持久化到 IndexedDB 并保留可见内容 @smoke', async ({ page }) => {
  const env = getE2EEnv()
  const marker = buildRunMarker('daily-edit')

  await gotoWorkspace(page, TEST_DATE)
  await ensureReadySession(page, env)
  await writeDailyContent(page, `E2E ${marker}`)
  await waitForDailyDiaryPersisted(page, TEST_DATE, marker)
  await page.waitForTimeout(800)

  await page.reload()
  await ensureReadySession(page, env)
  await waitForDailyDiaryPersisted(page, TEST_DATE, marker)

  const editor = page.locator('[data-testid="daily-editor"] .ProseMirror').first()
  await expect(editor).toContainText(marker, { timeout: 15_000 })
})
