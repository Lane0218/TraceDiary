import { describe, expect, it, vi } from 'vitest'
import type { ImportCandidateEntry } from '../import'
import { autoUploadImportedEntries } from '../import-sync'

describe('import-sync service', () => {
  it('应顺序上传并保存 baseline', async () => {
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
          createdAt: '2026-02-08T00:00:00.000Z',
          modifiedAt: '2026-02-08T00:00:00.000Z',
        },
      },
    ]

    const uploadDiary = vi.fn(async (payload: { metadata: { entryId: string }; expectedSha?: string }) => {
      expect(payload.expectedSha).toBe('sha-old')
      return {
        ok: true as const,
        conflict: false as const,
        remoteSha: 'sha-new',
        syncedAt: '2026-02-09T00:00:00.000Z',
      }
    })

    const saveBaseline = vi.fn(async () => {})

    const result = await autoUploadImportedEntries(candidates, {
      uploadDiary,
      loadBaseline: async () => ({
        entryId: 'daily:2026-02-08',
        fingerprint: 'fp-old',
        syncedAt: '2026-02-01T00:00:00.000Z',
        remoteSha: 'sha-old',
      }),
      saveBaseline,
    })

    expect(result.success).toEqual(['daily:2026-02-08'])
    expect(result.failed).toEqual([])
    expect(saveBaseline).toHaveBeenCalledTimes(1)
    expect(uploadDiary).toHaveBeenCalledTimes(1)
  })

  it('遇到失败应继续上传后续条目', async () => {
    const candidates: ImportCandidateEntry[] = [
      {
        sourceName: '2026-02-08.md',
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
      {
        sourceName: '2026-summary.md',
        entry: {
          type: 'yearly_summary',
          id: 'summary:2026',
          year: 2026,
          date: '2026-12-31',
          filename: '2026-summary.md.enc',
          content: 'b',
          wordCount: 1,
          createdAt: '2026-12-31T00:00:00.000Z',
          modifiedAt: '2026-12-31T00:00:00.000Z',
        },
      },
    ]

    const uploadDiary = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, conflict: false, reason: 'network' as const })
      .mockResolvedValueOnce({ ok: true, conflict: false, remoteSha: 'sha-2', syncedAt: '2026-02-10T00:00:00.000Z' })

    const progress: string[] = []
    const result = await autoUploadImportedEntries(candidates, {
      uploadDiary,
      onProgress: (snapshot) => {
        progress.push(`${snapshot.current}/${snapshot.total}:${snapshot.entryId}`)
      },
    })

    expect(result.success).toEqual(['summary:2026'])
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0]?.entryId).toBe('daily:2026-02-08')
    expect(progress).toEqual(['1/2:daily:2026-02-08', '2/2:summary:2026'])
  })
})
