import type { SyncBaselineRecord } from './indexeddb'
import type { ImportCandidateEntry } from './import'
import type { DiarySyncMetadata, UploadMetadataFn } from './sync'
import { getDiarySyncFingerprint } from '../utils/sync-dirty'

export interface ImportUploadProgress {
  current: number
  total: number
  entryId: string
}

export interface ImportAutoUploadResult {
  success: string[]
  failed: Array<{ entryId: string; reason: string }>
}

function nowIsoString(): string {
  return new Date().toISOString()
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }
  return '未知错误'
}

function toDiarySyncMetadata(candidate: ImportCandidateEntry): DiarySyncMetadata {
  if (candidate.entry.type === 'daily') {
    return {
      type: 'daily',
      entryId: candidate.entry.id,
      date: candidate.entry.date,
      content: candidate.entry.content,
      modifiedAt: candidate.entry.modifiedAt,
    }
  }

  return {
    type: 'yearly_summary',
    entryId: candidate.entry.id,
    year: candidate.entry.year,
    content: candidate.entry.content,
    modifiedAt: candidate.entry.modifiedAt,
  }
}

function mapUploadFailureReason(reason?: 'sha_mismatch' | 'network' | 'auth'): string {
  if (reason === 'auth') {
    return '鉴权失败，请重新解锁或更新 Token'
  }
  if (reason === 'network') {
    return '网络异常，上传失败'
  }
  if (reason === 'sha_mismatch') {
    return '远端发生冲突（sha mismatch）'
  }
  return '上传失败'
}

export async function autoUploadImportedEntries(
  candidates: ImportCandidateEntry[],
  dependencies: {
    uploadDiary: UploadMetadataFn<DiarySyncMetadata>
    loadBaseline?: (entryId: string) => Promise<SyncBaselineRecord | null>
    saveBaseline?: (record: SyncBaselineRecord) => Promise<void>
    now?: () => string
    onProgress?: (progress: ImportUploadProgress) => void
  },
): Promise<ImportAutoUploadResult> {
  const result: ImportAutoUploadResult = {
    success: [],
    failed: [],
  }

  const total = candidates.length
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index]!
    const metadata = toDiarySyncMetadata(candidate)
    dependencies.onProgress?.({
      current: index + 1,
      total,
      entryId: metadata.entryId,
    })

    try {
      const baseline = dependencies.loadBaseline ? await dependencies.loadBaseline(metadata.entryId) : null
      const uploadPayload = baseline?.remoteSha
        ? {
            metadata,
            reason: 'manual' as const,
            expectedSha: baseline.remoteSha,
          }
        : {
            metadata,
            reason: 'manual' as const,
          }
      const uploadResult = await dependencies.uploadDiary(uploadPayload)
      if (!uploadResult || !uploadResult.ok) {
        result.failed.push({
          entryId: metadata.entryId,
          reason: mapUploadFailureReason(uploadResult?.reason),
        })
        continue
      }

      result.success.push(metadata.entryId)
      if (!dependencies.saveBaseline) {
        continue
      }

      const syncedAt = uploadResult.syncedAt ?? (dependencies.now ?? nowIsoString)()
      const baselineRecord: SyncBaselineRecord = {
        entryId: metadata.entryId,
        fingerprint: getDiarySyncFingerprint(metadata),
        syncedAt,
        remoteSha: uploadResult.remoteSha,
      }
      await dependencies.saveBaseline(baselineRecord)
    } catch (error) {
      result.failed.push({
        entryId: metadata.entryId,
        reason: `上传异常：${toErrorMessage(error)}`,
      })
    }
  }

  return result
}
