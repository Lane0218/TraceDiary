import { promises as fs } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import JSZip from 'jszip'
import { ensureReadySession, gotoDiary } from '../fixtures/app'
import { getE2EEnv } from '../fixtures/env'

const DAILY_DATE = '2199-12-30'
const SUMMARY_YEAR = 2199

async function seedExportRecords(page: Page, marker: string): Promise<void> {
  const now = new Date().toISOString()
  await page.evaluate(
    ({ dailyDate, summaryYear, nowIso, markerText }) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('TraceDiary', 1)

        request.onerror = () => {
          reject(request.error ?? new Error('open indexeddb failed'))
        }

        request.onsuccess = () => {
          const db = request.result
          const tx = db.transaction('diaries', 'readwrite')
          const store = tx.objectStore('diaries')

          store.put({
            id: `daily:${dailyDate}`,
            type: 'daily',
            date: dailyDate,
            filename: `${dailyDate}.md.enc`,
            content: `# 导出测试 ${markerText}\n\ndaily content ${markerText}`,
            wordCount: 24,
            createdAt: nowIso,
            modifiedAt: nowIso,
          })
          store.put({
            id: `summary:${summaryYear}`,
            type: 'yearly_summary',
            year: summaryYear,
            date: `${summaryYear}-12-31`,
            filename: `${summaryYear}-summary.md.enc`,
            content: `# 年度总结 ${markerText}\n\nsummary content ${markerText}`,
            wordCount: 26,
            createdAt: nowIso,
            modifiedAt: nowIso,
          })

          tx.oncomplete = () => {
            resolve()
          }
          tx.onerror = () => {
            reject(tx.error ?? new Error('write export records failed'))
          }
          tx.onabort = () => {
            reject(tx.error ?? new Error('write export records aborted'))
          }
        }
      }),
    {
      dailyDate: DAILY_DATE,
      summaryYear: SUMMARY_YEAR,
      nowIso: now,
      markerText: marker,
    },
  )
}

async function clearDiaryStore(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('TraceDiary', 1)
        request.onerror = () => {
          reject(request.error ?? new Error('open indexeddb failed'))
        }
        request.onsuccess = () => {
          const db = request.result
          const tx = db.transaction('diaries', 'readwrite')
          tx.objectStore('diaries').clear()
          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(tx.error ?? new Error('clear diaries failed'))
          tx.onabort = () => reject(tx.error ?? new Error('clear diaries aborted'))
        }
      }),
  )
}

test('设置页可导出明文 zip（含 manifest 与可回导命名） @smoke', async ({ page }) => {
  const env = getE2EEnv()
  const marker = `export-${Date.now().toString(36)}`

  await gotoDiary(page, '2100-01-08')
  await ensureReadySession(page, env)
  await seedExportRecords(page, marker)

  await page.getByTestId('app-nav-settings').click()
  await expect(page.getByLabel('settings-page')).toBeVisible()

  page.once('dialog', (dialog) => {
    void dialog.accept()
  })
  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId('settings-export-button').click()

  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^trace-diary-export-\d{8}-\d{6}\.zip$/)

  const downloadedPath = await download.path()
  if (!downloadedPath) {
    throw new Error('下载路径为空，无法校验导出内容')
  }

  const zipBuffer = await fs.readFile(downloadedPath)
  const zip = await JSZip.loadAsync(zipBuffer)

  const dailyFilePath = `diaries/${DAILY_DATE}.md`
  const summaryFilePath = `summaries/${SUMMARY_YEAR}-summary.md`
  const dailyFile = zip.file(dailyFilePath)
  const summaryFile = zip.file(summaryFilePath)
  const manifestFile = zip.file('manifest.json')

  expect(dailyFile).toBeTruthy()
  expect(summaryFile).toBeTruthy()
  expect(manifestFile).toBeTruthy()
  await expect(dailyFile?.async('string')).resolves.toContain(marker)
  await expect(summaryFile?.async('string')).resolves.toContain(marker)

  const manifestRaw = await manifestFile?.async('string')
  const manifest = JSON.parse(manifestRaw ?? '{}') as {
    version: string
    files: Array<{ path: string }>
  }
  expect(manifest.version).toBe('1.1')
  expect(manifest.files.some((item) => item.path === dailyFilePath)).toBe(true)
  expect(manifest.files.some((item) => item.path === summaryFilePath)).toBe(true)

  await expect(page.getByTestId('settings-export-result')).toBeVisible()
})

test('设置页无可导出数据时不应生成下载文件', async ({ page }) => {
  const env = getE2EEnv()

  await gotoDiary(page, '2100-01-09')
  await ensureReadySession(page, env)
  await clearDiaryStore(page)

  await page.getByTestId('app-nav-settings').click()
  await expect(page.getByLabel('settings-page')).toBeVisible()

  page.once('dialog', (dialog) => {
    void dialog.accept()
  })
  const downloadPromise = page
    .waitForEvent('download', { timeout: 1_200 })
    .then(() => true)
    .catch(() => false)

  await page.getByTestId('settings-export-button').click()

  const hasDownload = await downloadPromise
  expect(hasDownload).toBe(false)
  await expect(page.getByTestId('settings-export-result')).toContainText('暂无可导出的日记数据')
})
