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
import { createDiaryUploadExecutor, type DiarySyncMetadata } from '../services/sync'
import { getSyncAvailability } from '../utils/sync-availability'
import { getDiarySyncEntryId, getDiarySyncFingerprint } from '../utils/sync-dirty'
import {
  MANUAL_SYNC_PENDING_MESSAGE,
  getDisplayedManualSyncError,
  getManualSyncFailureMessage,
  getSessionLabel,
  getSyncLabel,
  getSyncToneClass,
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
    loadBaseline: async (entryId) => getSyncBaseline(entryId),
    saveBaseline: async (baseline) => saveSyncBaseline(baseline),
  })
  const setActiveSyncMetadata = sync.setActiveMetadata

  const forceOpenAuthModal = auth.state.stage !== 'ready'
  const authModalOpen = forceOpenAuthModal || manualAuthModalOpen

  useEffect(() => {
    if (!canSyncToRemote) {
      return
    }
    setActiveSyncMetadata(syncPayload)
  }, [canSyncToRemote, setActiveSyncMetadata, syncPayload])

  const sessionLabel = useMemo(() => getSessionLabel(auth.state.stage), [auth.state.stage])
  const syncPresentationState = useMemo(
    () => ({
      canSyncToRemote,
      hasConflict: Boolean(sync.conflictState),
      isOffline: sync.isOffline,
      hasPendingRetry: sync.hasPendingRetry,
      status: sync.status,
      hasUnsyncedChanges: sync.hasUnsyncedChanges,
      lastSyncedAt: sync.lastSyncedAt,
    }),
    [
      canSyncToRemote,
      sync.conflictState,
      sync.hasPendingRetry,
      sync.hasUnsyncedChanges,
      sync.isOffline,
      sync.lastSyncedAt,
      sync.status,
    ],
  )
  const syncLabel = useMemo(() => getSyncLabel(syncPresentationState), [syncPresentationState])
  const syncToneClass = useMemo(() => getSyncToneClass(syncPresentationState), [syncPresentationState])

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
  }
  const displayedSyncMessage = sync.errorMessage
  const displayedManualSyncError = getDisplayedManualSyncError(manualSyncError, sync.status)
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
                <div className="ml-auto flex max-w-full items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (!canSyncToRemote) {
                        setManualSyncError(syncDisabledMessage)
                        return
                      }
                      void (async () => {
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
                        setManualSyncError(MANUAL_SYNC_PENDING_MESSAGE)
                        const result = await sync.saveNow(manualPayload)
                        if (!result.ok) {
                          setManualSyncError(getManualSyncFailureMessage(result))
                          return
                        }
                        setManualSyncError(null)
                      })()
                    }}
                    className="td-btn"
                  >
                    {isManualSyncing ? '上传中...' : '手动保存并立即上传'}
                  </button>
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
