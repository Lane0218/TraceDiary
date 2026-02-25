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

test('日记页左右面板应等高，长内容只在编辑区内滚动', async ({ page }) => {
  const env = getE2EEnv()
  const marker = `daily-height-${Date.now().toString(36)}`
  const longMarkdown = Array.from({ length: 80 }, (_, index) => `第 ${index + 1} 行 ${marker}`).join('\n\n')

  await gotoDiary(page, TEST_DATE)
  await ensureReadySession(page, env)

  await page.getByTestId('diary-left-tab-search').click()
  await expect(page.getByTestId('diary-left-panel')).toBeVisible()
  await expect(page.getByTestId('diary-panel')).toBeVisible()

  const leftHeightBefore = await page.getByTestId('diary-left-panel').evaluate((node) => node.getBoundingClientRect().height)
  const rightHeightBefore = await page.getByTestId('diary-panel').evaluate((node) => node.getBoundingClientRect().height)
  expect(Math.abs(leftHeightBefore - rightHeightBefore)).toBeLessThanOrEqual(1)

  await page.getByTestId('daily-editor-mode-source').click()
  const sourceEditor = page.locator('textarea[data-testid="daily-editor"]').first()
  await expect(sourceEditor).toBeVisible()
  await sourceEditor.fill(longMarkdown)
  await waitForDailyDiaryPersisted(page, TEST_DATE, marker)

  const rightHeightAfter = await page.getByTestId('diary-panel').evaluate((node) => node.getBoundingClientRect().height)
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
  const leftPanel = page.getByTestId('diary-left-panel')
  const rightPanel = page.getByTestId('diary-panel')
  const editorRoot = page.locator('[data-testid="daily-editor"]').first()
  const proseMirror = page.locator('[data-testid="daily-editor"] .ProseMirror').first()
  await expect(proseMirror).toBeVisible()

  const leftHeightBefore = await leftPanel.evaluate((node) => node.getBoundingClientRect().height)
  const rightHeightBefore = await rightPanel.evaluate((node) => node.getBoundingClientRect().height)
  const editorHeightBefore = await editorRoot.evaluate((node) => node.getBoundingClientRect().height)
  expect(Math.abs(leftHeightBefore - rightHeightBefore)).toBeLessThanOrEqual(1)

  await proseMirror.click()
  await proseMirror.fill(markdown)
  await waitForDailyDiaryPersisted(page, TEST_DATE, marker)

  const leftHeightAfter = await leftPanel.evaluate((node) => node.getBoundingClientRect().height)
  const rightHeightAfter = await rightPanel.evaluate((node) => node.getBoundingClientRect().height)
  const editorHeightAfter = await editorRoot.evaluate((node) => node.getBoundingClientRect().height)
  expect(Math.abs(leftHeightAfter - rightHeightAfter)).toBeLessThanOrEqual(1)
  expect(Math.abs(rightHeightAfter - rightHeightBefore)).toBeLessThanOrEqual(1)
  expect(Math.abs(editorHeightAfter - editorHeightBefore)).toBeLessThanOrEqual(1)

  const editorOverflowY = await editorRoot.evaluate((node) => getComputedStyle(node).overflowY)
  expect(editorOverflowY).toBe('hidden')

  const proseScrollable = await proseMirror.evaluate((node) => node.scrollHeight > node.clientHeight + 1)
  expect(proseScrollable).toBeTruthy()
})
