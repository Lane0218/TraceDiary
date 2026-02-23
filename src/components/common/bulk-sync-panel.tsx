import { useMemo, useState } from 'react'
import type { UseAuthResult } from '../../hooks/use-auth'
import { useToast } from '../../hooks/use-toast'
import {
  DIARY_INDEX_MODIFIED_AT,
  getSyncBaseline,
  listDiariesByIndex,
  saveSyncBaseline,
  type DiaryRecord,
} from '../../services/indexeddb'
import {
  createDiaryUploadExecutor,
  pullRemoteDiariesToIndexedDb,
  type DiarySyncMetadata,
  type PullRemoteDiariesToIndexedDbResult,
  type UploadFailureReason,
} from '../../services/sync'
import { emitRemotePullCompletedEvent } from '../../utils/remote-sync-events'
import { getSyncAvailability } from '../../utils/sync-availability'
import { getDiarySyncFingerprint } from '../../utils/sync-dirty'
import PullResultDialog from './pull-result-dialog'

interface BulkSyncPanelProps {
  auth: UseAuthResult
}

interface BulkPushSummaryItem {
  entryId: string
  reason: string
}

interface BulkPushResult {
  total: number
  success: number
  skipped: number
  conflicted: number
  failed: number
  executedAt: string
  skippedItems: BulkPushSummaryItem[]
  conflictItems: BulkPushSummaryItem[]
  failedItems: BulkPushSummaryItem[]
}

const BULK_PULL_CONFIRM_MESSAGE = '将从远端批量 pull 全部条目，并按规则更新本地数据。确认继续？'
const BULK_PUSH_CONFIRM_MESSAGE = '将把本地全部条目批量 push 到远端。该操作可能触发远端冲突，确认继续？'

function mapUploadFailureReason(reason?: UploadFailureReason): string {
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

function toSyncMetadata(record: DiaryRecord): { ok: true; metadata: DiarySyncMetadata } | { ok: false; reason: string } {
  if (record.type === 'daily') {
    if (!record.date || !/^\d{4}-\d{2}-\d{2}$/.test(record.date)) {
      return {
        ok: false,
        reason: '缺少合法日期字段',
      }
    }
    return {
      ok: true,
      metadata: {
        type: 'daily',
        entryId: record.id,
        date: record.date,
        content: record.content ?? '',
        modifiedAt: record.modifiedAt,
      },
    }
  }

  if (record.type === 'yearly_summary') {
    const year = record.year
    if (typeof year !== 'number' || !Number.isFinite(year)) {
      return {
        ok: false,
        reason: '缺少合法年份字段',
      }
    }

    return {
      ok: true,
      metadata: {
        type: 'yearly_summary',
        entryId: record.id,
        year,
        content: record.content ?? '',
        modifiedAt: record.modifiedAt,
      },
    }
  }

  return {
    ok: false,
    reason: `不支持的条目类型：${record.type}`,
  }
}

function formatExecutedAt(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleString('zh-CN', { hour12: false })
}

function getPushResultToneClass(result: BulkPushResult): string {
  if (result.total === 0) {
    return 'is-muted'
  }
  if (result.failed > 0) {
    return 'is-danger'
  }
  if (result.conflicted > 0 || result.skipped > 0) {
    return 'is-warning'
  }
  return 'is-success'
}

export default function BulkSyncPanel({ auth }: BulkSyncPanelProps) {
  const { push: pushToast } = useToast()
  const [isPullingAll, setIsPullingAll] = useState(false)
  const [isPushingAll, setIsPushingAll] = useState(false)
  const [pullResult, setPullResult] = useState<PullRemoteDiariesToIndexedDbResult | null>(null)
  const [isPullResultOpen, setIsPullResultOpen] = useState(false)
  const [pushResult, setPushResult] = useState<BulkPushResult | null>(null)

  const giteeBranch = auth.state.config?.giteeBranch?.trim() || 'master'
  const dataEncryptionKey = auth.state.dataEncryptionKey
  const syncAvailability = useMemo(
    () =>
      getSyncAvailability({
        stage: auth.state.stage,
        giteeOwner: auth.state.config?.giteeOwner,
        giteeRepoName: auth.state.config?.giteeRepoName,
        tokenInMemory: auth.state.tokenInMemory,
        dataEncryptionKey,
      }),
    [
      auth.state.config?.giteeOwner,
      auth.state.config?.giteeRepoName,
      auth.state.stage,
      auth.state.tokenInMemory,
      dataEncryptionKey,
    ],
  )

  const canSyncToRemote = syncAvailability.canSyncToRemote
  const isBusy = isPullingAll || isPushingAll
  const isActionDisabled = isBusy || !canSyncToRemote

  const handlePullAll = async () => {
    if (isActionDisabled) {
      return
    }

    if (!window.confirm(BULK_PULL_CONFIRM_MESSAGE)) {
      return
    }

    setIsPullingAll(true)
    setPullResult(null)
    pushToast({
      kind: 'pull',
      level: 'info',
      message: '全量 pull 已触发，正在执行...',
      autoDismiss: false,
    })

    try {
      const result = await pullRemoteDiariesToIndexedDb(
        {
          token: auth.state.tokenInMemory as string,
          owner: auth.state.config?.giteeOwner as string,
          repo: auth.state.config?.giteeRepoName as string,
          branch: giteeBranch,
          dataEncryptionKey: dataEncryptionKey as CryptoKey,
        },
        {
          loadBaseline: (entryId) => getSyncBaseline(entryId),
          saveBaseline: (baseline) => saveSyncBaseline(baseline),
        },
      )

      setPullResult(result)
      setIsPullResultOpen(true)
      emitRemotePullCompletedEvent()

      const summaryMessage = `全量 pull 完成：新增 ${result.inserted}，更新 ${result.updated}，跳过 ${result.skipped}，冲突 ${result.conflicted}，失败 ${result.failed}`
      pushToast({
        kind: 'pull',
        level: result.failed > 0 || result.conflicted > 0 ? 'warning' : 'success',
        message: summaryMessage,
      })
    } catch (error) {
      const message = error instanceof Error && error.message.trim() ? error.message : '全量 pull 失败，请稍后重试'
      pushToast({
        kind: 'pull',
        level: 'error',
        message,
      })
    } finally {
      setIsPullingAll(false)
    }
  }

  const handlePushAll = async () => {
    if (isActionDisabled) {
      return
    }

    if (!window.confirm(BULK_PUSH_CONFIRM_MESSAGE)) {
      return
    }

    setIsPushingAll(true)
    setPushResult(null)
    pushToast({
      kind: 'push',
      level: 'info',
      message: '全量 push 已触发，正在执行...',
      autoDismiss: false,
    })

    const uploadDiary = createDiaryUploadExecutor({
      token: auth.state.tokenInMemory as string,
      owner: auth.state.config?.giteeOwner as string,
      repo: auth.state.config?.giteeRepoName as string,
      branch: giteeBranch,
      dataEncryptionKey: dataEncryptionKey as CryptoKey,
      syncMetadata: true,
    })

    const nextResult: BulkPushResult = {
      total: 0,
      success: 0,
      skipped: 0,
      conflicted: 0,
      failed: 0,
      executedAt: new Date().toISOString(),
      skippedItems: [],
      conflictItems: [],
      failedItems: [],
    }

    try {
      const localRecords = await listDiariesByIndex(DIARY_INDEX_MODIFIED_AT)
      const syncRecords = localRecords.filter(
        (record) => record.type === 'daily' || record.type === 'yearly_summary',
      )

      nextResult.total = syncRecords.length
      if (syncRecords.length === 0) {
        setPushResult(nextResult)
        pushToast({
          kind: 'push',
          level: 'info',
          message: '本地暂无可批量上传条目。',
        })
        return
      }

      for (const record of syncRecords) {
        const transformed = toSyncMetadata(record)
        if (!transformed.ok) {
          nextResult.failed += 1
          nextResult.failedItems.push({
            entryId: record.id,
            reason: transformed.reason,
          })
          continue
        }

        const metadata = transformed.metadata
        if (!metadata.content.trim()) {
          nextResult.skipped += 1
          nextResult.skippedItems.push({
            entryId: metadata.entryId,
            reason: '内容为空，已跳过',
          })
          continue
        }

        try {
          const baseline = await getSyncBaseline(metadata.entryId)
          const expectedSha = baseline?.remoteSha?.trim() || undefined
          const uploadResult = await uploadDiary({
            metadata,
            reason: 'manual',
            expectedSha,
          })

          if (uploadResult?.ok) {
            nextResult.success += 1
            await saveSyncBaseline({
              entryId: metadata.entryId,
              fingerprint: getDiarySyncFingerprint(metadata),
              syncedAt: uploadResult.syncedAt ?? new Date().toISOString(),
              remoteSha: uploadResult.remoteSha,
            })
            continue
          }

          if (uploadResult?.conflict || uploadResult?.reason === 'sha_mismatch') {
            nextResult.conflicted += 1
            nextResult.conflictItems.push({
              entryId: metadata.entryId,
              reason: mapUploadFailureReason('sha_mismatch'),
            })
            continue
          }

          nextResult.failed += 1
          nextResult.failedItems.push({
            entryId: metadata.entryId,
            reason: mapUploadFailureReason(uploadResult?.reason),
          })
        } catch (error) {
          const message = error instanceof Error && error.message.trim() ? error.message.trim() : '上传异常'
          nextResult.failed += 1
          nextResult.failedItems.push({
            entryId: metadata.entryId,
            reason: message,
          })
        }
      }

      setPushResult(nextResult)
      const summaryMessage = `全量 push 完成：成功 ${nextResult.success}，跳过 ${nextResult.skipped}，冲突 ${nextResult.conflicted}，失败 ${nextResult.failed}`
      pushToast({
        kind: 'push',
        level: nextResult.failed > 0 || nextResult.conflicted > 0 ? 'warning' : 'success',
        message: summaryMessage,
      })
    } catch (error) {
      const message = error instanceof Error && error.message.trim() ? error.message.trim() : '全量 push 失败，请稍后重试'
      pushToast({
        kind: 'push',
        level: 'error',
        message,
      })
    } finally {
      setIsPushingAll(false)
    }
  }

  return (
    <>
      <article className="td-settings-data-row" aria-label="settings-bulk-sync-panel">
        <div className="td-settings-data-row-top">
          <header className="td-settings-data-row-header">
            <h3 className="td-settings-data-row-title">高级同步</h3>
            <p className="td-settings-data-row-desc">在设置页执行批量同步：pull 全部 或 push 全部。</p>
          </header>

          <div className="td-settings-data-row-actions">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="td-btn td-btn-secondary-soft"
                onClick={() => {
                  void handlePullAll()
                }}
                disabled={isActionDisabled}
                data-testid="settings-bulk-pull-button"
              >
                <span className={`td-sync-control-btn-label ${isPullingAll ? 'is-running' : ''}`}>
                  {isPullingAll ? <span className="td-sync-control-running-dot" aria-hidden="true" /> : null}
                  <span>{isPullingAll ? 'pulling...' : 'pull 全部'}</span>
                </span>
              </button>

              <button
                type="button"
                className="td-btn td-btn-secondary-soft"
                onClick={() => {
                  void handlePushAll()
                }}
                disabled={isActionDisabled}
                data-testid="settings-bulk-push-button"
              >
                <span className={`td-sync-control-btn-label ${isPushingAll ? 'is-running' : ''}`}>
                  {isPushingAll ? <span className="td-sync-control-running-dot" aria-hidden="true" /> : null}
                  <span>{isPushingAll ? 'pushing...' : 'push 全部'}</span>
                </span>
              </button>
            </div>
          </div>
        </div>

        <p className="td-settings-data-row-note">
          批量同步用于历史数据对齐；执行时间较长，过程中请勿关闭页面。
          {!canSyncToRemote ? ` 当前不可用：${syncAvailability.disabledMessage}` : ''}
        </p>

        {pushResult ? (
          <section
            className={`td-settings-data-row-result ${getPushResultToneClass(pushResult)}`}
            data-testid="settings-bulk-push-result"
            aria-live="polite"
          >
            <p className="td-export-result-title">
              {pushResult.total === 0
                ? '本地暂无可批量上传条目'
                : `成功 ${pushResult.success}/${pushResult.total}，跳过 ${pushResult.skipped}，冲突 ${pushResult.conflicted}，失败 ${pushResult.failed}`}
            </p>
            <p className="td-export-result-line">时间：{formatExecutedAt(pushResult.executedAt)}</p>

            {pushResult.conflictItems.length > 0 ? (
              <section className="td-import-list-block mt-2" data-testid="settings-bulk-push-conflict-list">
                <h4 className="td-import-list-title">冲突条目</h4>
                <ul className="td-import-list">
                  {pushResult.conflictItems.map((item) => (
                    <li key={`${item.entryId}:${item.reason}`}>
                      <code>{item.entryId}</code>
                      <span>：{item.reason}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {pushResult.failedItems.length > 0 ? (
              <section className="td-import-list-block mt-2" data-testid="settings-bulk-push-failed-list">
                <h4 className="td-import-list-title">失败条目</h4>
                <ul className="td-import-list">
                  {pushResult.failedItems.map((item) => (
                    <li key={`${item.entryId}:${item.reason}`}>
                      <code>{item.entryId}</code>
                      <span>：{item.reason}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </section>
        ) : null}
      </article>

      <PullResultDialog
        open={isPullResultOpen && Boolean(pullResult)}
        result={pullResult}
        onClose={() => setIsPullResultOpen(false)}
      />
    </>
  )
}
