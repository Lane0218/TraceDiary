import { expect, test } from '@playwright/test'
import { ensureReadySession, gotoDiary } from '../fixtures/app'
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

test('日记页统计分段与统计详情页应展示核心指标', async ({ page }) => {
  const env = getE2EEnv()
  const today = new Date()
  const todayKey = formatDateKey(today)
  const yesterdayKey = formatDateKey(shiftDate(today, -1))
  const threeDaysAgoKey = formatDateKey(shiftDate(today, -3))
  const currentYear = today.getFullYear()

  await gotoDiary(page, todayKey)
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
      page.getByTestId('diary-left-panel').boundingBox(),
      page.getByTestId('diary-left-panel-body').boundingBox(),
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
      page.locator('[aria-label="diary-layout"] aside').boundingBox(),
      page.getByTestId('diary-editor-slot').boundingBox(),
    ])

    expect(leftColumnBox).not.toBeNull()
    expect(editorSlotBox).not.toBeNull()

    const editorRatio = (editorSlotBox?.height ?? 0) / (leftColumnBox?.height ?? 1)
    expect(editorRatio).toBeGreaterThanOrEqual(0.62)
  }

  const assertEditorPanelHasNoLargeBottomGap = async () => {
    const [panelBox, editorBox] = await Promise.all([
      page.getByTestId('diary-panel').boundingBox(),
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
      page.locator('[aria-label="diary-layout"] aside').boundingBox(),
      page.locator('[aria-label="diary-layout"] > section').last().boundingBox(),
    ])

    expect(leftBox).not.toBeNull()
    expect(rightBox).not.toBeNull()

    const leftBottom = (leftBox?.y ?? 0) + (leftBox?.height ?? 0)
    const rightBottom = (rightBox?.y ?? 0) + (rightBox?.height ?? 0)
    expect(Math.abs(leftBottom - rightBottom)).toBeLessThanOrEqual(2)
  }

  const assertStatsCardsNotOverflowPanel = async () => {
    const [panelBodyBox, lastCardBox] = await Promise.all([
      page.getByTestId('diary-left-panel-body').boundingBox(),
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

    const titleBottom = (titleBox?.y ?? 0) + (titleBox?.height ?? 0)
    const sourceTop = sourceButtonBox?.y ?? 0
    const sourceBottom = (sourceButtonBox?.y ?? 0) + (sourceButtonBox?.height ?? 0)
    const editorTop = editorBox?.y ?? 0
    const titleToSourceGap = sourceTop - titleBottom
    const sourceToEditorGap = editorTop - sourceBottom

    expect(titleToSourceGap).toBeGreaterThanOrEqual(0)
    expect(titleToSourceGap).toBeLessThanOrEqual(16)
    expect(sourceToEditorGap).toBeGreaterThanOrEqual(6)
    expect(sourceToEditorGap).toBeLessThanOrEqual(20)
    expect(editorTop - titleBottom).toBeGreaterThanOrEqual(12)
  }

  const assertSegmentContrast = async (activeTab: 'history' | 'stats') => {
    const historyTab = page.getByTestId('diary-left-tab-history')
    const statsTab = page.getByTestId('diary-left-tab-stats')

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

  const assertChartBarsAvoidAxisLabels = async (chartFrameTestId: string) => {
    const overlap = await page.getByTestId(chartFrameTestId).evaluate((element) => {
      const svg = element.querySelector('svg')
      if (!svg) {
        return {
          leftOverlap: true,
          rightOverlap: true,
          leftGap: Number.NaN,
          rightGap: Number.NaN,
        }
      }

      const toRect = (target: Element) => {
        const rect = target.getBoundingClientRect()
        return {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        }
      }

      const bars = Array.from(svg.querySelectorAll('[data-chart-role="bar"]'))
        .map((item) => toRect(item))
        .filter((item) => item.width > 0 && item.height > 0)
      const leftLabels = Array.from(svg.querySelectorAll('[data-chart-role="y-axis-label-left"]'))
        .map((item) => toRect(item))
        .filter((item) => item.width > 0 && item.height > 0)
      const rightLabels = Array.from(svg.querySelectorAll('[data-chart-role="y-axis-label-right"]'))
        .map((item) => toRect(item))
        .filter((item) => item.width > 0 && item.height > 0)

      const intersects = (
        left: { left: number; right: number; top: number; bottom: number },
        right: { left: number; right: number; top: number; bottom: number },
      ) =>
        !(
          left.right <= right.left ||
          left.left >= right.right ||
          left.bottom <= right.top ||
          left.top >= right.bottom
        )

      const leftOverlap = bars.some((bar) => leftLabels.some((label) => intersects(bar, label)))
      const rightOverlap = bars.some((bar) => rightLabels.some((label) => intersects(bar, label)))

      const barLeft = bars.length > 0 ? Math.min(...bars.map((item) => item.left)) : Number.NaN
      const barRight = bars.length > 0 ? Math.max(...bars.map((item) => item.right)) : Number.NaN
      const labelLeftRight = leftLabels.length > 0 ? Math.max(...leftLabels.map((item) => item.right)) : Number.NaN
      const labelRightLeft = rightLabels.length > 0 ? Math.min(...rightLabels.map((item) => item.left)) : Number.NaN

      return {
        leftOverlap,
        rightOverlap,
        leftGap: barLeft - labelLeftRight,
        rightGap: labelRightLeft - barRight,
      }
    })

    expect(overlap.leftOverlap).toBeFalsy()
    expect(overlap.rightOverlap).toBeFalsy()
    expect(overlap.leftGap).toBeGreaterThan(0)
    expect(overlap.rightGap).toBeGreaterThan(0)
  }

  await expect(page.getByTestId('diary-left-tab-history')).toBeVisible()
  await assertEditorNotVisiblyTooShort()
  await assertEditorPanelHasNoLargeBottomGap()
  await assertColumnsBottomAligned()
  await assertEditorHeaderAligned()
  await assertSegmentContrast('history')
  const historyHeights = await readLeftPanelHeights()
  await page.getByTestId('diary-left-tab-stats').click()

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

  await page.getByTestId('app-nav-insights').click()

  await expect(page).toHaveURL(/\/insights$/)
  await expect(page.getByLabel('insights-page')).toBeVisible()
  await expect(page.getByRole('heading', { name: '数据统计' })).toBeVisible()
  await expect(page.getByTestId('insights-monthly-chart')).toBeVisible()
  await expect(page.getByTestId('insights-monthly-legend')).toBeVisible()
  await expect(page.getByTestId('insights-monthly-metric-entry-count')).toBeVisible()
  await expect(page.getByTestId('insights-yearly-chart')).toBeVisible()
  await expect(page.getByTestId('insights-yearly-summary-cards')).toBeVisible()
  await expect(page.getByTestId('insights-yearly-heatmap')).toBeVisible()
  await expect(page.getByLabel('热力图年份减一')).toBeVisible()
  await expect(page.getByRole('textbox', { name: '热力图年份' })).toBeVisible()
  await expect(page.getByLabel('热力图年份加一')).toBeVisible()
  await expect(page.getByTestId('insights-yearly-heatmap-side-panel')).toBeVisible()
  await expect(page.getByTestId('insights-yearly-heatmap-weekday-axis').locator('span').first()).toHaveText('一')

  const [monthlyChartFrameBox, firstMonthlyMetricBox, monthlyMetricsPanelBox, monthlyLastMetricBox] = await Promise.all([
    page.getByTestId('insights-monthly-chart-frame').boundingBox(),
    page.getByTestId('insights-monthly-metric-latest').boundingBox(),
    page.getByTestId('insights-monthly-metrics').boundingBox(),
    page.getByTestId('insights-monthly-metric-quarter-avg').boundingBox(),
  ])
  expect(monthlyChartFrameBox).not.toBeNull()
  expect(firstMonthlyMetricBox).not.toBeNull()
  expect(monthlyMetricsPanelBox).not.toBeNull()
  expect(monthlyLastMetricBox).not.toBeNull()

  const chartTop = monthlyChartFrameBox?.y ?? 0
  const firstMetricTop = firstMonthlyMetricBox?.y ?? 0
  expect(Math.abs(chartTop - firstMetricTop)).toBeLessThanOrEqual(2)

  const metricsPanelBottom = (monthlyMetricsPanelBox?.y ?? 0) + (monthlyMetricsPanelBox?.height ?? 0)
  const lastMetricBottom = (monthlyLastMetricBox?.y ?? 0) + (monthlyLastMetricBox?.height ?? 0)
  expect(metricsPanelBottom - lastMetricBottom).toBeLessThanOrEqual(2)

  const [yearlyHeatmapBox, heatmapGridBox, sidePanelFirstMetricBox, sidePanelLastMetricBox, heatmapBottomRowBox] = await Promise.all([
    page.getByTestId('insights-yearly-heatmap').boundingBox(),
    page.getByTestId('insights-yearly-heatmap-grid-frame').boundingBox(),
    page.getByTestId('insights-yearly-heatmap-metric-active-days').boundingBox(),
    page.getByTestId('insights-yearly-heatmap-metric-peak-word').boundingBox(),
    page.getByTestId('insights-yearly-heatmap-bottom-row').boundingBox(),
  ])
  expect(yearlyHeatmapBox).not.toBeNull()
  expect(heatmapGridBox).not.toBeNull()
  expect(sidePanelFirstMetricBox).not.toBeNull()
  expect(sidePanelLastMetricBox).not.toBeNull()
  expect(heatmapBottomRowBox).not.toBeNull()

  const heatmapHorizontalGap =
    (sidePanelFirstMetricBox?.x ?? 0) - ((heatmapGridBox?.x ?? 0) + (heatmapGridBox?.width ?? 0))
  expect(heatmapHorizontalGap).toBeLessThanOrEqual(12)

  const heatmapSectionRight = (yearlyHeatmapBox?.x ?? 0) + (yearlyHeatmapBox?.width ?? 0)
  const sidePanelRight = (sidePanelFirstMetricBox?.x ?? 0) + (sidePanelFirstMetricBox?.width ?? 0)
  expect(Math.abs(heatmapSectionRight - sidePanelRight)).toBeLessThanOrEqual(2)

  const heatmapSideBottom = (sidePanelLastMetricBox?.y ?? 0) + (sidePanelLastMetricBox?.height ?? 0)
  const heatmapBottomRowBottom = (heatmapBottomRowBox?.y ?? 0) + (heatmapBottomRowBox?.height ?? 0)
  expect(Math.abs(heatmapSideBottom - heatmapBottomRowBottom)).toBeLessThanOrEqual(2)

  const monthlyChartOverflow = await page.getByTestId('insights-monthly-chart-frame').evaluate((element) => {
    return element.scrollWidth - element.clientWidth
  })
  const yearlyChartOverflow = await page.getByTestId('insights-yearly-chart-frame').evaluate((element) => {
    return element.scrollWidth - element.clientWidth
  })
  const yearlyHeatmapOverflow = await page.getByTestId('insights-yearly-heatmap-grid-frame').evaluate((element) => {
    return element.scrollWidth - element.clientWidth
  })
  expect(monthlyChartOverflow).toBeLessThanOrEqual(1)
  expect(yearlyChartOverflow).toBeLessThanOrEqual(1)
  expect(yearlyHeatmapOverflow).toBeLessThanOrEqual(1)
  await assertChartBarsAvoidAxisLabels('insights-monthly-chart-frame')
  await assertChartBarsAvoidAxisLabels('insights-yearly-chart-frame')

  const heatmapYearInput = page.getByRole('textbox', { name: '热力图年份' })
  await heatmapYearInput.fill(String(currentYear))
  await heatmapYearInput.blur()

  const todayHeatmapCell = page
    .getByTestId('insights-yearly-heatmap')
    .getByRole('button', { name: new RegExp(`^${todayKey}\\s`) })
    .first()
  await todayHeatmapCell.click()
  await expect(page.getByTestId('insights-yearly-heatmap-selection')).toContainText(todayKey)
  await expect(page.getByTestId('insights-yearly-heatmap-selection')).toContainText('7')
})
