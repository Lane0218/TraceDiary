import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import AuthModal from '../components/auth/auth-modal'
import MonthCalendar from '../components/calendar/month-calendar'
import ConflictDialog from '../components/common/conflict-dialog'
import StatusHint from '../components/common/status-hint'
import MarkdownEditor from '../components/editor/markdown-editor'
import OnThisDayList from '../components/history/on-this-day-list'
import type { UseAuthResult } from '../hooks/use-auth'
import { useDiary } from '../hooks/use-diary'
import { useSync } from '../hooks/use-sync'
import {
  DIARY_INDEX_TYPE,
  getSyncBaseline,
  listDiariesByIndex,
  saveSyncBaseline,
  type DiaryRecord,
} from '../services/indexeddb'
import { createDiaryUploadExecutor, type DiarySyncMetadata } from '../services/sync'
import type { DateString } from '../types/diary'
import { formatDateKey } from '../utils/date'
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
import { REMOTE_PULL_COMPLETED_EVENT } from '../utils/remote-sync-events'

interface WorkspacePageProps {
  auth: UseAuthResult
}

interface YearlyReminder {
  show: boolean
  targetYear: number
  message: string
}

function isValidDateString(value: string | null): value is DateString {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value))
}

function toMonthStartFromDateKey(dateKey: DateString): Date {
  const date = new Date(`${dateKey}T00:00:00`)
  if (Number.isNaN(date.getTime())) {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  }
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function buildDateFromYearMonthDay(year: number, monthIndex: number, day: number): DateString {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate()
  const normalizedDay = Math.min(Math.max(day, 1), lastDay)
  return formatDateKey(new Date(year, monthIndex, normalizedDay)) as DateString
}

function shiftMonth(month: Date, offset: number): Date {
  return new Date(month.getFullYear(), month.getMonth() + offset, 1)
}

function countWords(content: string): number {
  return content.trim().length === 0 ? 0 : content.trim().split(/\s+/u).length
}

function isDailySyncMetadata(value: DiarySyncMetadata): value is Extract<DiarySyncMetadata, { type: 'daily' }> {
  return value.type === 'daily'
}

function upsertDailyRecord(records: DiaryRecord[], date: DateString, content: string): DiaryRecord[] {
  const id = `daily:${date}`
  const now = new Date().toISOString()
  const nextRecord: DiaryRecord = {
    id,
    type: 'daily',
    date,
    content,
    wordCount: countWords(content),
    createdAt: now,
    modifiedAt: now,
  }

  const index = records.findIndex((record) => record.id === id)
  if (index === -1) {
    return [nextRecord, ...records]
  }

  const prev = records[index]
  const merged: DiaryRecord = {
    ...prev,
    ...nextRecord,
    createdAt: typeof prev.createdAt === 'string' ? prev.createdAt : now,
  }

  return records.map((record, recordIndex) => (recordIndex === index ? merged : record))
}

function getYearlyReminder(now: Date): YearlyReminder {
  const month = now.getMonth()
  const day = now.getDate()
  const year = now.getFullYear()

  if (month === 11 && day >= 15) {
    return {
      show: true,
      targetYear: year,
      message: `年末阶段：建议开始整理 ${year} 年度总结。`,
    }
  }

  if (month === 0 && day <= 15) {
    return {
      show: true,
      targetYear: year - 1,
      message: `新年初期：建议继续完善 ${year - 1} 年度总结。`,
    }
  }

  return {
    show: false,
    targetYear: year,
    message: '',
  }
}

export default function WorkspacePage({ auth }: WorkspacePageProps) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [monthOffset, setMonthOffset] = useState(0)
  const [manualAuthModalOpen, setManualAuthModalOpen] = useState(false)
  const [manualSyncError, setManualSyncError] = useState<string | null>(null)
  const [diaries, setDiaries] = useState<DiaryRecord[]>([])
  const [isLoadingDiaries, setIsLoadingDiaries] = useState(true)
  const [diaryLoadError, setDiaryLoadError] = useState<string | null>(null)
  const [remotePullSignal, setRemotePullSignal] = useState(0)

  const today = useMemo(() => formatDateKey(new Date()) as DateString, [])
  const date = useMemo(() => {
    const queryDate = searchParams.get('date')
    return isValidDateString(queryDate) ? queryDate : today
  }, [searchParams, today])

  const baseMonth = useMemo(() => toMonthStartFromDateKey(date), [date])
  const month = useMemo(() => shiftMonth(baseMonth, monthOffset), [baseMonth, monthOffset])

  const diary = useDiary(
    { type: 'daily', date },
    undefined,
    {
      externalReloadSignal: remotePullSignal,
    },
  )
  const activeSyncMetadata = useMemo<DiarySyncMetadata>(
    () => ({
      type: 'daily',
      entryId: diary.entryId,
      date,
      content: diary.content,
      modifiedAt: diary.entry?.modifiedAt ?? '',
    }),
    [date, diary.content, diary.entry?.modifiedAt, diary.entryId],
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

  const yearlyReminder = useMemo(() => getYearlyReminder(new Date()), [])

  const diaryDateSet = useMemo(() => {
    return new Set(diaries.filter((record) => record.type === 'daily').map((record) => record.date))
  }, [diaries])

  const forceOpenAuthModal = auth.state.stage !== 'ready'
  const authModalOpen = forceOpenAuthModal || manualAuthModalOpen

  useEffect(() => {
    if (!canSyncToRemote) {
      return
    }
    setActiveSyncMetadata(activeSyncMetadata)
  }, [activeSyncMetadata, canSyncToRemote, setActiveSyncMetadata])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const handleRemotePullCompleted = () => {
      setRemotePullSignal((prev) => prev + 1)
    }

    window.addEventListener(REMOTE_PULL_COMPLETED_EVENT, handleRemotePullCompleted)
    return () => {
      window.removeEventListener(REMOTE_PULL_COMPLETED_EVENT, handleRemotePullCompleted)
    }
  }, [])

  useEffect(() => {
    let mounted = true

    async function loadDailyDiaries(): Promise<void> {
      setIsLoadingDiaries(true)
      setDiaryLoadError(null)

      try {
        const records = await listDiariesByIndex(DIARY_INDEX_TYPE, 'daily')
        if (!mounted) {
          return
        }
        setDiaries(records.filter((record) => record.type === 'daily'))
      } catch (error) {
        if (!mounted) {
          return
        }
        setDiaryLoadError(error instanceof Error ? error.message : '未知错误')
      } finally {
        if (mounted) {
          setIsLoadingDiaries(false)
        }
      }
    }

    void loadDailyDiaries()

    return () => {
      mounted = false
    }
  }, [remotePullSignal])

  const patchSearch = useCallback(
    (patcher: (next: URLSearchParams) => void) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        patcher(next)
        return next
      })
    },
    [setSearchParams],
  )

  const handleDateChange = useCallback(
    (nextDate: DateString) => {
      patchSearch((next) => {
        next.set('date', nextDate)
      })
      setMonthOffset(0)
    },
    [patchSearch],
  )

  const handleSelectDate = useCallback(
    (dateKey: string) => {
      if (!isValidDateString(dateKey)) {
        return
      }
      handleDateChange(dateKey)
    },
    [handleDateChange],
  )

  const handlePickMonth = useCallback(
    (year: number, monthIndex: number) => {
      const day = Number.parseInt(date.slice(8, 10), 10)
      const nextDate = buildDateFromYearMonthDay(year, monthIndex, day)
      handleDateChange(nextDate)
    },
    [date, handleDateChange],
  )

  const handleOpenYearly = useCallback(
    (targetYear?: number) => {
      const fallbackYear = Number.parseInt(date.slice(0, 4), 10)
      navigate(`/yearly/${targetYear ?? fallbackYear}`)
    },
    [date, navigate],
  )

  const handleEditorChange = (nextContent: string) => {
    diary.setContent(nextContent)

    const modifiedAt = new Date().toISOString()
    const payload: DiarySyncMetadata = {
      type: 'daily',
      entryId: diary.entryId,
      date,
      content: nextContent,
      modifiedAt,
    }
    if (canSyncToRemote) {
      sync.onInputChange(payload)
      if (manualSyncError) {
        setManualSyncError(null)
      }
    }
    setDiaries((prev) => upsertDailyRecord(prev, date, nextContent))
  }

  const saveNow = async () => {
    if (!canSyncToRemote) {
      setManualSyncError(syncDisabledMessage)
      return
    }

    const persistedEntry = await diary.waitForPersisted()
    const latestDailyEntry =
      persistedEntry && persistedEntry.type === 'daily' ? persistedEntry : diary.entry

    const payload: DiarySyncMetadata = {
      type: 'daily',
      entryId: diary.entryId,
      date,
      content: latestDailyEntry?.content ?? diary.content,
      modifiedAt: latestDailyEntry?.modifiedAt ?? new Date().toISOString(),
    }
    setManualSyncError(MANUAL_SYNC_PENDING_MESSAGE)
    const result = await sync.saveNow(payload)
    if (!result.ok) {
      setManualSyncError(getManualSyncFailureMessage(result))
      return
    }
    setManualSyncError(null)
  }

  const resolveMergeConflict = (mergedContent: string) => {
    const local = sync.conflictState?.local
    if (!local || !isDailySyncMetadata(local)) {
      return
    }

    const mergedPayload: DiarySyncMetadata = {
      ...local,
      content: mergedContent,
      modifiedAt: new Date().toISOString(),
    }
    void sync.resolveConflict('merged', mergedPayload)
  }

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

  const displayedSyncMessage = sync.errorMessage
  const displayedManualSyncError = getDisplayedManualSyncError(manualSyncError, sync.status)
  const isManualSyncing = sync.status === 'syncing'

  return (
    <>
      <main className="mx-auto min-h-screen w-full max-w-7xl px-4 pb-8 sm:px-6">
        <header className="sticky top-0 z-10 flex min-h-[68px] flex-wrap items-center justify-between gap-3 border-b border-td-line bg-td-bg/95 py-3 backdrop-blur-sm">
          <div>
            <h1 className="font-display text-2xl text-td-text">TraceDiary</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-td-line bg-td-surface px-3 py-1 text-xs text-td-muted">{sessionLabel}</span>
            <button type="button" className="td-btn" onClick={() => handleOpenYearly()}>
              年度总结
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

        {yearlyReminder.show ? (
          <section className="mt-4 td-toolbar" aria-label="yearly-reminder">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-td-muted">{yearlyReminder.message}</p>
              <button
                type="button"
                className="td-btn ml-auto"
                onClick={() => handleOpenYearly(yearlyReminder.targetYear)}
              >
                开始/继续年度总结
              </button>
            </div>
          </section>
        ) : null}

        <section className="mt-4 grid gap-4 lg:grid-cols-[minmax(285px,1fr)_minmax(0,2fr)] td-fade-in" aria-label="workspace-layout">
          <aside className="space-y-3">
            <section className="td-card-muted td-panel">
              <MonthCalendar
                month={month}
                activeDateKey={date}
                diaryDateSet={diaryDateSet}
                onPreviousMonth={() => setMonthOffset((prev) => prev - 1)}
                onNextMonth={() => setMonthOffset((prev) => prev + 1)}
                onSelectDate={handleSelectDate}
                onPickMonth={handlePickMonth}
              />
            </section>

            <section className="td-card-muted td-panel space-y-2">
              <p className="text-sm text-td-muted">往年今日</p>
              <OnThisDayList
                targetDate={date}
                diaries={diaries}
                isLoading={isLoadingDiaries}
                loadError={diaryLoadError}
                onSelectDate={handleSelectDate}
              />
            </section>
          </aside>

          <section className="space-y-3">
            <div className="td-toolbar space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <StatusHint isLoading={diary.isLoading} isSaving={diary.isSaving} error={diary.error} />
                <span className={`td-status-pill ${syncToneClass}`} data-testid="sync-status-pill">
                  {syncLabel}
                </span>
                {sync.lastSyncedAt ? (
                  <span className="rounded-full border border-td-line bg-td-surface px-2.5 py-1 text-xs text-td-muted">
                    最近同步：{sync.lastSyncedAt}
                  </span>
                ) : null}
                <span className="rounded-full border border-td-line bg-td-surface px-2.5 py-1 text-xs text-td-muted">
                  未提交改动：{sync.hasUnsyncedChanges ? '有' : '无'}
                </span>
                <span className="rounded-full border border-td-line bg-td-surface px-2.5 py-1 text-xs text-td-muted">
                  分支：{giteeBranch}
                </span>
                <div className="ml-auto flex max-w-full items-center gap-2">
                  <button
                    type="button"
                    className="td-btn"
                    onClick={() => {
                      void saveNow()
                    }}
                    data-testid="manual-sync-button"
                  >
                    {isManualSyncing ? '上传中...' : '手动保存并立即上传'}
                  </button>
                  {displayedManualSyncError ? (
                    <span
                      role="alert"
                      data-testid="manual-sync-error"
                      className="max-w-[340px] rounded-[10px] border border-red-200 bg-red-50 px-2.5 py-1 text-xs text-red-700"
                    >
                      {displayedManualSyncError}
                    </span>
                  ) : null}
                </div>
              </div>
              {displayedSyncMessage ? <p className="text-sm text-td-danger">{displayedSyncMessage}</p> : null}
            </div>

            <article className="td-card-primary td-panel">
              <h3 className="font-display text-xl text-td-text">{date} 日记</h3>
              <div className="mt-3">
                {!diary.isLoading ? (
                  <MarkdownEditor
                    key={`${diary.entryId}:${diary.loadRevision}`}
                    docKey={`${diary.entryId}:${diary.isLoading ? 'loading' : 'ready'}:${diary.loadRevision}`}
                    initialValue={diary.content}
                    onChange={handleEditorChange}
                    placeholder="写下今天的记录（支持 Markdown）"
                    testId="daily-editor"
                  />
                ) : null}
              </div>
            </article>
          </section>
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
        open={Boolean(sync.conflictState && isDailySyncMetadata(sync.conflictState.local))}
        local={{
          content:
            sync.conflictState && isDailySyncMetadata(sync.conflictState.local)
              ? sync.conflictState.local.content
              : '',
          modifiedAt:
            sync.conflictState && isDailySyncMetadata(sync.conflictState.local)
              ? sync.conflictState.local.modifiedAt
              : undefined,
        }}
        remote={
          sync.conflictState?.remote && isDailySyncMetadata(sync.conflictState.remote)
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
