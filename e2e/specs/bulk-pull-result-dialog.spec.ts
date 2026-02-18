import { expect, test } from '@playwright/test'
import { ensureReadySession, gotoDiary } from '../fixtures/app'
import { getE2EEnv } from '../fixtures/env'

const TEST_DATE = '2100-01-01'

test('全量 pull 完成后应弹出结果汇总对话框 @remote', async ({ page }) => {
  const env = getE2EEnv()

  await gotoDiary(page, TEST_DATE)
  await ensureReadySession(page, env)

  await expect(page.getByTestId('manual-pull-menu-trigger')).toBeVisible()
  await page.getByTestId('manual-pull-button').click()

  await expect(page.getByTestId('pull-result-dialog')).toBeVisible({ timeout: 45_000 })
  await expect(page.getByText('全量拉取汇总')).toBeVisible()
  await expect(page.getByTestId('pull-result-summary-grid')).toBeVisible()
  await page.getByTestId('pull-result-close').click()
  await expect(page.getByTestId('pull-result-dialog')).toHaveCount(0)
})
