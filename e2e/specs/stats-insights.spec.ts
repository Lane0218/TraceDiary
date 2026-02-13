import { expect, test } from '@playwright/test'
import { ensureReadySession, gotoWorkspace } from '../fixtures/app'
import { getE2EEnv } from '../fixtures/env'

function formatDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function shiftDate(base: Date, offsetDays: number): Date {
  const next = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 12)
  next.setDate(next.getDate() + offsetDays)
  return next
}

test('工作台统计分段与统计详情页应展示核心指标', async ({ page }) => {
  const env = getE2EEnv()
  const today = new Date()
  const todayKey = formatDateKey(today)
  const yesterdayKey = formatDateKey(shiftDate(today, -1))
  const threeDaysAgoKey = formatDateKey(shiftDate(today, -3))
  const currentYear = today.getFullYear()

  await gotoWorkspace(page, todayKey)
  await ensureReadySession(page, env)

  await page.evaluate(
    async ({ targetToday, targetYesterday, targetThreeDaysAgo, year }) => {
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
            id: `daily:${targetToday}`,
            type: 'daily',
            date: targetToday,
            filename: `${targetToday}.md.enc`,
            content: 'today-entry',
            wordCount: 7,
            createdAt: now,
            modifiedAt: now,
          })
          store.put({
            id: `daily:${targetYesterday}`,
            type: 'daily',
            date: targetYesterday,
            filename: `${targetYesterday}.md.enc`,
            content: 'yesterday-entry',
            wordCount: 8,
            createdAt: now,
            modifiedAt: now,
          })
          store.put({
            id: `daily:${targetThreeDaysAgo}`,
            type: 'daily',
            date: targetThreeDaysAgo,
            filename: `${targetThreeDaysAgo}.md.enc`,
            content: 'three-days-ago-entry',
            wordCount: 9,
            createdAt: now,
            modifiedAt: now,
          })
          store.put({
            id: `summary:${year}`,
            type: 'yearly_summary',
            year,
            date: `${year}-12-31`,
            filename: `${year}-summary.md.enc`,
            content: 'yearly-summary-entry',
            wordCount: 12,
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
      targetToday: todayKey,
      targetYesterday: yesterdayKey,
      targetThreeDaysAgo: threeDaysAgoKey,
      year: currentYear,
    },
  )

  await page.reload()
  await ensureReadySession(page, env)

  const readLeftPanelHeights = async () => {
    const [panelBox, bodyBox] = await Promise.all([
      page.getByTestId('workspace-left-panel').boundingBox(),
      page.getByTestId('workspace-left-panel-body').boundingBox(),
    ])
    expect(panelBox).not.toBeNull()
    expect(bodyBox).not.toBeNull()
    return {
      panel: panelBox?.height ?? 0,
      body: bodyBox?.height ?? 0,
    }
  }

  const assertEditorNotVisiblyTooShort = async () => {
    const [leftColumnBox, editorSlotBox] = await Promise.all([
      page.locator('[aria-label="workspace-layout"] aside').boundingBox(),
      page.getByTestId('workspace-diary-editor-slot').boundingBox(),
    ])

    expect(leftColumnBox).not.toBeNull()
    expect(editorSlotBox).not.toBeNull()

    const editorRatio = (editorSlotBox?.height ?? 0) / (leftColumnBox?.height ?? 1)
    expect(editorRatio).toBeGreaterThanOrEqual(0.62)
  }

  const assertEditorPanelHasNoLargeBottomGap = async () => {
    const [panelBox, editorBox] = await Promise.all([
      page.getByTestId('workspace-diary-panel').boundingBox(),
      page.getByTestId('daily-editor').boundingBox(),
    ])

    expect(panelBox).not.toBeNull()
    expect(editorBox).not.toBeNull()

    const panelBottom = (panelBox?.y ?? 0) + (panelBox?.height ?? 0)
    const editorBottom = (editorBox?.y ?? 0) + (editorBox?.height ?? 0)
    const bottomGap = panelBottom - editorBottom

    expect(bottomGap).toBeLessThanOrEqual(40)
  }

  const assertColumnsBottomAligned = async () => {
    const [leftBox, rightBox] = await Promise.all([
      page.locator('[aria-label="workspace-layout"] aside').boundingBox(),
      page.locator('[aria-label="workspace-layout"] > section').last().boundingBox(),
    ])

    expect(leftBox).not.toBeNull()
    expect(rightBox).not.toBeNull()

    const leftBottom = (leftBox?.y ?? 0) + (leftBox?.height ?? 0)
    const rightBottom = (rightBox?.y ?? 0) + (rightBox?.height ?? 0)
    expect(Math.abs(leftBottom - rightBottom)).toBeLessThanOrEqual(2)
  }

  const assertStatsCardsNotOverflowPanel = async () => {
    const [panelBodyBox, lastCardBox] = await Promise.all([
      page.getByTestId('workspace-left-panel-body').boundingBox(),
      page.locator('[aria-label="stats-overview-card"] article').last().boundingBox(),
    ])

    expect(panelBodyBox).not.toBeNull()
    expect(lastCardBox).not.toBeNull()

    const panelBodyBottom = (panelBodyBox?.y ?? 0) + (panelBodyBox?.height ?? 0)
    const lastCardBottom = (lastCardBox?.y ?? 0) + (lastCardBox?.height ?? 0)
    expect(lastCardBottom).toBeLessThanOrEqual(panelBodyBottom + 1)
  }

  const assertEditorHeaderAligned = async () => {
    const [titleBox, sourceButtonBox, editorBox] = await Promise.all([
      page.getByRole('heading', { name: `${todayKey} 日记` }).boundingBox(),
      page.getByTestId('daily-editor-mode-source').boundingBox(),
      page.getByTestId('daily-editor').boundingBox(),
    ])

    expect(titleBox).not.toBeNull()
    expect(sourceButtonBox).not.toBeNull()
    expect(editorBox).not.toBeNull()

    const titleCenterY = (titleBox?.y ?? 0) + (titleBox?.height ?? 0) / 2
    const buttonCenterY = (sourceButtonBox?.y ?? 0) + (sourceButtonBox?.height ?? 0) / 2
    expect(Math.abs(titleCenterY - buttonCenterY)).toBeLessThanOrEqual(12)

    const titleBottom = (titleBox?.y ?? 0) + (titleBox?.height ?? 0)
    const editorTop = editorBox?.y ?? 0
    expect(editorTop - titleBottom).toBeGreaterThanOrEqual(12)
  }

  const assertSegmentContrast = async (activeTab: 'history' | 'stats') => {
    const historyTab = page.getByTestId('workspace-left-tab-history')
    const statsTab = page.getByTestId('workspace-left-tab-stats')

    if (activeTab === 'history') {
      await expect(historyTab).toHaveCSS('background-color', 'rgb(51, 58, 54)')
      await expect(historyTab).toHaveCSS('color', 'rgb(247, 245, 239)')
      await expect(statsTab).toHaveCSS('color', 'rgb(79, 87, 81)')
      return
    }

    await expect(statsTab).toHaveCSS('background-color', 'rgb(51, 58, 54)')
    await expect(statsTab).toHaveCSS('color', 'rgb(247, 245, 239)')
    await expect(historyTab).toHaveCSS('color', 'rgb(79, 87, 81)')
  }

  await expect(page.getByTestId('workspace-left-tab-history')).toBeVisible()
  await assertEditorNotVisiblyTooShort()
  await assertEditorPanelHasNoLargeBottomGap()
  await assertColumnsBottomAligned()
  await assertEditorHeaderAligned()
  await assertSegmentContrast('history')
  const historyHeights = await readLeftPanelHeights()
  await page.getByTestId('workspace-left-tab-stats').click()

  await expect(page.getByTestId('stats-total-daily-count')).toContainText('3')
  await expect(page.getByTestId('stats-total-yearly-count')).toContainText('1')
  await expect(page.getByTestId('stats-total-word-count')).toContainText('36')
  await expect(page.getByTestId('stats-current-streak-days')).toContainText('2')
  await expect(page.getByTestId('stats-longest-streak-days')).toContainText('2')
  await assertEditorNotVisiblyTooShort()
  await assertEditorPanelHasNoLargeBottomGap()
  await assertColumnsBottomAligned()
  await assertStatsCardsNotOverflowPanel()
  await assertEditorHeaderAligned()
  await assertSegmentContrast('stats')
  const statsHeights = await readLeftPanelHeights()

  expect(Math.abs(historyHeights.panel - statsHeights.panel)).toBeLessThanOrEqual(2)
  expect(Math.abs(historyHeights.body - statsHeights.body)).toBeLessThanOrEqual(2)

  const firstStatCardBox = await page.locator('[aria-label="stats-overview-card"] article').first().boundingBox()
  expect(firstStatCardBox).not.toBeNull()
  expect(firstStatCardBox?.height ?? 0).toBeLessThanOrEqual(130)

  await page.getByRole('button', { name: '统计详情' }).first().click()

  await expect(page).toHaveURL(/\/insights$/)
  await expect(page.getByLabel('insights-page')).toBeVisible()
  await expect(page.getByRole('heading', { name: '写作统计' })).toBeVisible()
  await expect(page.getByText('年度汇总')).toBeVisible()
  await expect(page.getByText(String(currentYear)).first()).toBeVisible()
})
