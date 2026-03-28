import { describe, expect, it } from 'vitest'

import {
  createCanonicalIndexDocument,
  normalizeCanonicalIndexDocument,
} from '../index-manifest'

describe('normalizeCanonicalIndexDocument', () => {
  it('应兼容旧导出 manifest.files 结构并补齐 canonical entries', () => {
    const manifest = {
      version: '1.1',
      exportedAt: '2026-03-28T13:32:45.660Z',
      archiveName: 'trace-diary-export-20260328-213245.zip',
      entryCount: 2,
      dailyCount: 1,
      yearlySummaryCount: 1,
      files: [
        {
          entryId: 'daily:2023-08-10',
          path: 'diaries/2023-08-10.md',
          modifiedAt: '2026-02-17T16:07:43.445Z',
          wordCount: 93,
        },
        {
          entryId: 'summary:2025',
          path: 'summaries/2025-summary.md',
          modifiedAt: '2026-03-05T16:29:05.168Z',
          wordCount: 8392,
        },
      ],
    }

    const result = normalizeCanonicalIndexDocument(manifest, '2026-03-28T13:40:00.000Z')

    expect(result.version).toBe('1.1')
    expect(result.generatedAt).toBe('2026-03-28T13:32:45.660Z')
    expect(result.archiveName).toBe('trace-diary-export-20260328-213245.zip')
    expect(result.entryCount).toBe(2)
    expect(result.dailyCount).toBe(1)
    expect(result.yearlySummaryCount).toBe(1)
    expect(result.entries).toEqual([
      {
        entryId: 'daily:2023-08-10',
        type: 'daily',
        date: '2023-08-10',
        path: 'diaries/2023-08-10.md',
        filename: '2023-08-10.md.enc',
        wordCount: 93,
        createdAt: '2026-02-17T16:07:43.445Z',
        modifiedAt: '2026-02-17T16:07:43.445Z',
      },
      {
        entryId: 'summary:2025',
        type: 'yearly_summary',
        year: 2025,
        date: '2025-12-31',
        path: 'summaries/2025-summary.md',
        filename: '2025-summary.md.enc',
        wordCount: 8392,
        createdAt: '2026-03-05T16:29:05.168Z',
        modifiedAt: '2026-03-05T16:29:05.168Z',
      },
    ])
  })

  it('应兼容旧 metadata.lastSync 结构并补齐 entryId/path', () => {
    const metadata = {
      version: '1',
      lastSync: '2026-03-28T13:32:45.660Z',
      entries: [
        {
          type: 'daily',
          date: '2026-03-27',
          filename: '2026-03-27.md.enc',
          wordCount: 1087,
          createdAt: '2026-03-27T16:19:21.793Z',
          modifiedAt: '2026-03-27T16:19:21.793Z',
        },
      ],
    }

    const result = normalizeCanonicalIndexDocument(metadata, '2026-03-28T13:40:00.000Z')

    expect(result.generatedAt).toBe('2026-03-28T13:32:45.660Z')
    expect(result.entryCount).toBe(1)
    expect(result.entries[0]).toEqual({
      entryId: 'daily:2026-03-27',
      type: 'daily',
      date: '2026-03-27',
      path: 'diaries/2026-03-27.md',
      filename: '2026-03-27.md.enc',
      wordCount: 1087,
      createdAt: '2026-03-27T16:19:21.793Z',
      modifiedAt: '2026-03-27T16:19:21.793Z',
    })
  })
})

describe('createCanonicalIndexDocument', () => {
  it('应自动回填总数并按条目类型排序', () => {
    const result = createCanonicalIndexDocument(
      [
        {
          entryId: 'summary:2026',
          type: 'yearly_summary',
          year: 2026,
          date: '2026-12-31',
          path: 'summaries/2026-summary.md',
          filename: '2026-summary.md.enc',
          wordCount: 100,
          createdAt: '2026-12-31T01:00:00.000Z',
          modifiedAt: '2026-12-31T02:00:00.000Z',
        },
        {
          entryId: 'daily:2026-03-27',
          type: 'daily',
          date: '2026-03-27',
          path: 'diaries/2026-03-27.md',
          filename: '2026-03-27.md.enc',
          wordCount: 10,
          createdAt: '2026-03-27T01:00:00.000Z',
          modifiedAt: '2026-03-27T02:00:00.000Z',
        },
      ],
      '2026-03-28T13:40:00.000Z',
      {
        archiveName: 'trace-diary-export.zip',
      },
    )

    expect(result.entryCount).toBe(2)
    expect(result.dailyCount).toBe(1)
    expect(result.yearlySummaryCount).toBe(1)
    expect(result.archiveName).toBe('trace-diary-export.zip')
    expect(result.entries[0]?.entryId).toBe('daily:2026-03-27')
    expect(result.entries[1]?.entryId).toBe('summary:2026')
  })
})
