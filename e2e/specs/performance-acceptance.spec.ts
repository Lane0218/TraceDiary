import { expect, test, type Page } from '@playwright/test'
import { ensureReadySession, gotoDiary } from '../fixtures/app'
import { getE2EEnv, type E2EEnv } from '../fixtures/env'

const PERF_BASE_DATE = '2200-03-15'
const PERF_SWITCH_DATE = '2200-03-16'
const HISTORY_DATES = ['2199-03-15', '2198-03-15', '2197-03-15', '2196-03-15', '2195-03-15'] as const
const INPUT_SAMPLES = 12

const SPEC_THRESHOLDS = {
  firstLoadMs: 3_000,
  dateSwitchMs: 200,
  onThisDayQueryMs: 1_000,
  inputLatencyMs: 50,
} as const

interface InputLatencyMetric {
  averageMs: number
  p95Ms: number
  maxMs: number
}

interface DiarySeedEntry {
  date: string
  content: string
}

function roundMs(value: number): number {
  return Math.round(value * 100) / 100
}

async function seedDiaries(page: Page, entries: DiarySeedEntry[]): Promise<void> {
  await page.evaluate(async ({ payload }) => {
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

        for (const entry of payload) {
          const wordCount = entry.content.replace(/\s+/gu, '').length
          store.put({
            id: `daily:${entry.date}`,
            type: 'daily',
            date: entry.date,
            filename: `${entry.date}.md.enc`,
            content: entry.content,
            wordCount,
            createdAt: now,
            modifiedAt: now,
          })
        }

        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error ?? new Error('indexeddb transaction failed'))
        tx.onabort = () => reject(tx.error ?? new Error('indexeddb transaction aborted'))
      }
    })
  }, {
    payload: entries,
  })
}

async function measureFirstLoad(page: Page, env: E2EEnv): Promise<number> {
  const startedAt = Date.now()
  await page.reload({ waitUntil: 'domcontentloaded' })
  await ensureReadySession(page, env)
  await expect(page.getByLabel('diary-layout')).toBeVisible()
  await expect(page.getByTestId('daily-editor')).toBeVisible()
  return Date.now() - startedAt
}

async function openMonth(page: Page, year: number, month: number): Promise<void> {
  await page.getByRole('button', { name: '选择年月' }).click()
  await page.locator('#month-picker-year').fill(String(year))
  await page.getByRole('button', { name: `${month}月` }).click()
  await page.getByRole('button', { name: '确定' }).click()
  await expect(page.getByRole('button', { name: '选择年月' })).toContainText(`${year}年${month}月`)
}

async function measureDateSwitch(page: Page, targetDate: string): Promise<number> {
  return page.evaluate(async ({ date }) => {
    const button = document.querySelector<HTMLButtonElement>(`button[aria-label="选择 ${date}"]`)
    if (!button) {
      throw new Error(`未找到日期按钮：${date}`)
    }

    const startedAt = performance.now()
    button.click()

    await new Promise<void>((resolve, reject) => {
      const deadline = performance.now() + 5_000

      const check = () => {
        const heading = document.querySelector('[data-testid="diary-panel"] h3')
        const ready = heading?.textContent?.includes(date)
        if (ready) {
          resolve()
          return
        }
        if (performance.now() > deadline) {
          reject(new Error(`切换日期超时：${date}`))
          return
        }
        requestAnimationFrame(check)
      }

      check()
    })

    return performance.now() - startedAt
  }, {
    date: targetDate,
  })
}

async function measureOnThisDayQuery(
  page: Page,
  payload: { targetDate: string; expectedDates: readonly string[] },
): Promise<number> {
  return page.evaluate(async ({ targetDate, expectedDates }) => {
    const button = document.querySelector<HTMLButtonElement>(`button[aria-label="选择 ${targetDate}"]`)
    if (!button) {
      throw new Error(`未找到往年今日目标日期按钮：${targetDate}`)
    }

    const expectedLabels = expectedDates.map((date) => `打开 ${date}`)
    const startedAt = performance.now()
    button.click()

    await new Promise<void>((resolve, reject) => {
      const deadline = performance.now() + 5_000

      const check = () => {
        const cards = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-testid="history-card"]'))
        const labels = cards.map((card) => card.getAttribute('aria-label') ?? '')
        const hasAllExpected = expectedLabels.every((label) => labels.includes(label))
        if (cards.length >= expectedLabels.length && hasAllExpected) {
          resolve()
          return
        }
        if (performance.now() > deadline) {
          reject(new Error(`往年今日查询超时：${targetDate}`))
          return
        }
        requestAnimationFrame(check)
      }

      check()
    })

    return performance.now() - startedAt
  }, payload)
}

async function ensureSourceEditor(page: Page): Promise<void> {
  const sourceModeButton = page.getByTestId('daily-editor-mode-source')
  if ((await sourceModeButton.getAttribute('aria-pressed')) !== 'true') {
    await sourceModeButton.click()
  }
  await expect(page.locator('textarea[data-testid="daily-editor"]').first()).toBeVisible()
}

async function readWordCount(page: Page): Promise<number> {
  const text = await page.getByTestId('daily-editor-word-count').first().innerText()
  const matched = text.match(/(\d+)/u)
  return matched ? Number.parseInt(matched[1], 10) : 0
}

async function measureInputLatency(page: Page, sampleCount: number): Promise<InputLatencyMetric> {
  if (!Number.isFinite(sampleCount) || sampleCount <= 0) {
    throw new Error('sampleCount 必须为正数')
  }

  const editor = page.locator('textarea[data-testid="daily-editor"]').first()
  await expect(editor).toBeVisible()
  await editor.click()

  const initialWordCount = await readWordCount(page)
  const latencies: number[] = []

  for (let index = 0; index < sampleCount; index += 1) {
    const expectedCount = initialWordCount + index + 1
    const startedAt = performance.now()
    await page.keyboard.type('a')

    await expect
      .poll(() => readWordCount(page), {
        timeout: 2_000,
        message: `字数未在时限内更新：${expectedCount}`,
      })
      .toBe(expectedCount)

    latencies.push(performance.now() - startedAt)
  }

  const sorted = [...latencies].sort((left, right) => left - right)
  const p95Index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1)
  const averageMs = latencies.reduce((sum, value) => sum + value, 0) / latencies.length

  return {
    averageMs,
    p95Ms: sorted[p95Index],
    maxMs: sorted[sorted.length - 1],
  }
}

test('@slow 性能验收应满足 SPEC 阈值', async ({ page }, testInfo) => {
  const env = getE2EEnv()

  await gotoDiary(page, PERF_BASE_DATE)
  await ensureReadySession(page, env)

  const seedEntries: DiarySeedEntry[] = [
    { date: PERF_BASE_DATE, content: '性能验收 基准日 2200-03-15' },
    { date: PERF_SWITCH_DATE, content: '性能验收 切换日 2200-03-16' },
    ...HISTORY_DATES.map((date, index) => ({
      date,
      content: `性能验收 往年今日样本 ${index + 1} ${date}`,
    })),
  ]
  await seedDiaries(page, seedEntries)

  const firstLoadMs = await measureFirstLoad(page, env)
  await openMonth(page, 2200, 3)

  const dateSwitchMs = await measureDateSwitch(page, PERF_SWITCH_DATE)
  await expect(page.getByRole('heading', { name: `${PERF_SWITCH_DATE} 日记` })).toBeVisible()

  const onThisDayQueryMs = await measureOnThisDayQuery(page, {
    targetDate: PERF_BASE_DATE,
    expectedDates: HISTORY_DATES,
  })
  await expect(page.getByTestId('history-card')).toHaveCount(HISTORY_DATES.length)

  await ensureSourceEditor(page)
  const inputLatency = await measureInputLatency(page, INPUT_SAMPLES)

  const measured = {
    firstLoadMs: roundMs(firstLoadMs),
    dateSwitchMs: roundMs(dateSwitchMs),
    onThisDayQueryMs: roundMs(onThisDayQueryMs),
    inputLatencyP95Ms: roundMs(inputLatency.p95Ms),
    inputLatencyAvgMs: roundMs(inputLatency.averageMs),
    inputLatencyMaxMs: roundMs(inputLatency.maxMs),
  }

  expect.soft(measured.firstLoadMs).toBeLessThanOrEqual(SPEC_THRESHOLDS.firstLoadMs)
  expect.soft(measured.dateSwitchMs).toBeLessThanOrEqual(SPEC_THRESHOLDS.dateSwitchMs)
  expect.soft(measured.onThisDayQueryMs).toBeLessThanOrEqual(SPEC_THRESHOLDS.onThisDayQueryMs)
  expect.soft(measured.inputLatencyP95Ms).toBeLessThanOrEqual(SPEC_THRESHOLDS.inputLatencyMs)

  const reportPayload = {
    measured,
    thresholds: SPEC_THRESHOLDS,
    pass: {
      firstLoad: measured.firstLoadMs <= SPEC_THRESHOLDS.firstLoadMs,
      dateSwitch: measured.dateSwitchMs <= SPEC_THRESHOLDS.dateSwitchMs,
      onThisDayQuery: measured.onThisDayQueryMs <= SPEC_THRESHOLDS.onThisDayQueryMs,
      inputLatency: measured.inputLatencyP95Ms <= SPEC_THRESHOLDS.inputLatencyMs,
    },
  }

  console.info(`[TD-TEST-005] e2e-performance=${JSON.stringify(reportPayload)}`)
  await testInfo.attach('performance-acceptance-metrics', {
    body: JSON.stringify(reportPayload, null, 2),
    contentType: 'application/json',
  })
})
