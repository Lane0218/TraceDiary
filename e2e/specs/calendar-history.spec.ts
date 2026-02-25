import { expect, test } from '@playwright/test'
import {
  buildRunMarker,
  ensureReadySession,
  gotoDiary,
  waitForDailyDiaryPersisted,
} from '../fixtures/app'
import { getE2EEnv } from '../fixtures/env'

const HISTORY_SOURCE_DATE = '2099-03-15'
const TARGET_DATE = '2100-03-15'
const PICK_MONTH_RESULT_DATE = '2100-12-15'
const EMPTY_CONTENT_DATE = '2101-04-18'

test('同月同日历史应展示并可跳转，且支持上/下月和选择年月跳转', async ({ page }) => {
  const env = getE2EEnv()
  const marker = buildRunMarker('calendar-history')
  const historyContent = `E2E 往年今日 ${marker}\\n第二行用于预览断言`

  await gotoDiary(page, HISTORY_SOURCE_DATE)
  await ensureReadySession(page, env)
  await page.evaluate(
    async ({ date, content }) => {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('TraceDiary', 1)

        request.onerror = () => {
          reject(request.error ?? new Error('open indexeddb failed'))
        }

        request.onsuccess = () => {
          const db = request.result
          const tx = db.transaction('diaries', 'readwrite')
          const store = tx.objectStore('diaries')
          const now = new Date().toISOString()
          store.put({
            id: `daily:${date}`,
            type: 'daily',
            date,
            filename: `${date}.md.enc`,
            content,
            wordCount: content.replace(/\\s+/g, '').length,
            createdAt: now,
            modifiedAt: now,
          })
          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(tx.error ?? new Error('indexeddb transaction failed'))
          tx.onabort = () => reject(tx.error ?? new Error('indexeddb transaction aborted'))
        }
      })
    },
    {
      date: HISTORY_SOURCE_DATE,
      content: historyContent,
    },
  )
  await page.reload()
  await ensureReadySession(page, env)

  const pickMonthButton = page.getByRole('button', { name: '选择年月' })
  await pickMonthButton.click()
  await page.locator('#month-picker-year').fill('2100')
  await page.getByRole('button', { name: '3月' }).click()
  await page.getByRole('button', { name: '确定' }).click()

  await expect(page).toHaveURL(new RegExp(`date=${TARGET_DATE}$`))
  await expect(page.getByRole('heading', { name: `${TARGET_DATE} 日记` })).toBeVisible()

  const historyEntryButton = page.getByRole('button', { name: `打开 ${HISTORY_SOURCE_DATE}` })
  await expect(historyEntryButton).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('history-card')).toHaveCount(1)

  await historyEntryButton.click()
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

test('清空当日内容后，月历不应继续显示记录高亮', async ({ page }) => {
  const env = getE2EEnv()
  const marker = buildRunMarker('calendar-empty-content')
  const sourceButton = page.getByTestId('daily-editor-mode-source')
  const sourceEditor = page.locator('textarea[data-testid="daily-editor"]').first()
  const highlightedDate = page.locator(
    `button[data-date-key="${EMPTY_CONTENT_DATE}"][data-has-diary="true"]`,
  )

  await gotoDiary(page, EMPTY_CONTENT_DATE)
  await ensureReadySession(page, env)

  await expect(sourceButton).toHaveAttribute('aria-pressed', 'false')
  await sourceButton.click()
  await expect(sourceEditor).toBeVisible()
  await sourceEditor.fill(`临时内容 ${marker}`)
  await waitForDailyDiaryPersisted(page, EMPTY_CONTENT_DATE, marker)
  await expect(highlightedDate).toBeVisible()

  await sourceEditor.fill('   ')
  await page.waitForFunction(
    async ({ date }) => {
      const content = await new Promise<string | null>((resolve, reject) => {
        const request = indexedDB.open('TraceDiary', 1)

        request.onerror = () => {
          reject(request.error ?? new Error('open indexeddb failed'))
        }

        request.onsuccess = () => {
          const db = request.result
          const tx = db.transaction('diaries', 'readonly')
          const store = tx.objectStore('diaries')
          const getRequest = store.get(`daily:${date}`)

          getRequest.onerror = () => {
            reject(getRequest.error ?? new Error('get daily failed'))
          }
          getRequest.onsuccess = () => {
            const record = getRequest.result as { content?: unknown } | undefined
            resolve(typeof record?.content === 'string' ? record.content : null)
          }
        }
      })

      return typeof content === 'string' && content.trim().length === 0
    },
    { date: EMPTY_CONTENT_DATE },
    { timeout: 15_000 },
  )
  await expect(highlightedDate).toHaveCount(0)
})
