import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import AuthModal from '../components/auth/auth-modal'
import ConflictDialog from '../components/common/conflict-dialog'
import StatusHint from '../components/common/status-hint'
import MarkdownEditor from '../components/editor/markdown-editor'
import type { UseAuthResult } from '../hooks/use-auth'
import { useDiary } from '../hooks/use-diary'
import { useSync } from '../hooks/use-sync'
import { getSyncBaseline, saveSyncBaseline } from '../services/indexeddb'
import { createDiaryUploadExecutor, pullDiaryFromGitee, type DiarySyncMetadata } from '../services/sync'
import { getSyncAvailability } from '../utils/sync-availability'
import { getDiarySyncEntryId, getDiarySyncFingerprint } from '../utils/sync-dirty'
import {
  MANUAL_PULL_BUSY_MESSAGE,
  MANUAL_PULL_PENDING_MESSAGE,
  MANUAL_SYNC_PENDING_MESSAGE,
  createIdleSyncActionSnapshot,
  getManualPullFailureMessage,
  getDisplayedManualSyncError,
  getManualSyncFailureMessage,
  getSessionLabel,
  getSyncActionLabel,
  getSyncActionToneClass,
  loadSyncActionSnapshot,
  saveSyncActionSnapshot,
  type SyncActionSnapshot,
} from '../utils/sync-presentation'

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

export default function YearlySummaryPage({ auth }: YearlySummaryPageProps) {
  const navigate = useNavigate()
  const params = useParams<{ year?: string }>()
  const [manualAuthModalOpen, setManualAuthModalOpen] = useState(false)
  const [manualSyncError, setManualSyncError] = useState<string | null>(null)
  const [manualPullError, setManualPullError] = useState<string | null>(null)
  const [isManualPulling, setIsManualPulling] = useState(false)
  const [pullActionSnapshot, setPullActionSnapshot] = useState<SyncActionSnapshot>(() =>
    createIdleSyncActionSnapshot(),
  )
  const [pushActionSnapshot, setPushActionSnapshot] = useState<SyncActionSnapshot>(() =>
    createIdleSyncActionSnapshot(),
  )
  const [pullConflictState, setPullConflictState] = useState<{
    local: DiarySyncMetadata
    remote: DiarySyncMetadata | null
    remoteSha?: string
  } | null>(null)

  const currentYear = useMemo(() => new Date().getFullYear(), [])
  const year = useMemo(() => normalizeYear(params.year, currentYear), [currentYear, params.year])
  const summary = useDiary({ type: 'yearly_summary', year })
  const syncPayload = useMemo<DiarySyncMetadata>(
    () => ({
      type: 'yearly_summary',
      entryId: summary.entryId,
      year,
      content: summary.content,
      modifiedAt: summary.entry?.modifiedAt ?? '',
    }),
    [summary.content, summary.entry?.modifiedAt, summary.entryId, year],
  )
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
  const syncDisabledMessage = syncAvailability.disabledMessage
  const uploadMetadata = canSyncToRemote
    ? createDiaryUploadExecutor({
        token: auth.state.tokenInMemory as string,
        owner: auth.state.config?.giteeOwner as string,
        repo: auth.state.config?.giteeRepoName as string,
        branch: giteeBranch,
        dataEncryptionKey: dataEncryptionKey as CryptoKey,
        syncMetadata: true,
      })
    : undefined
  const sync = useSync<DiarySyncMetadata>({
    uploadMetadata,
    getEntryId: getDiarySyncEntryId,
    getFingerprint: getDiarySyncFingerprint,
    getLocalModifiedAt: (metadata) => metadata.modifiedAt,
    loadBaseline: async (entryId) => getSyncBaseline(entryId),
    saveBaseline: async (baseline) => saveSyncBaseline(baseline),
  })
  const setActiveSyncMetadata = sync.setActiveMetadata
  const updateSyncActionSnapshot = (action: 'pull' | 'push', snapshot: SyncActionSnapshot) => {
    if (action === 'pull') {
      setPullActionSnapshot(snapshot)
    } else {
      setPushActionSnapshot(snapshot)
    }
    saveSyncActionSnapshot('yearly', summary.entryId, action, snapshot)
  }

  const forceOpenAuthModal = auth.state.stage !== 'ready'
  const authModalOpen = forceOpenAuthModal || manualAuthModalOpen

  useEffect(() => {
    if (!canSyncToRemote) {
      return
    }
    setActiveSyncMetadata(syncPayload)
  }, [canSyncToRemote, setActiveSyncMetadata, syncPayload])

  useEffect(() => {
    setPullActionSnapshot(loadSyncActionSnapshot('yearly', summary.entryId, 'pull'))
    setPushActionSnapshot(loadSyncActionSnapshot('yearly', summary.entryId, 'push'))
  }, [summary.entryId])

  const sessionLabel = useMemo(() => getSessionLabel(auth.state.stage), [auth.state.stage])
  const pullStatusLabel = useMemo(() => getSyncActionLabel('pull', pullActionSnapshot), [pullActionSnapshot])
  const pushStatusLabel = useMemo(() => getSyncActionLabel('push', pushActionSnapshot), [pushActionSnapshot])
  const pullStatusToneClass = useMemo(
    () => getSyncActionToneClass(pullActionSnapshot.status),
    [pullActionSnapshot.status],
  )
  const pushStatusToneClass = useMemo(
    () => getSyncActionToneClass(pushActionSnapshot.status),
    [pushActionSnapshot.status],
  )

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
    }
    if (manualSyncError) {
      setManualSyncError(null)
    }
    if (manualPullError) {
      setManualPullError(null)
    }
  }
  const saveNow = async () => {
    if (!canSyncToRemote) {
      setManualSyncError(syncDisabledMessage)
      updateSyncActionSnapshot('push', {
        status: 'error',
        at: new Date().toISOString(),
      })
      return
    }
    if (manualPullError) {
      setManualPullError(null)
    }

    const persistedEntry = await summary.waitForPersisted()
    const latestSummaryEntry =
      persistedEntry && persistedEntry.type === 'yearly_summary' ? persistedEntry : summary.entry
    const manualPayload: DiarySyncMetadata = {
      type: 'yearly_summary',
      entryId: summary.entryId,
      year,
      content: latestSummaryEntry?.content ?? summary.content,
      modifiedAt: latestSummaryEntry?.modifiedAt ?? new Date().toISOString(),
    }
    const pushStartedAt = new Date().toISOString()
    updateSyncActionSnapshot('push', {
      status: 'running',
      at: pushStartedAt,
    })
    setManualSyncError(MANUAL_SYNC_PENDING_MESSAGE)
    const result = await sync.saveNow(manualPayload)
    if (!result.ok) {
      if (result.code !== 'busy') {
        updateSyncActionSnapshot('push', {
          status: 'error',
          at: new Date().toISOString(),
        })
      }
      setManualSyncError(getManualSyncFailureMessage(result))
      return
    }
    updateSyncActionSnapshot('push', {
      status: 'success',
      at: new Date().toISOString(),
    })
    setManualSyncError(null)
  }

  const applyRemotePullPayload = async (remote: DiarySyncMetadata, remoteSha?: string) => {
    if (remote.type !== 'yearly_summary') {
      return
    }
    summary.setContent(remote.content)
    await sync.markSynced(
      {
        ...remote,
        entryId: summary.entryId,
        year,
      },
      {
        remoteSha,
      },
    )
    updateSyncActionSnapshot('pull', {
      status: 'success',
      at: new Date().toISOString(),
    })
    setManualSyncError(null)
  }

  const pullNow = async () => {
    if (isManualPulling) {
      setManualPullError(MANUAL_PULL_BUSY_MESSAGE)
      return
    }
    if (!canSyncToRemote) {
      setManualPullError(syncDisabledMessage)
      updateSyncActionSnapshot('pull', {
        status: 'error',
        at: new Date().toISOString(),
      })
      return
    }
    if (manualSyncError) {
      setManualSyncError(null)
    }

    const persistedEntry = await summary.waitForPersisted()
    const latestSummaryEntry =
      persistedEntry && persistedEntry.type === 'yearly_summary' ? persistedEntry : summary.entry
    const localPayload: DiarySyncMetadata = {
      type: 'yearly_summary',
      entryId: summary.entryId,
      year,
      content: latestSummaryEntry?.content ?? summary.content,
      modifiedAt: latestSummaryEntry?.modifiedAt ?? new Date().toISOString(),
    }

    setIsManualPulling(true)
    updateSyncActionSnapshot('pull', {
      status: 'running',
      at: new Date().toISOString(),
    })
    setManualPullError(MANUAL_PULL_PENDING_MESSAGE)
    try {
      const result = await pullDiaryFromGitee({
        token: auth.state.tokenInMemory as string,
        owner: auth.state.config?.giteeOwner as string,
        repo: auth.state.config?.giteeRepoName as string,
        branch: giteeBranch,
        dataEncryptionKey: dataEncryptionKey as CryptoKey,
        metadata: localPayload,
      })

      if (result.conflict) {
        setPullConflictState({
          local: result.conflictPayload?.local ?? localPayload,
          remote: result.conflictPayload?.remote ?? null,
          remoteSha: result.remoteSha,
        })
        updateSyncActionSnapshot('pull', {
          status: 'error',
          at: new Date().toISOString(),
        })
        setManualPullError('检测到拉取冲突，请选择保留本地、远端或合并版本')
        return
      }

      if (!result.ok || !result.pulledMetadata) {
        updateSyncActionSnapshot('pull', {
          status: 'error',
          at: new Date().toISOString(),
        })
        setManualPullError(getManualPullFailureMessage(result.reason))
        return
      }

      await applyRemotePullPayload(result.pulledMetadata, result.remoteSha)
      setManualPullError(null)
    } catch (error) {
      updateSyncActionSnapshot('pull', {
        status: 'error',
        at: new Date().toISOString(),
      })
      setManualPullError(error instanceof Error ? error.message : '拉取失败，请稍后重试')
    } finally {
      setIsManualPulling(false)
    }
  }

  const resolvePushConflict = (choice: 'local' | 'remote' | 'merged', mergedPayload?: DiarySyncMetadata) => {
    updateSyncActionSnapshot('push', {
      status: 'running',
      at: new Date().toISOString(),
    })
    setManualSyncError(MANUAL_SYNC_PENDING_MESSAGE)
    void sync
      .resolveConflict(choice, mergedPayload)
      .then((result) => {
        if (!result.ok) {
          if (result.code !== 'busy') {
            updateSyncActionSnapshot('push', {
              status: 'error',
              at: new Date().toISOString(),
            })
          }
          setManualSyncError(result.errorMessage)
          return
        }
        updateSyncActionSnapshot('push', {
          status: 'success',
          at: new Date().toISOString(),
        })
        setManualSyncError(null)
      })
      .catch((error) => {
        updateSyncActionSnapshot('push', {
          status: 'error',
          at: new Date().toISOString(),
        })
        setManualSyncError(error instanceof Error ? error.message : '冲突处理失败，请稍后重试')
      })
  }

  const resolveMergeConflict = (mergedContent: string) => {
    if (pullConflictState) {
      const local = pullConflictState.local
      if (local.type !== 'yearly_summary') {
        return
      }

      const mergedPayload: DiarySyncMetadata = {
        ...local,
        content: mergedContent,
        modifiedAt: new Date().toISOString(),
      }
      summary.setContent(mergedContent)
      sync.onInputChange(mergedPayload)
      setPullConflictState(null)
      setManualPullError('已应用合并内容，请确认后手动上传')
      return
    }

    const local = sync.conflictState?.local
    if (!local || local.type !== 'yearly_summary') {
      return
    }

    const mergedPayload: DiarySyncMetadata = {
      ...local,
      content: mergedContent,
      modifiedAt: new Date().toISOString(),
    }
    resolvePushConflict('merged', mergedPayload)
  }
  const displayedSyncMessage = sync.errorMessage
  const displayedManualSyncError = getDisplayedManualSyncError(manualSyncError, sync.status)
  const isManualSyncing = sync.status === 'syncing'
  const activeConflictState = pullConflictState ?? sync.conflictState
  const activeConflictMode = pullConflictState ? 'pull' : 'push'
  const handleKeepLocalConflict = () => {
    if (pullConflictState) {
      setPullConflictState(null)
      setManualPullError(null)
      return
    }
    resolvePushConflict('local')
  }
  const handleKeepRemoteConflict = () => {
    if (pullConflictState) {
      const remote = pullConflictState.remote
      const remoteSha = pullConflictState.remoteSha
      setPullConflictState(null)
      if (remote && remote.type === 'yearly_summary') {
        void applyRemotePullPayload(remote, remoteSha)
        setManualPullError(null)
        return
      }
      setManualPullError('远端版本不可用，请稍后重试拉取')
      return
    }
    resolvePushConflict('remote')
  }
  const handleCloseConflict = () => {
    if (pullConflictState) {
      setPullConflictState(null)
      return
    }
    sync.dismissConflict()
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
                <span className={`td-status-pill ${pullStatusToneClass}`} data-testid="pull-status-pill">
                  {pullStatusLabel}
                </span>
                <span className={`td-status-pill ${pushStatusToneClass}`} data-testid="push-status-pill">
                  {pushStatusLabel}
                </span>
                <div className="ml-auto flex max-w-full items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      void pullNow()
                    }}
                    className="td-btn"
                    data-testid="manual-pull-button"
                  >
                    {isManualPulling ? 'pulling...' : 'pull'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void saveNow()
                    }}
                    className="td-btn"
                  >
                    {isManualSyncing ? 'pushing...' : 'push'}
                  </button>
                  {manualPullError ? (
                    <span
                      role="alert"
                      data-testid="manual-pull-error"
                      className="max-w-[340px] rounded-[10px] border border-red-200 bg-red-50 px-2.5 py-1 text-xs text-red-700"
                    >
                      {manualPullError}
                    </span>
                  ) : null}
                  {displayedManualSyncError ? (
                    <span
                      role="alert"
                      className="max-w-[340px] rounded-[10px] border border-red-200 bg-red-50 px-2.5 py-1 text-xs text-red-700"
                    >
                      {displayedManualSyncError}
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
                key={`${summary.entryId}:${summary.loadRevision}`}
                docKey={`${summary.entryId}:${summary.isLoading ? 'loading' : 'ready'}:${summary.loadRevision}`}
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
        open={Boolean(activeConflictState && activeConflictState.local.type === 'yearly_summary')}
        mode={activeConflictMode}
        local={{
          content:
            activeConflictState && activeConflictState.local.type === 'yearly_summary'
              ? activeConflictState.local.content
              : '',
          modifiedAt:
            activeConflictState && activeConflictState.local.type === 'yearly_summary'
              ? activeConflictState.local.modifiedAt
              : undefined,
        }}
        remote={
          activeConflictState?.remote && activeConflictState.remote.type === 'yearly_summary'
            ? {
                content: activeConflictState.remote.content,
                modifiedAt: activeConflictState.remote.modifiedAt,
              }
            : null
        }
        onKeepLocal={handleKeepLocalConflict}
        onKeepRemote={handleKeepRemoteConflict}
        onMerge={resolveMergeConflict}
        onClose={handleCloseConflict}
      />
    </>
  )
}
