import { expect, test } from '@playwright/test'
import { ensureReadySession, gotoDiary } from '../fixtures/app'
import { getE2EEnv } from '../fixtures/env'

const IMPORT_DATE = '2099-12-29'

test('导入完成后应自动上传本次导入条目', async ({ page }) => {
  const env = getE2EEnv()
  const marker = `import-${Date.now()}`

  await gotoDiary(page, IMPORT_DATE)
  await ensureReadySession(page, env)

  await page.getByTestId('import-file-input').setInputFiles([
    {
      name: `${IMPORT_DATE}.md`,
      mimeType: 'text/markdown',
      buffer: Buffer.from(`自动导入测试 ${marker}`),
    },
  ])

  await expect(page.getByTestId('import-result-dialog')).toBeVisible({ timeout: 120_000 })
  await expect(page.getByTestId('import-result-dialog')).toContainText('导入结果')
  await expect(page.getByTestId('import-result-dialog')).toContainText('自动上传汇总')
  await expect(page.getByTestId('toast-push')).toContainText(/导入并自动上传完成|自动上传完成/)
})
