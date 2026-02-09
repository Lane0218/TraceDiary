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
import { armShaMismatchRace } from '../helpers/conflict'

const TEST_DATE = '2100-01-01'

test('发生 sha mismatch 时应弹出冲突对话框并可选择保留本地版本完成同步', async ({ page }) => {
  const env = getE2EEnv()
  const firstContent = buildRunMarker('conflict-base')
  const secondContent = buildRunMarker('conflict-local')

  await gotoWorkspace(page, TEST_DATE)
  await ensureReadySession(page, env)

  await writeDailyContent(page, `E2E ${firstContent}`)
  await waitForDailyDiaryPersisted(page, TEST_DATE, firstContent)
  await page.waitForTimeout(800)
  await clickManualSync(page)
  await expectSyncSuccess(page)

  await writeDailyContent(page, `E2E ${secondContent}`)
  await waitForDailyDiaryPersisted(page, TEST_DATE, secondContent)
  await page.waitForTimeout(800)

  const race = await armShaMismatchRace(page, {
    owner: env.owner,
    repo: env.repo,
    branch: env.branch,
    token: env.token,
    path: `${TEST_DATE}.md.enc`,
  })

  try {
    await clickManualSync(page)
    await race.waitForTriggered()

    const conflictDialog = page.getByTestId('conflict-dialog')
    await expect(conflictDialog).toBeVisible({ timeout: 30_000 })

    await page.getByTestId('conflict-keep-local').click()

    await expect(conflictDialog).toBeHidden({ timeout: 30_000 })
    await expect(page.getByTestId('sync-status-pill')).not.toContainText('检测到冲突', { timeout: 30_000 })
    await expectSyncSuccess(page)
  } finally {
    await race.dispose()
  }
})
