import { expect, test } from '@playwright/test'
import {
  ensureReadySession,
  gotoWorkspace,
  waitForDailyDiaryPersisted,
} from '../fixtures/app'
import { getE2EEnv } from '../fixtures/env'

const TEST_DATE = '2099-12-29'

test('日记编辑后应持久化到 IndexedDB 并保留可见内容', async ({ page }) => {
  const env = getE2EEnv()
  const marker = `daily-edit-${Date.now().toString(36)}`
  const markdown = `# 标题 ${marker}\n\n正文 ${marker}\n\n- 无序项 ${marker}\n1. 编号项 ${marker}`

  await gotoWorkspace(page, TEST_DATE)
  await ensureReadySession(page, env)

  await page.getByTestId('daily-editor-mode-source').click()
  const sourceEditor = page.locator('textarea[data-testid="daily-editor"]').first()
  await expect(sourceEditor).toBeVisible()
  await sourceEditor.fill(markdown)
  await expect(page.getByText('本地已保存')).toBeVisible({ timeout: 15_000 })

  await page.getByTestId('daily-editor-mode-wysiwyg').click()
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

  await waitForDailyDiaryPersisted(page, TEST_DATE, marker)
  await page.waitForTimeout(800)

  await page.reload()
  await ensureReadySession(page, env)
  await waitForDailyDiaryPersisted(page, TEST_DATE, marker)

  const editor = page.locator('[data-testid="daily-editor"] .ProseMirror').first()
  await expect(editor).toContainText(marker, { timeout: 15_000 })
})
