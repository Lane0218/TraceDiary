import { expect, test } from '@playwright/test'
import {
  ensureReadySession,
  gotoDiary,
  waitForDailyDiaryPersisted,
} from '../fixtures/app'
import { getE2EEnv } from '../fixtures/env'

const TEST_DATE = '2099-12-29'

test('日记编辑后应持久化到 IndexedDB 并保留可见内容 @smoke', async ({ page }) => {
  const env = getE2EEnv()
  const marker = `daily-edit-${Date.now().toString(36)}`
  const markdown = `# 标题 ${marker}\n\n正文 ${marker}\n\n- 无序项 ${marker}\n1. 编号项 ${marker}`

  await gotoDiary(page, TEST_DATE)
  await ensureReadySession(page, env)

  await expect(page.getByTestId('daily-editor-mode-source')).toHaveAttribute('aria-pressed', 'false')
  await page.getByTestId('daily-editor-mode-source').click()
  const sourceEditor = page.locator('textarea[data-testid="daily-editor"]').first()
  await expect(sourceEditor).toBeVisible()
  await sourceEditor.fill(markdown)
  await waitForDailyDiaryPersisted(page, TEST_DATE, marker)

  await page.getByTestId('daily-editor-mode-source').click()
  const heading = page.locator('[data-testid="daily-editor"] .ProseMirror h1').first()
  const paragraph = page
    .locator('[data-testid="daily-editor"] .ProseMirror p')
    .filter({ hasText: `正文 ${marker}` })
    .first()
  await expect(heading).toContainText(`标题 ${marker}`)
  await expect(page.locator('[data-testid="daily-editor"] .ProseMirror ul li').first()).toContainText(
    `无序项 ${marker}`,
  )
  await expect(page.locator('[data-testid="daily-editor"] .ProseMirror ol li').first()).toContainText(
    `编号项 ${marker}`,
  )

  const headingFontSize = await heading.evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize))
  const paragraphFontSize = await paragraph.evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize))
  expect(headingFontSize).toBeGreaterThan(paragraphFontSize)

  await page.waitForTimeout(800)

  await page.reload()
  await ensureReadySession(page, env)
  await waitForDailyDiaryPersisted(page, TEST_DATE, marker)

  await expect(page.getByTestId('daily-editor-mode-source')).toHaveAttribute('aria-pressed', 'false')
  const editor = page.locator('[data-testid="daily-editor"] .ProseMirror').first()
  await expect(editor).toContainText(marker, { timeout: 15_000 })
})

test('日记页右侧编辑面板应固定高度，长内容只在编辑区内滚动', async ({ page }) => {
  const env = getE2EEnv()
  const marker = `daily-height-${Date.now().toString(36)}`
  const longMarkdown = Array.from({ length: 80 }, (_, index) => `第 ${index + 1} 行 ${marker}`).join('\n\n')

  await gotoDiary(page, TEST_DATE)
  await ensureReadySession(page, env)

  await page.getByTestId('diary-left-tab-search').click()
  const rightPanel = page.getByTestId('diary-panel')
  await expect(rightPanel).toBeVisible()

  const rightHeightBefore = await rightPanel.evaluate((node) => node.getBoundingClientRect().height)

  await page.getByTestId('daily-editor-mode-source').click()
  const sourceEditor = page.locator('textarea[data-testid="daily-editor"]').first()
  await expect(sourceEditor).toBeVisible()
  await sourceEditor.fill(longMarkdown)
  await waitForDailyDiaryPersisted(page, TEST_DATE, marker)

  const rightHeightAfter = await rightPanel.evaluate((node) => node.getBoundingClientRect().height)
  expect(Math.abs(rightHeightAfter - rightHeightBefore)).toBeLessThanOrEqual(1)

  const sourceScrollable = await sourceEditor.evaluate((node) => node.scrollHeight > node.clientHeight + 1)
  expect(sourceScrollable).toBeTruthy()
})

test('日记页 WYSIWYG 模式应保持外框固定并在内部滚动', async ({ page }) => {
  const env = getE2EEnv()
  const marker = `daily-wysiwyg-${Date.now().toString(36)}`
  const body = Array.from({ length: 120 }, (_, index) => `第 ${index + 1} 段 ${marker}`).join('\n\n')
  const markdown = `# 标题 ${marker}\n\n${body}`

  await gotoDiary(page, TEST_DATE)
  await ensureReadySession(page, env)

  await page.getByTestId('diary-left-tab-search').click()
  const rightPanel = page.getByTestId('diary-panel')
  const editorRoot = page.locator('[data-testid="daily-editor"]').first()
  const proseMirror = page.locator('[data-testid="daily-editor"] .ProseMirror').first()
  await expect(proseMirror).toBeVisible()

  const rightHeightBefore = await rightPanel.evaluate((node) => node.getBoundingClientRect().height)
  const editorHeightBefore = await editorRoot.evaluate((node) => node.getBoundingClientRect().height)

  await proseMirror.click()
  await proseMirror.fill(markdown)
  await waitForDailyDiaryPersisted(page, TEST_DATE, marker)

  const rightHeightAfter = await rightPanel.evaluate((node) => node.getBoundingClientRect().height)
  const editorHeightAfter = await editorRoot.evaluate((node) => node.getBoundingClientRect().height)
  expect(Math.abs(rightHeightAfter - rightHeightBefore)).toBeLessThanOrEqual(1)
  expect(Math.abs(editorHeightAfter - editorHeightBefore)).toBeLessThanOrEqual(1)

  const editorOverflowY = await editorRoot.evaluate((node) => getComputedStyle(node).overflowY)
  expect(editorOverflowY).toBe('hidden')

  const proseScrollable = await proseMirror.evaluate((node) => node.scrollHeight > node.clientHeight + 1)
  expect(proseScrollable).toBeTruthy()
})

test('移动端空白日记编辑区应保持最小高度且内层填充', async ({ page }) => {
  const env = getE2EEnv()

  await page.setViewportSize({ width: 390, height: 844 })
  await gotoDiary(page, TEST_DATE)
  await ensureReadySession(page, env)

  const editorSlot = page.getByTestId('diary-editor-slot')
  const editorRoot = page.getByTestId('daily-editor').first()
  const proseMirror = page.locator('[data-testid="daily-editor"] .ProseMirror').first()
  await expect(editorSlot).toBeVisible()
  await expect(editorRoot).toBeVisible()
  await expect(proseMirror).toBeVisible()

  const slotHeight = await editorSlot.evaluate((node) => node.getBoundingClientRect().height)
  const rootHeight = await editorRoot.evaluate((node) => node.getBoundingClientRect().height)
  const proseHeight = await proseMirror.evaluate((node) => node.getBoundingClientRect().height)
  const slotToRootGap = Math.abs(slotHeight - rootHeight)

  expect(slotHeight).toBeGreaterThanOrEqual(280)
  expect(rootHeight).toBeGreaterThanOrEqual(240)
  expect(slotToRootGap).toBeGreaterThanOrEqual(20)
  expect(slotToRootGap).toBeLessThanOrEqual(48)
  expect(proseHeight).toBeGreaterThanOrEqual(200)
})

test('日记页布局应保持左右列底部对齐（视觉回归）', async ({ page }) => {
  const env = getE2EEnv()

  await gotoDiary(page, TEST_DATE)
  await ensureReadySession(page, env)

  await page.getByTestId('diary-left-tab-search').click()
  const searchInput = page.getByTestId('diary-search-input')
  await searchInput.fill('layout-regression-no-hit-keyword')

  const layout = page.locator('section[aria-label="diary-layout"]').first()
  const leftColumn = layout.locator(':scope > aside').first()
  const rightColumn = layout.locator(':scope > section').first()
  await expect(leftColumn).toBeVisible()
  await expect(rightColumn).toBeVisible()

  const syncBar = page.locator('section[aria-label="sync-control-bar"]').first()
  const diaryPanel = page.getByTestId('diary-panel')
  await expect(syncBar).toBeVisible()
  await expect(diaryPanel).toBeVisible()

  const leftBottom = await leftColumn.evaluate((node) => node.getBoundingClientRect().bottom)
  const rightBottom = await rightColumn.evaluate((node) => node.getBoundingClientRect().bottom)
  expect(Math.abs(leftBottom - rightBottom)).toBeLessThanOrEqual(1)

  const diaryPanelBottom = await diaryPanel.evaluate((node) => node.getBoundingClientRect().bottom)
  expect(Math.abs(leftBottom - diaryPanelBottom)).toBeLessThanOrEqual(1)

  const syncBottom = await syncBar.evaluate((node) => node.getBoundingClientRect().bottom)
  const panelTop = await diaryPanel.evaluate((node) => node.getBoundingClientRect().top)
  const verticalGap = panelTop - syncBottom
  expect(verticalGap).toBeGreaterThanOrEqual(8)
  expect(verticalGap).toBeLessThanOrEqual(20)

  await expect(layout).toHaveScreenshot('diary-layout-columns-aligned.png', {
    animations: 'disabled',
    caret: 'hide',
    scale: 'css',
    maxDiffPixelRatio: 0.01,
    mask: [
      page.getByTestId('diary-left-panel-body'),
      page.getByTestId('diary-editor-slot'),
      syncBar,
    ],
  })
})
