import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import type { DiaryRecord } from '../indexeddb'
import { exportDiaryData } from '../export'

function createIsoDate(year: number, month: number, day: number, hour = 9): Date {
  return new Date(year, month, day, hour, 10, 11)
}

function buildDailyRecord(overrides: Partial<DiaryRecord> = {}): DiaryRecord {
  return {
    id: 'daily:2026-02-08',
    type: 'daily',
    date: '2026-02-08',
    content: '# 记录',
    wordCount: 3,
    createdAt: '2026-02-08T01:00:00.000Z',
    modifiedAt: '2026-02-08T02:00:00.000Z',
    ...overrides,
  }
}

function buildYearlyRecord(overrides: Partial<DiaryRecord> = {}): DiaryRecord {
  return {
    id: 'summary:2026',
    type: 'yearly_summary',
    year: 2026,
    date: '2026-12-31',
    content: '# 年度总结',
    wordCount: 4,
    createdAt: '2026-12-31T01:00:00.000Z',
    modifiedAt: '2026-12-31T02:00:00.000Z',
    ...overrides,
  }
}

describe('exportDiaryData', () => {
  it('应导出 zip 并包含 manifest 与明文文件', async () => {
    const downloads: Array<{ name: string; blob: Blob }> = []

    const result = await exportDiaryData({
      now: () => createIsoDate(2026, 1, 15),
      loadRecords: async () => [buildDailyRecord(), buildYearlyRecord()],
      downloadArchive: (blob, archiveName) => {
        downloads.push({ name: archiveName, blob })
      },
    })

    expect(result.outcome).toBe('success')
    expect(result.failed).toHaveLength(0)
    expect(result.success).toEqual(['daily:2026-02-08', 'summary:2026'])
    expect(downloads).toHaveLength(1)
    expect(downloads[0].name).toBe('trace-diary-export-20260215-091011.zip')

    const zip = await JSZip.loadAsync(await downloads[0].blob.arrayBuffer())
    const dailyFile = zip.file('diaries/2026-02-08.md')
    const yearlyFile = zip.file('summaries/2026-summary.md')
    const manifestFile = zip.file('manifest.json')

    expect(dailyFile).toBeTruthy()
    expect(yearlyFile).toBeTruthy()
    expect(manifestFile).toBeTruthy()
    await expect(dailyFile?.async('string')).resolves.toContain('# 记录')
    await expect(yearlyFile?.async('string')).resolves.toContain('# 年度总结')

    const manifest = JSON.parse((await manifestFile?.async('string')) ?? '{}') as {
      version: string
      entryCount: number
      dailyCount: number
      yearlySummaryCount: number
      files: Array<{ path: string }>
    }
    expect(manifest.version).toBe('1.1')
    expect(manifest.entryCount).toBe(2)
    expect(manifest.dailyCount).toBe(1)
    expect(manifest.yearlySummaryCount).toBe(1)
    expect(manifest.files.map((file) => file.path)).toEqual([
      'diaries/2026-02-08.md',
      'summaries/2026-summary.md',
    ])
  })

  it('无数据时应返回 no_data 且不触发下载', async () => {
    const downloads: Array<{ name: string; blob: Blob }> = []

    const result = await exportDiaryData({
      now: () => createIsoDate(2026, 1, 15),
      loadRecords: async () => [],
      downloadArchive: (blob, archiveName) => {
        downloads.push({ name: archiveName, blob })
      },
    })

    expect(result.outcome).toBe('no_data')
    expect(result.message).toBe('暂无可导出的日记数据')
    expect(downloads).toHaveLength(0)
  })

  it('单条记录失败时应继续导出其余条目并记录失败原因', async () => {
    const downloads: Array<{ name: string; blob: Blob }> = []
    const invalidDaily = buildDailyRecord({
      id: 'daily:bad-date',
      date: 'bad-date',
    })

    const result = await exportDiaryData({
      now: () => createIsoDate(2026, 1, 15),
      loadRecords: async () => [invalidDaily, buildYearlyRecord()],
      downloadArchive: (blob, archiveName) => {
        downloads.push({ name: archiveName, blob })
      },
    })

    expect(result.outcome).toBe('success')
    expect(result.success).toEqual(['summary:2026'])
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0].entryId).toBe('daily:bad-date')
    expect(result.failed[0].reason).toContain('日记日期格式无效')
    expect(downloads).toHaveLength(1)

    const zip = await JSZip.loadAsync(await downloads[0].blob.arrayBuffer())
    expect(zip.file('diaries/bad-date.md')).toBeNull()
    expect(zip.file('summaries/2026-summary.md')).toBeTruthy()
  })

  it('读取失败时应返回 blocked', async () => {
    const result = await exportDiaryData({
      loadRecords: async () => {
        throw new Error('indexeddb unavailable')
      },
      downloadArchive: () => {
        throw new Error('不应触发下载')
      },
    })

    expect(result.outcome).toBe('blocked')
    expect(result.message).toContain('indexeddb unavailable')
    expect(result.success).toHaveLength(0)
  })
})
