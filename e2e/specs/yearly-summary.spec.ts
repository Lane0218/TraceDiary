import { expect, test, type Locator, type Page } from '@playwright/test'
import { buildRunMarker, ensureReadySession } from '../fixtures/app'
import { getE2EEnv } from '../fixtures/env'
import { readGiteeFile } from '../helpers/gitee-api'

const PERSIST_YEAR = 2099
const SYNC_YEAR = 2100

function yearlyEditorLocator(page: Page): Locator {
  return page.locator('section[aria-label="yearly-summary-page"] .ProseMirror').first()
}

async function writeYearlySummary(page: Page, content: string): Promise<void> {
  const editor = yearlyEditorLocator(page)
  await expect(editor).toBeVisible()

  await editor.fill(content)
  await expect(page.getByText('本地已保存')).toBeVisible({ timeout: 15_000 })
}

async function writeYearlySummaryInSourceMode(page: Page, content: string): Promise<void> {
  await page.getByRole('button', { name: '源码' }).click()
  const sourceEditor = page.locator('section[aria-label="yearly-summary-page"] textarea').first()
  await expect(sourceEditor).toBeVisible()
  await sourceEditor.fill(content)
  await expect(page.getByText('本地已保存')).toBeVisible({ timeout: 15_000 })

  await page.getByRole('button', { name: '源码' }).click()
  await expect(yearlyEditorLocator(page)).toBeVisible()
}

async function waitForYearlySummaryPersisted(page: Page, year: number, expectedContentFragment: string): Promise<void> {
  const entryId = `summary:${year}`

  await page.waitForFunction(
    async ({ dbName, storeName, key, expectedFragment }) => {
      const readContent = await new Promise<string | null>((resolve, reject) => {
        const request = indexedDB.open(dbName, 1)

        request.onerror = () => {
          reject(request.error ?? new Error('open indexeddb failed'))
        }

        request.onsuccess = () => {
          const db = request.result
          const tx = db.transaction(storeName, 'readonly')
          const store = tx.objectStore(storeName)
          const getRequest = store.get(key)

          getRequest.onerror = () => {
            reject(getRequest.error ?? new Error('get diary failed'))
          }

          getRequest.onsuccess = () => {
            const record = getRequest.result as { content?: unknown } | undefined
            resolve(typeof record?.content === 'string' ? record.content : null)
          }
        }
      })

      return typeof readContent === 'string' && readContent.includes(expectedFragment)
    },
    {
      dbName: 'TraceDiary',
      storeName: 'diaries',
      key: entryId,
      expectedFragment: expectedContentFragment,
    },
    { timeout: 15_000 },
  )
}

test('年度总结编辑后应写入 IndexedDB，并在切换年份后保持可读取', async ({ page }) => {
  const env = getE2EEnv()
  const marker = buildRunMarker('yearly-persist')
  const markdown = `# 年度标题 ${marker}\n\n正文段落 ${marker}\n\n- 年度要点 ${marker}\n1. 年度清单 ${marker}`

  await page.goto(`/yearly/${PERSIST_YEAR}`)
  await ensureReadySession(page, env)

  await writeYearlySummaryInSourceMode(page, markdown)
  await expect(page.locator('section[aria-label="yearly-summary-page"] .ProseMirror h1').first()).toContainText(
    `年度标题 ${marker}`,
  )
  await expect(page.locator('section[aria-label="yearly-summary-page"] .ProseMirror ul li').first()).toContainText(
    `年度要点 ${marker}`,
  )
  await expect(page.locator('section[aria-label="yearly-summary-page"] .ProseMirror ol li').first()).toContainText(
    `年度清单 ${marker}`,
  )
  await waitForYearlySummaryPersisted(page, PERSIST_YEAR, marker)

  await page.getByRole('button', { name: '下一年' }).click()
  await expect(page).toHaveURL(new RegExp(`/yearly/${PERSIST_YEAR + 1}$`))
  await expect(page.getByRole('heading', { name: `${PERSIST_YEAR + 1} 年度总结` })).toBeVisible()

  await page.goto(`/yearly/${PERSIST_YEAR}`)
  await ensureReadySession(page, env)
  await expect(page).toHaveURL(new RegExp(`/yearly/${PERSIST_YEAR}$`))
  await waitForYearlySummaryPersisted(page, PERSIST_YEAR, marker)
})

test('年度总结手动保存并立即上传后应显示同步成功且远端为密文', async ({ page }) => {
  const env = getE2EEnv()
  const marker = buildRunMarker('yearly-sync-ok')

  await page.goto(`/yearly/${SYNC_YEAR}`)
  await ensureReadySession(page, env)

  await writeYearlySummary(page, `E2E 年度上传 ${marker}`)
  await waitForYearlySummaryPersisted(page, SYNC_YEAR, marker)

  await page.getByRole('button', { name: '手动保存并立即上传' }).click()

  const syncStatus = page
    .locator('section[aria-label="yearly-summary-page"] .td-status-pill')
    .filter({ hasText: '云端已同步' })
    .first()
  await expect(syncStatus).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('alert')).toHaveCount(0)

  const remote = await readGiteeFile({
    owner: env.owner,
    repo: env.repo,
    branch: env.branch,
    token: env.token,
    path: `${SYNC_YEAR}-summary.md.enc`,
  })
  expect(remote.exists).toBe(true)
  const remoteContent = remote.content ?? ''
  expect(remoteContent).not.toContain(marker)
  expect(remoteContent).toMatch(/^[A-Za-z0-9+/=]+$/)
})
