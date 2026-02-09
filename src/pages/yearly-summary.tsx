import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import AuthModal from '../components/auth/auth-modal'
import ConflictDialog from '../components/common/conflict-dialog'
import MarkdownEditor from '../components/editor/markdown-editor'
import type { UseAuthResult } from '../hooks/use-auth'
import { useDiary } from '../hooks/use-diary'
import { useSync } from '../hooks/use-sync'
import { createDiaryUploadExecutor, type DiarySyncMetadata } from '../services/sync'

const BUSY_SYNC_MESSAGE = '当前正在上传，请稍候重试'
const MANUAL_SYNC_PENDING_MESSAGE = '手动上传已触发，正在等待结果...'

interface YearlySummaryPageProps {
  auth: UseAuthResult
}

function normalizeYear(yearParam: string | undefined, fallbackYear: number): number {
  const parsed = Number.parseInt(yearParam ?? '', 10)
  if (Number.isFinite(parsed) && parsed >= 1970 && parsed <= 9999) {
    return parsed
  }
  return fallbackYear
}

function StatusHint({
  isLoading,
  isSaving,
  error,
}: {
  isLoading: boolean
  isSaving: boolean
  error: string | null
}) {
  if (isLoading) {
    return <span className="td-status-pill td-status-muted">加载中</span>
  }

  if (error) {
    return <span className="td-status-pill td-status-danger">本地保存异常</span>
  }

  if (isSaving) {
    return <span className="td-status-pill td-status-warning">保存中</span>
  }

  return <span className="td-status-pill td-status-success">本地已保存</span>
}

export default function YearlySummaryPage({ auth }: YearlySummaryPageProps) {
  const navigate = useNavigate()
  const params = useParams<{ year?: string }>()
  const [manualAuthModalOpen, setManualAuthModalOpen] = useState(false)
  const [manualSyncError, setManualSyncError] = useState<string | null>(null)

  const currentYear = useMemo(() => new Date().getFullYear(), [])
  const year = useMemo(() => normalizeYear(params.year, currentYear), [currentYear, params.year])
  const summary = useDiary({ type: 'yearly_summary', year })
  const syncPayload = useMemo<DiarySyncMetadata>(
    () => ({
      type: 'yearly_summary',
      entryId: summary.entryId,
      year,
      content: summary.content,
      modifiedAt: summary.entry?.modifiedAt ?? new Date().toISOString(),
    }),
    [summary.content, summary.entry?.modifiedAt, summary.entryId, year],
  )
  const giteeBranch = auth.state.config?.giteeBranch?.trim() || 'master'

  const canSyncToRemote =
    auth.state.stage === 'ready' &&
    Boolean(auth.state.tokenInMemory) &&
    Boolean(auth.state.config?.giteeOwner) &&
    Boolean(auth.state.config?.giteeRepoName)
  const uploadMetadata = canSyncToRemote
    ? createDiaryUploadExecutor({
        token: auth.state.tokenInMemory as string,
        owner: auth.state.config?.giteeOwner as string,
        repo: auth.state.config?.giteeRepoName as string,
        branch: giteeBranch,
      })
    : undefined
  const sync = useSync<DiarySyncMetadata>({ uploadMetadata })
  const syncDisabledMessage = useMemo(() => {
    if (auth.state.stage !== 'ready') {
      return '云端同步未就绪：请先完成解锁。'
    }
    if (!auth.state.config?.giteeOwner || !auth.state.config?.giteeRepoName) {
      return '云端同步未就绪：请先配置 Gitee 仓库。'
    }
    if (!auth.state.tokenInMemory) {
      return '云端同步未就绪：当前会话缺少可用 Token，请重新解锁/配置。'
    }
    return '云端同步未就绪。'
  }, [auth.state.config?.giteeOwner, auth.state.config?.giteeRepoName, auth.state.stage, auth.state.tokenInMemory])

  const forceOpenAuthModal = auth.state.stage !== 'ready'
  const authModalOpen = forceOpenAuthModal || manualAuthModalOpen

  const sessionLabel = useMemo(() => {
    if (auth.state.stage === 'ready') {
      return '会话：已解锁'
    }
    if (auth.state.stage === 'checking') {
      return '会话：认证处理中'
    }
    return '会话：待认证'
  }, [auth.state.stage])

  const syncLabel = useMemo(() => {
    if (!canSyncToRemote) {
      return '云端未就绪'
    }
    if (sync.conflictState) {
      return '检测到冲突'
    }
    if (sync.isOffline || sync.hasPendingRetry) {
      return '离线待重试'
    }
    if (sync.status === 'syncing') {
      return '云端同步中'
    }
    if (sync.status === 'success') {
      return '云端已同步'
    }
    if (sync.status === 'error') {
      return '云端同步失败'
    }
    return '云端待同步'
  }, [canSyncToRemote, sync.conflictState, sync.hasPendingRetry, sync.isOffline, sync.status])

  const syncToneClass = useMemo(() => {
    if (!canSyncToRemote) {
      return 'td-status-warning'
    }
    if (sync.conflictState) {
      return 'td-status-danger'
    }
    if (sync.isOffline || sync.hasPendingRetry) {
      return 'td-status-warning'
    }
    if (sync.status === 'syncing') {
      return 'td-status-warning'
    }
    if (sync.status === 'success') {
      return 'td-status-success'
    }
    if (sync.status === 'error') {
      return 'td-status-danger'
    }
    return 'td-status-muted'
  }, [canSyncToRemote, sync.conflictState, sync.hasPendingRetry, sync.isOffline, sync.status])

  const handleYearChange = (nextYear: number) => {
    if (!Number.isFinite(nextYear) || nextYear < 1970 || nextYear > 9999) {
      return
    }
    navigate(`/yearly/${nextYear}`)
  }

  const handleEditorChange = (nextContent: string) => {
    summary.setContent(nextContent)
    if (canSyncToRemote) {
      sync.onInputChange({
        ...syncPayload,
        content: nextContent,
        modifiedAt: new Date().toISOString(),
      })
      if (manualSyncError) {
        setManualSyncError(null)
      }
    }
  }
  const displayedSyncMessage = sync.errorMessage
  const isManualSyncing = sync.status === 'syncing'

  const resolveMergeConflict = (mergedContent: string) => {
    const local = sync.conflictState?.local
    if (!local || local.type !== 'yearly_summary') {
      return
    }

    const mergedPayload: DiarySyncMetadata = {
      ...local,
      content: mergedContent,
      modifiedAt: new Date().toISOString(),
    }
    void sync.resolveConflict('merged', mergedPayload)
  }

  return (
    <>
      <main className="mx-auto min-h-screen w-full max-w-7xl px-4 pb-8 sm:px-6">
        <header className="sticky top-0 z-10 flex min-h-[68px] flex-wrap items-center justify-between gap-3 border-b border-td-line bg-td-bg/95 py-3 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl text-td-text">TraceDiary</h1>
            <span className="rounded-full border border-td-line bg-td-surface px-3 py-1 text-xs text-td-muted">{sessionLabel}</span>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="td-btn" onClick={() => navigate('/workspace')}>
              返回日记工作台
            </button>
            <button
              type="button"
              className="td-btn"
              onClick={() => {
                setManualAuthModalOpen(true)
              }}
            >
              解锁/配置
            </button>
            {auth.state.stage === 'ready' ? (
              <button
                type="button"
                className="td-btn"
                onClick={() => {
                  auth.lockNow()
                }}
              >
                锁定
              </button>
            ) : null}
          </div>
        </header>

        <section className="mt-4 space-y-3 td-fade-in" aria-label="yearly-summary-page">
          <article className="td-card-primary td-panel space-y-4">
            <header className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-2xl text-td-text sm:text-3xl">{year} 年度总结</h2>
                <button
                  type="button"
                  className="td-btn"
                  onClick={() => handleYearChange(year - 1)}
                  aria-label="上一年"
                >
                  上一年
                </button>
                <button
                  type="button"
                  className="td-btn"
                  onClick={() => handleYearChange(year + 1)}
                  aria-label="下一年"
                >
                  下一年
                </button>
                <label htmlFor="summary-year" className="text-xs text-td-muted">
                  跳转年份
                </label>
                <input
                  id="summary-year"
                  type="number"
                  min={1970}
                  max={9999}
                  value={year}
                  onChange={(event) => {
                    const parsed = Number.parseInt(event.target.value, 10)
                    if (Number.isFinite(parsed) && parsed >= 1970 && parsed <= 9999) {
                      handleYearChange(parsed)
                    }
                  }}
                  className="td-input w-28"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <StatusHint isLoading={summary.isLoading} isSaving={summary.isSaving} error={summary.error} />
                <span className={`td-status-pill ${syncToneClass}`}>{syncLabel}</span>
                {sync.lastSyncedAt ? (
                  <span className="rounded-full border border-td-line bg-td-surface px-2.5 py-1 text-xs text-td-muted">
                    最近同步：{sync.lastSyncedAt}
                  </span>
                ) : null}
                <span className="rounded-full border border-td-line bg-td-surface px-2.5 py-1 text-xs text-td-muted">
                  分支：{giteeBranch}
                </span>
                <div className="ml-auto flex max-w-full items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (!canSyncToRemote) {
                        setManualSyncError(syncDisabledMessage)
                        return
                      }
                      void (async () => {
                        setManualSyncError(MANUAL_SYNC_PENDING_MESSAGE)
                        const result = await sync.saveNow(syncPayload)
                        if (!result.ok) {
                          const message =
                            result.code === 'stale' ? BUSY_SYNC_MESSAGE : result.errorMessage || '上传未完成，请重试'
                          setManualSyncError(message)
                          return
                        }
                        setManualSyncError(null)
                      })()
                    }}
                    className="td-btn"
                  >
                    {isManualSyncing ? '上传中...' : '手动保存并立即上传'}
                  </button>
                  {manualSyncError ? (
                    <span
                      role="alert"
                      className="max-w-[340px] rounded-[10px] border border-red-200 bg-red-50 px-2.5 py-1 text-xs text-red-700"
                    >
                      {manualSyncError}
                    </span>
                  ) : null}
                </div>
              </div>

              {displayedSyncMessage ? (
                <p className="text-sm text-td-danger" role="alert">
                  {displayedSyncMessage}
                </p>
              ) : null}
            </header>

            {!summary.isLoading ? (
              <MarkdownEditor
                key={summary.entryId}
                docKey={`${summary.entryId}:${summary.isLoading ? 'loading' : 'ready'}`}
                initialValue={summary.content}
                onChange={handleEditorChange}
                placeholder="写下本年度总结（长文写作场景，支持 Markdown）"
              />
            ) : null}
          </article>
        </section>
      </main>

      <AuthModal
        auth={auth}
        open={authModalOpen}
        canClose={!forceOpenAuthModal}
        onClose={() => {
          setManualAuthModalOpen(false)
        }}
      />

      <ConflictDialog
        open={Boolean(sync.conflictState && sync.conflictState.local.type === 'yearly_summary')}
        local={{
          content:
            sync.conflictState && sync.conflictState.local.type === 'yearly_summary'
              ? sync.conflictState.local.content
              : '',
          modifiedAt:
            sync.conflictState && sync.conflictState.local.type === 'yearly_summary'
              ? sync.conflictState.local.modifiedAt
              : undefined,
        }}
        remote={
          sync.conflictState?.remote && sync.conflictState.remote.type === 'yearly_summary'
            ? {
                content: sync.conflictState.remote.content,
                modifiedAt: sync.conflictState.remote.modifiedAt,
              }
            : null
        }
        onKeepLocal={() => {
          void sync.resolveConflict('local')
        }}
        onKeepRemote={() => {
          void sync.resolveConflict('remote')
        }}
        onMerge={resolveMergeConflict}
        onClose={sync.dismissConflict}
      />
    </>
  )
}
