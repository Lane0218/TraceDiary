import { describe, expect, it, vi } from 'vitest'
import type { DiaryRecord } from '../indexeddb'
import {
  applyImportCandidates,
  buildImportResult,
  parseImportFileName,
  parseImportSourceFile,
  prepareImportPreview,
  type ImportCandidateEntry,
  type ImportSourceFile,
} from '../import'

describe('import service', () => {
  it('应正确解析 daily 文件名', () => {
    const parsed = parseImportFileName('2026-02-08.md')
    expect(parsed).toEqual({
      type: 'daily',
      id: 'daily:2026-02-08',
      date: '2026-02-08',
      filename: '2026-02-08.md.enc',
    })
  })

  it('应拒绝非法日期文件名', () => {
    expect(parseImportFileName('2026-02-30.md')).toBeNull()
    expect(parseImportFileName('2026-summary.txt')).toEqual({
      type: 'yearly_summary',
      id: 'summary:2026',
      year: 2026,
      date: '2026-12-31',
      filename: '2026-summary.md.enc',
    })
  })

  it('应把空内容标记为失败', () => {
    const source: ImportSourceFile = {
      name: '2026-02-08.md',
      mimeType: 'text/markdown',
      size: 0,
      content: '   ',
    }

    const parsed = parseImportSourceFile(source, '2026-02-10T00:00:00.000Z')
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) {
      expect(parsed.category).toBe('failed')
      expect(parsed.reason).toContain('文件内容为空')
    }
  })

  it('预检应区分可导入、冲突和无效命名', async () => {
    const sources: ImportSourceFile[] = [
      {
        name: '2026-02-08.md',
        mimeType: 'text/markdown',
        size: 5,
        content: 'hello',
      },
      {
        name: '2026-summary.md',
        mimeType: 'text/markdown',
        size: 6,
        content: 'summary',
      },
      {
        name: 'bad-name.md',
        mimeType: 'text/markdown',
        size: 3,
        content: 'bad',
      },
    ]

    const store = new Map<string, DiaryRecord>([
      [
        'summary:2026',
        {
          id: 'summary:2026',
          type: 'yearly_summary',
          year: 2026,
          date: '2026-12-31',
          content: 'local',
          createdAt: '2026-01-01T00:00:00.000Z',
          modifiedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    ])

    const preview = await prepareImportPreview(sources, {
      loadExistingDiary: async (entryId) => store.get(entryId) ?? null,
      now: () => '2026-02-10T00:00:00.000Z',
    })

    expect(preview.ready).toHaveLength(1)
    expect(preview.ready[0]?.entry.id).toBe('daily:2026-02-08')
    expect(preview.conflicts).toHaveLength(1)
    expect(preview.conflicts[0]?.entryId).toBe('summary:2026')
    expect(preview.invalid).toHaveLength(1)
  })

  it('写入时应保留已有 createdAt 并记录单条失败', async () => {
    const candidates: ImportCandidateEntry[] = [
      {
        sourceName: '2026-02-08.md',
        entry: {
          type: 'daily',
          id: 'daily:2026-02-08',
          date: '2026-02-08',
          filename: '2026-02-08.md.enc',
          content: 'hello',
          wordCount: 5,
          createdAt: '2026-02-08T10:00:00.000Z',
          modifiedAt: '2026-02-08T10:00:00.000Z',
        },
      },
      {
        sourceName: '2026-02-09.md',
        entry: {
          type: 'daily',
          id: 'daily:2026-02-09',
          date: '2026-02-09',
          filename: '2026-02-09.md.enc',
          content: 'world',
          wordCount: 5,
          createdAt: '2026-02-09T10:00:00.000Z',
          modifiedAt: '2026-02-09T10:00:00.000Z',
        },
      },
    ]

    const existing = new Map<string, DiaryRecord>([
      [
        'daily:2026-02-08',
        {
          id: 'daily:2026-02-08',
          type: 'daily',
          date: '2026-02-08',
          content: 'old',
          createdAt: '2020-01-01T00:00:00.000Z',
          modifiedAt: '2020-01-01T00:00:00.000Z',
        },
      ],
    ])
    const saved: DiaryRecord[] = []

    const saveDiary = vi.fn(async (record: DiaryRecord) => {
      if (record.id === 'daily:2026-02-09') {
        throw new Error('boom')
      }
      saved.push(record)
    })

    const result = await applyImportCandidates(candidates, {
      loadExistingDiary: async (entryId) => existing.get(entryId) ?? null,
      saveDiary,
    })

    expect(result.persisted).toHaveLength(1)
    expect(saved[0]?.createdAt).toBe('2020-01-01T00:00:00.000Z')
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0]?.entryId).toBe('daily:2026-02-09')
  })

  it('应正确汇总导入结果', () => {
    const importResult = buildImportResult({
      persisted: [
        {
          sourceName: 'a.md',
          entry: {
            type: 'daily',
            id: 'daily:2026-02-08',
            date: '2026-02-08',
            filename: '2026-02-08.md.enc',
            content: 'a',
            wordCount: 1,
            createdAt: '2026-02-08T00:00:00.000Z',
            modifiedAt: '2026-02-08T00:00:00.000Z',
          },
        },
      ],
      overwrittenEntryIds: ['daily:2026-02-08'],
      skippedEntryIds: ['summary:2026'],
      invalid: [{ name: 'bad.md', reason: '命名错误' }],
      failed: [{ name: 'x.md', reason: '读取失败' }],
      persistFailed: [{ name: 'y.md', reason: '写入失败' }],
    })

    expect(importResult.success).toEqual(['daily:2026-02-08'])
    expect(importResult.overwritten).toEqual(['daily:2026-02-08'])
    expect(importResult.skipped).toEqual(['summary:2026'])
    expect(importResult.invalid).toHaveLength(1)
    expect(importResult.failed).toHaveLength(2)
  })
})
