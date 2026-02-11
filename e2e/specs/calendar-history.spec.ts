import { expect, test } from '@playwright/test'
import {
  buildRunMarker,
  ensureReadySession,
  gotoWorkspace,
  waitForDailyDiaryPersisted,
  writeDailyContent,
} from '../fixtures/app'
import { getE2EEnv } from '../fixtures/env'

const HISTORY_SOURCE_DATE = '2099-03-15'
const TARGET_DATE = '2100-03-15'
const PICK_MONTH_RESULT_DATE = '2100-12-15'

test('同月同日历史应展示并可跳转，且支持上/下月和选择年月跳转', async ({ page }) => {
  const env = getE2EEnv()
  const marker = buildRunMarker('calendar-history')

  await gotoWorkspace(page, HISTORY_SOURCE_DATE)
  await ensureReadySession(page, env)
  await writeDailyContent(page, `E2E 往年今日 ${marker}\n第二行用于预览断言`)
  await waitForDailyDiaryPersisted(page, HISTORY_SOURCE_DATE, marker)
  await page.waitForTimeout(800)

  const pickMonthButton = page.getByRole('button', { name: '选择年月' })
  await pickMonthButton.click()
  await page.locator('#month-picker-year').fill('2100')
  await page.getByRole('button', { name: '3月' }).click()
  await page.getByRole('button', { name: '确定' }).click()

  await expect(page).toHaveURL(new RegExp(`date=${TARGET_DATE}$`))
  await expect(page.getByRole('heading', { name: `${TARGET_DATE} 日记` })).toBeVisible()
  const historyList = page.getByLabel('往年今日列表')
  await expect(historyList).toBeVisible()
  await expect(historyList).toContainText(HISTORY_SOURCE_DATE)
  await expect(historyList).toContainText(marker)

  await page.getByRole('button', { name: `打开 ${HISTORY_SOURCE_DATE}` }).click()
  await expect(page).toHaveURL(new RegExp(`date=${HISTORY_SOURCE_DATE}$`))
  await expect(page.getByRole('heading', { name: `${HISTORY_SOURCE_DATE} 日记` })).toBeVisible()

  await expect(pickMonthButton).toContainText('2099年3月')

  await page.getByRole('button', { name: '下个月' }).click()
  await expect(pickMonthButton).toContainText('2099年4月')

  await page.getByRole('button', { name: '上个月' }).click()
  await expect(pickMonthButton).toContainText('2099年3月')

  await pickMonthButton.click()
  await page.locator('#month-picker-year').fill('2100')
  await page.getByRole('button', { name: '12月' }).click()
  await page.getByRole('button', { name: '确定' }).click()

  await expect(page).toHaveURL(new RegExp(`date=${PICK_MONTH_RESULT_DATE}$`))
  await expect(page.getByRole('heading', { name: `${PICK_MONTH_RESULT_DATE} 日记` })).toBeVisible()
  await expect(pickMonthButton).toContainText('2100年12月')
})
