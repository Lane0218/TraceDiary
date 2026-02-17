import { describe, expect, it } from 'vitest'
import type { DiaryRecord } from '../indexeddb'
import { applyImportCandidates, buildImportSourceFile, prepareImportPreview, type ImportReadableFile } from '../import'

const IMPORT_FILE_COUNT = 100
const SPEC_IMPORT_THRESHOLD_MS = 3_000
const FIXED_NOW_ISO = '2200-03-15T12:00:00.000Z'

function buildDateByIndex(index: number): string {
  const date = new Date(Date.UTC(2200, 0, 1 + index))
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function createReadableFiles(count: number): ImportReadableFile[] {
  return Array.from({ length: count }, (_, index) => {
    const date = buildDateByIndex(index)
    const content = `导入性能验收样本-${index + 1}`
    return {
      name: `${date}.md`,
      type: 'text/markdown',
      size: content.length,
      lastModified: Date.parse(FIXED_NOW_ISO) + index * 1_000,
      text: async () => content,
    }
  })
}

describe('import performance acceptance', () => {
  it('100 文件导入耗时应不超过 3 秒（不含远端同步）', async () => {
    const localStore = new Map<string, DiaryRecord>()
    const readableFiles = createReadableFiles(IMPORT_FILE_COUNT)

    const startedAt = Date.now()
    const sources = await Promise.all(readableFiles.map((file) => buildImportSourceFile(file)))
    const preview = await prepareImportPreview(sources, {
      loadExistingDiary: async (entryId) => localStore.get(entryId) ?? null,
      now: () => FIXED_NOW_ISO,
    })
    const applyResult = await applyImportCandidates(preview.ready, {
      loadExistingDiary: async (entryId) => localStore.get(entryId) ?? null,
      saveDiary: async (record) => {
        localStore.set(record.id, record)
      },
    })
    const elapsedMs = Date.now() - startedAt

    expect(preview.invalid).toEqual([])
    expect(preview.failed).toEqual([])
    expect(preview.conflicts).toEqual([])
    expect(preview.ready).toHaveLength(IMPORT_FILE_COUNT)
    expect(applyResult.failed).toEqual([])
    expect(applyResult.persisted).toHaveLength(IMPORT_FILE_COUNT)
    expect(localStore.size).toBe(IMPORT_FILE_COUNT)
    expect(elapsedMs).toBeLessThanOrEqual(SPEC_IMPORT_THRESHOLD_MS)

    console.info(`[TD-TEST-005] import-100-files-ms=${elapsedMs}`)
  })
})
