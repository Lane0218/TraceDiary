import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import AuthModal from '../components/auth/auth-modal'
import AppHeader from '../components/common/app-header'
import ConflictDialog from '../components/common/conflict-dialog'
import SyncControlBar from '../components/common/sync-control-bar'
import StatusHint from '../components/common/status-hint'
import MarkdownEditor from '../components/editor/markdown-editor'
import type { UseAuthResult } from '../hooks/use-auth'
import { useDiary } from '../hooks/use-diary'
import { useSync } from '../hooks/use-sync'
import { useToast } from '../hooks/use-toast'
import { getDiary, getSyncBaseline, saveSyncBaseline } from '../services/indexeddb'
import { createDiaryUploadExecutor, pullDiaryFromGitee, type DiarySyncMetadata } from '../services/sync'
import { getSyncAvailability } from '../utils/sync-availability'
import { getDiarySyncEntryId, getDiarySyncFingerprint } from '../utils/sync-dirty'
import {
  MANUAL_PULL_BUSY_MESSAGE,
  MANUAL_PULL_PENDING_MESSAGE,
  MANUAL_SYNC_PENDING_MESSAGE,
  createIdleSyncActionSnapshot,
  getManualPullFailureMessage,
  getManualSyncFailureMessage,
  getSyncActionLabel,
  getSyncActionToneClass,
  loadSyncActionSnapshot,
  saveSyncActionSnapshot,
  type SyncActionSnapshot,
} from '../utils/sync-presentation'

interface YearlySummaryPageProps {
  auth: UseAuthResult
}

const EMPTY_PUSH_BLOCKED_MESSAGE = '当前内容为空，无需 push'
const MIN_YEAR = 1970
const MAX_YEAR = 9999
const YEARLY_EDITOR_BODY_HEIGHT_DESKTOP = 620

function normalizeYear(yearParam: string | undefined, fallbackYear: number): number {
  const parsed = Number.parseInt(yearParam ?? '', 10)
  if (Number.isFinite(parsed) && parsed >= MIN_YEAR && parsed <= MAX_YEAR) {
    return parsed
  }
  return fallbackYear
}

function parseValidYearInput(value: string): number | null {
  if (value.length === 0) {
    return null
  }
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < MIN_YEAR || parsed > MAX_YEAR) {
    return null
  }
  return parsed
}

export default function YearlySummaryPage({ auth }: YearlySummaryPageProps) {
  const navigate = useNavigate()
  const { push: pushToast } = useToast()
  const params = useParams<{ year?: string }>()
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
  const [yearInput, setYearInput] = useState(String(year))
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
  const lastSyncNotifyMessageRef = useRef<string | null>(null)

  const forceOpenAuthModal = auth.state.stage !== 'ready'
  const authModalOpen = forceOpenAuthModal

  useEffect(() => {
    if (!canSyncToRemote) {
      return
    }
    setActiveSyncMetadata(syncPayload)
  }, [canSyncToRemote, setActiveSyncMetadata, syncPayload])

  useEffect(() => {
    setYearInput(String(year))
  }, [year])

  useEffect(() => {
    setPullActionSnapshot(loadSyncActionSnapshot('yearly', summary.entryId, 'pull'))
    setPushActionSnapshot(loadSyncActionSnapshot('yearly', summary.entryId, 'push'))
  }, [summary.entryId])

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
    if (!Number.isFinite(nextYear) || nextYear < MIN_YEAR || nextYear > MAX_YEAR || nextYear === year) {
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
      pushToast({
        kind: 'push',
        level: 'warning',
        message: syncDisabledMessage,
      })
      return
    }
    if (manualPullError) {
      setManualPullError(null)
    }

    const persistedEntry = await summary.waitForPersisted()
    const latestSummaryEntry =
      persistedEntry && persistedEntry.type === 'yearly_summary' ? persistedEntry : summary.entry
    const persistedContent = latestSummaryEntry?.content ?? ''
    const liveContent = summary.content
    let contentForSync = persistedContent.trim() ? persistedContent : liveContent

    if (!contentForSync.trim()) {
      const storedEntry = await getDiary(summary.entryId).catch(() => null)
      const storedContent = typeof storedEntry?.content === 'string' ? storedEntry.content : ''
      if (storedContent.trim()) {
        contentForSync = storedContent
      }
    }
    const manualPayload: DiarySyncMetadata = {
      type: 'yearly_summary',
      entryId: summary.entryId,
      year,
      content: contentForSync,
      modifiedAt: latestSummaryEntry?.modifiedAt ?? new Date().toISOString(),
    }
    if (!manualPayload.content.trim()) {
      setManualSyncError(null)
      pushToast({
        kind: 'push',
        level: 'warning',
        message: EMPTY_PUSH_BLOCKED_MESSAGE,
      })
      return
    }
    const pushStartedAt = new Date().toISOString()
    updateSyncActionSnapshot('push', {
      status: 'running',
      at: pushStartedAt,
    })
    setManualSyncError(MANUAL_SYNC_PENDING_MESSAGE)
    pushToast({
      kind: 'push',
      level: 'info',
      message: MANUAL_SYNC_PENDING_MESSAGE,
      autoDismiss: false,
    })
    const result = await sync.saveNow(manualPayload)
    if (!result.ok) {
      if (result.code !== 'busy') {
        updateSyncActionSnapshot('push', {
          status: 'error',
          at: new Date().toISOString(),
        })
      }
      const errorMessage = getManualSyncFailureMessage(result)
      setManualSyncError(errorMessage)
      pushToast({
        kind: 'push',
        level: result.code === 'busy' || result.code === 'offline' ? 'warning' : 'error',
        message: errorMessage,
      })
      return
    }
    updateSyncActionSnapshot('push', {
      status: 'success',
      at: new Date().toISOString(),
    })
    setManualSyncError(null)
    pushToast({
      kind: 'push',
      level: 'success',
      message: 'push 已完成，同步成功',
    })
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
    pushToast({
      kind: 'pull',
      level: 'success',
      message: 'pull 已完成，已更新本地内容',
    })
  }

  const pullNow = async () => {
    if (isManualPulling) {
      setManualPullError(MANUAL_PULL_BUSY_MESSAGE)
      pushToast({
        kind: 'pull',
        level: 'warning',
        message: MANUAL_PULL_BUSY_MESSAGE,
      })
      return
    }
    if (!canSyncToRemote) {
      setManualPullError(syncDisabledMessage)
      updateSyncActionSnapshot('pull', {
        status: 'error',
        at: new Date().toISOString(),
      })
      pushToast({
        kind: 'pull',
        level: 'warning',
        message: syncDisabledMessage,
      })
      return
    }
    if (manualSyncError) {
      setManualSyncError(null)
    }

    const persistedEntry = await summary.waitForPersisted()
    const latestSummaryEntry =
      persistedEntry && persistedEntry.type === 'yearly_summary' ? persistedEntry : summary.entry
    const persistedContent = latestSummaryEntry?.content ?? ''
    const liveContent = summary.content
    const contentForSync = persistedContent.trim() ? persistedContent : liveContent
    const localPayload: DiarySyncMetadata = {
      type: 'yearly_summary',
      entryId: summary.entryId,
      year,
      content: contentForSync,
      modifiedAt: latestSummaryEntry?.modifiedAt ?? new Date().toISOString(),
    }

    setIsManualPulling(true)
    updateSyncActionSnapshot('pull', {
      status: 'running',
      at: new Date().toISOString(),
    })
    setManualPullError(MANUAL_PULL_PENDING_MESSAGE)
    pushToast({
      kind: 'pull',
      level: 'info',
      message: MANUAL_PULL_PENDING_MESSAGE,
      autoDismiss: false,
    })
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
        const message = '检测到拉取冲突，请选择保留本地、远端或合并版本'
        setManualPullError(message)
        pushToast({
          kind: 'pull',
          level: 'warning',
          message,
        })
        return
      }

      if (!result.ok || !result.pulledMetadata) {
        updateSyncActionSnapshot('pull', {
          status: 'error',
          at: new Date().toISOString(),
        })
        const message = getManualPullFailureMessage(result.reason)
        setManualPullError(message)
        pushToast({
          kind: 'pull',
          level: 'error',
          message,
        })
        return
      }

      await applyRemotePullPayload(result.pulledMetadata, result.remoteSha)
      setManualPullError(null)
    } catch (error) {
      updateSyncActionSnapshot('pull', {
        status: 'error',
        at: new Date().toISOString(),
      })
      const message = error instanceof Error ? error.message : '拉取失败，请稍后重试'
      setManualPullError(message)
      pushToast({
        kind: 'pull',
        level: 'error',
        message,
      })
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
    pushToast({
      kind: 'push',
      level: 'info',
      message: MANUAL_SYNC_PENDING_MESSAGE,
      autoDismiss: false,
    })
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
          pushToast({
            kind: 'push',
            level: result.code === 'busy' || result.code === 'offline' ? 'warning' : 'error',
            message: result.errorMessage,
          })
          return
        }
        updateSyncActionSnapshot('push', {
          status: 'success',
          at: new Date().toISOString(),
        })
        setManualSyncError(null)
        pushToast({
          kind: 'push',
          level: 'success',
          message: '冲突已处理，push 成功',
        })
      })
      .catch((error) => {
        updateSyncActionSnapshot('push', {
          status: 'error',
          at: new Date().toISOString(),
        })
        const message = error instanceof Error ? error.message : '冲突处理失败，请稍后重试'
        setManualSyncError(message)
        pushToast({
          kind: 'push',
          level: 'error',
          message,
        })
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
      pushToast({
        kind: 'pull',
        level: 'info',
        message: '已应用合并内容，请确认后手动上传',
      })
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
  const isManualSyncing = sync.status === 'syncing'
  const activeConflictState = pullConflictState ?? sync.conflictState
  const activeConflictMode = pullConflictState ? 'pull' : 'push'

  useEffect(() => {
    if (!sync.errorMessage) {
      lastSyncNotifyMessageRef.current = null
      return
    }
    if (lastSyncNotifyMessageRef.current === sync.errorMessage) {
      return
    }
    lastSyncNotifyMessageRef.current = sync.errorMessage
    pushToast({
      kind: 'system',
      level: 'error',
      message: sync.errorMessage,
    })
  }, [pushToast, sync.errorMessage])

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
      pushToast({
        kind: 'pull',
        level: 'warning',
        message: '远端版本不可用，请稍后重试拉取',
      })
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
        <AppHeader currentPage="yearly" yearlyHref={`/yearly/${year}`} />

        <section
          className="mt-4 space-y-3 td-fade-in lg:flex lg:min-h-[calc(100vh-150px)] lg:flex-col"
          aria-label="yearly-summary-page"
        >
          <SyncControlBar
            statusHint={<StatusHint isLoading={summary.isLoading} isSaving={summary.isSaving} error={summary.error} />}
            pullStatusLabel={pullStatusLabel}
            pushStatusLabel={pushStatusLabel}
            pullStatusToneClass={pullStatusToneClass}
            pushStatusToneClass={pushStatusToneClass}
            isPulling={isManualPulling}
            isPushing={isManualSyncing}
            onPull={() => {
              void pullNow()
            }}
            onPush={() => {
              void saveNow()
            }}
          />

          <article className="td-card-primary td-panel flex flex-col lg:min-h-0 lg:flex-1" data-testid="yearly-panel">
            <header className="mb-3 flex flex-wrap items-center gap-2">
              <h2 className="font-display text-2xl text-td-text sm:text-3xl">{year} 年度总结</h2>
              <div className="inline-flex h-10 items-center overflow-hidden rounded-[8px] border border-[#d6d6d6] bg-white">
                <button
                  type="button"
                  aria-label="年份减一"
                  disabled={year <= MIN_YEAR}
                  className="h-full w-8 text-sm text-td-muted transition hover:bg-[#f5f5f5] hover:text-td-text disabled:cursor-not-allowed disabled:text-[#c5c5c5] disabled:hover:bg-white"
                  onClick={() => handleYearChange(year - 1)}
                >
                  &#8249;
                </button>
                <input
                  id="summary-year"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  aria-label="跳转年份"
                  value={yearInput}
                  onChange={(event) => {
                    const sanitized = event.target.value.replace(/\D+/g, '').slice(0, 4)
                    setYearInput(sanitized)
                    const parsed = parseValidYearInput(sanitized)
                    if (parsed !== null) {
                      handleYearChange(parsed)
                    }
                  }}
                  onBlur={() => {
                    const parsed = parseValidYearInput(yearInput)
                    if (parsed === null) {
                      setYearInput(String(year))
                      return
                    }
                    setYearInput(String(parsed))
                  }}
                  className="h-full w-[92px] border-x border-[#e1e1e1] bg-white px-1.5 text-center text-[18px] font-semibold text-td-text outline-none"
                />
                <button
                  type="button"
                  aria-label="年份加一"
                  disabled={year >= MAX_YEAR}
                  className="h-full w-8 text-sm text-td-muted transition hover:bg-[#f5f5f5] hover:text-td-text disabled:cursor-not-allowed disabled:text-[#c5c5c5] disabled:hover:bg-white"
                  onClick={() => handleYearChange(year + 1)}
                >
                  &#8250;
                </button>
              </div>
            </header>

            <div className="min-h-0 flex-1" data-testid="yearly-editor-slot">
              {!summary.isLoading ? (
                <MarkdownEditor
                  key={`${summary.entryId}:${summary.loadRevision}`}
                  docKey={`${summary.entryId}:${summary.isLoading ? 'loading' : 'ready'}:${summary.loadRevision}`}
                  initialValue={summary.content}
                  onChange={handleEditorChange}
                  placeholder="写下本年度总结（长文写作场景，支持 Markdown）"
                  modeToggleClassName="mb-5"
                  viewportHeight={YEARLY_EDITOR_BODY_HEIGHT_DESKTOP}
                  fillHeight
                />
              ) : null}
            </div>
          </article>
        </section>
      </main>

      <AuthModal
        auth={auth}
        open={authModalOpen}
        canClose={!forceOpenAuthModal}
        onClose={() => undefined}
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
