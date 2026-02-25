import { expect, test } from '@playwright/test'

const START_DATE = '2026-02-19'

test('日记页搜索应支持关键词匹配并跳转到目标日期 @smoke', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.clear()
  })

  await page.goto(`/diary?date=${START_DATE}`)
  await expect(page.getByLabel('entry-auth-modal')).toBeVisible()
  await page.getByTestId('entry-auth-guest-btn').click()

  await expect(page.getByRole('heading', { name: `${START_DATE} 日记` })).toBeVisible()
  await page.getByTestId('diary-left-tab-search').click()
  await expect(page.getByTestId('diary-search-empty')).toBeVisible()

  await page.getByTestId('diary-search-input').fill('专注')
  await expect(page.getByTestId('diary-search-virtual-list')).toBeVisible()
  await expect(page.getByText('共命中 8 条记录。')).toBeVisible()

  const firstResult = page.getByTestId('diary-search-card').first()
  await expect(firstResult).toContainText('2026-11-20')
  await firstResult.click()

  await expect(page.getByRole('heading', { name: '2026-11-20 日记' })).toBeVisible()
})
