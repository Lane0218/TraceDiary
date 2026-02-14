import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import AuthModal from '../components/auth/auth-modal'
import MonthCalendar from '../components/calendar/month-calendar'
import ConflictDialog from '../components/common/conflict-dialog'
import StatusHint from '../components/common/status-hint'
import MarkdownEditor from '../components/editor/markdown-editor'
import OnThisDayList from '../components/history/on-this-day-list'
import StatsOverviewCard from '../components/stats/stats-overview-card'
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
import { createDiaryUploadExecutor, pullDiaryFromGitee, type DiarySyncMetadata } from '../services/sync'
import type { DateString } from '../types/diary'
import { formatDateKey } from '../utils/date'
import { buildStatsSummary } from '../utils/stats'
import { getSyncAvailability } from '../utils/sync-availability'
import { getDiarySyncEntryId, getDiarySyncFingerprint } from '../utils/sync-dirty'
import { countVisibleChars } from '../utils/word-count'
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
import { REMOTE_PULL_COMPLETED_EVENT } from '../utils/remote-sync-events'

interface WorkspacePageProps {
  auth: UseAuthResult
}

interface YearlyReminder {
  show: boolean
  targetYear: number
  message: string
}

type WorkspaceLeftPanelTab = 'history' | 'stats'

const WORKSPACE_LEFT_PANEL_STORAGE_KEY = 'trace-diary:workspace:left-panel'
const WORKSPACE_PANEL_HEIGHT_DESKTOP = 340
const WORKSPACE_PANEL_BODY_HEIGHT_DESKTOP = 252
const WORKSPACE_EDITOR_BODY_HEIGHT_DESKTOP = 480
const WORKSPACE_PANEL_HEIGHT_STYLE = {
  '--workspace-panel-height': `${WORKSPACE_PANEL_HEIGHT_DESKTOP}px`,
  '--workspace-panel-body-height': `${WORKSPACE_PANEL_BODY_HEIGHT_DESKTOP}px`,
} as CSSProperties

function getInitialLeftPanelTab(): WorkspaceLeftPanelTab {
  if (typeof window === 'undefined') {
    return 'history'
  }
  const persisted = window.localStorage.getItem(WORKSPACE_LEFT_PANEL_STORAGE_KEY)
  return persisted === 'stats' ? 'stats' : 'history'
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
    wordCount: countVisibleChars(content),
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
  const [leftPanelTab, setLeftPanelTab] = useState<WorkspaceLeftPanelTab>(() => getInitialLeftPanelTab())
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
  const [diaries, setDiaries] = useState<DiaryRecord[]>([])
  const [yearlySummaries, setYearlySummaries] = useState<DiaryRecord[]>([])
  const [isLoadingDiaries, setIsLoadingDiaries] = useState(true)
  const [diaryLoadError, setDiaryLoadError] = useState<string | null>(null)
  const [remotePullSignal, setRemotePullSignal] = useState(0)
  const [pullConflictState, setPullConflictState] = useState<{
    local: DiarySyncMetadata
    remote: DiarySyncMetadata | null
    remoteSha?: string
  } | null>(null)

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
    getLocalModifiedAt: (metadata) => metadata.modifiedAt,
    loadBaseline: async (entryId) => getSyncBaseline(entryId),
    saveBaseline: async (baseline) => saveSyncBaseline(baseline),
  })
  const setActiveSyncMetadata = sync.setActiveMetadata
  const updateSyncActionSnapshot = useCallback(
    (action: 'pull' | 'push', snapshot: SyncActionSnapshot) => {
      if (action === 'pull') {
        setPullActionSnapshot(snapshot)
      } else {
        setPushActionSnapshot(snapshot)
      }
      saveSyncActionSnapshot('workspace', diary.entryId, action, snapshot)
    },
    [diary.entryId],
  )

  const yearlyReminder = useMemo(() => getYearlyReminder(new Date()), [])
  const statsSummary = useMemo(() => buildStatsSummary([...diaries, ...yearlySummaries]), [diaries, yearlySummaries])

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
    setPullActionSnapshot(loadSyncActionSnapshot('workspace', diary.entryId, 'pull'))
    setPushActionSnapshot(loadSyncActionSnapshot('workspace', diary.entryId, 'push'))
  }, [diary.entryId])

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

    async function loadDiaries(): Promise<void> {
      setIsLoadingDiaries(true)
      setDiaryLoadError(null)

      try {
        const [dailyRecords, yearlySummaryRecords] = await Promise.all([
          listDiariesByIndex(DIARY_INDEX_TYPE, 'daily'),
          listDiariesByIndex(DIARY_INDEX_TYPE, 'yearly_summary'),
        ])
        if (!mounted) {
          return
        }
        setDiaries(dailyRecords.filter((record) => record.type === 'daily'))
        setYearlySummaries(yearlySummaryRecords.filter((record) => record.type === 'yearly_summary'))
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

    void loadDiaries()

    return () => {
      mounted = false
    }
  }, [remotePullSignal])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    window.localStorage.setItem(WORKSPACE_LEFT_PANEL_STORAGE_KEY, leftPanelTab)
  }, [leftPanelTab])

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
  const handleOpenInsights = useCallback(() => {
    navigate('/insights')
  }, [navigate])

  const handleEditorChange = (nextContent: string) => {
    diary.setContent(nextContent)

    const payload: DiarySyncMetadata = {
      type: 'daily',
      entryId: diary.entryId,
      date,
      content: nextContent,
      modifiedAt: new Date().toISOString(),
    }
    if (canSyncToRemote) {
      sync.onInputChange(payload)
    }
    if (manualSyncError) {
      setManualSyncError(null)
    }
    if (manualPullError) {
      setManualPullError(null)
    }
    setDiaries((prev) => upsertDailyRecord(prev, date, nextContent))
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
    const pushStartedAt = new Date().toISOString()
    updateSyncActionSnapshot('push', {
      status: 'running',
      at: pushStartedAt,
    })
    setManualSyncError(MANUAL_SYNC_PENDING_MESSAGE)
    const result = await sync.saveNow(payload)
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
    if (!isDailySyncMetadata(remote)) {
      return
    }
    diary.setContent(remote.content)
    setDiaries((prev) => upsertDailyRecord(prev, date, remote.content))
    await sync.markSynced(
      {
        ...remote,
        entryId: diary.entryId,
        date,
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

    const persistedEntry = await diary.waitForPersisted()
    const latestDailyEntry =
      persistedEntry && persistedEntry.type === 'daily' ? persistedEntry : diary.entry
    const localPayload: DiarySyncMetadata = {
      type: 'daily',
      entryId: diary.entryId,
      date,
      content: latestDailyEntry?.content ?? diary.content,
      modifiedAt: latestDailyEntry?.modifiedAt ?? new Date().toISOString(),
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
      if (!isDailySyncMetadata(local)) {
        return
      }

      const mergedPayload: DiarySyncMetadata = {
        ...local,
        content: mergedContent,
        modifiedAt: new Date().toISOString(),
      }
      diary.setContent(mergedContent)
      setDiaries((prev) => upsertDailyRecord(prev, date, mergedContent))
      sync.onInputChange(mergedPayload)
      setPullConflictState(null)
      setManualPullError('已应用合并内容，请确认后手动上传')
      return
    }

    const local = sync.conflictState?.local
    if (!local || !isDailySyncMetadata(local)) {
      return
    }

    const mergedPayload: DiarySyncMetadata = {
      ...local,
      content: mergedContent,
      modifiedAt: new Date().toISOString(),
    }
    resolvePushConflict('merged', mergedPayload)
  }

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
      if (remote && isDailySyncMetadata(remote)) {
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
          <div>
            <h1 className="font-display text-2xl text-td-text">TraceDiary</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-td-line bg-td-surface px-3 py-1 text-xs text-td-muted">{sessionLabel}</span>
            <button type="button" className="td-btn" onClick={() => handleOpenYearly()}>
              年度总结
            </button>
            <button type="button" className="td-btn" onClick={handleOpenInsights}>
              统计详情
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

        <section
          className="mt-4 grid gap-4 lg:grid-cols-[minmax(285px,1fr)_minmax(0,2fr)] lg:items-stretch td-fade-in"
          aria-label="workspace-layout"
        >
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

            <section
              className="td-card-muted td-panel flex flex-col space-y-2.5 lg:h-[var(--workspace-panel-height)]"
              style={WORKSPACE_PANEL_HEIGHT_STYLE}
              data-testid="workspace-left-panel"
            >
              <div className="flex items-center gap-2">
                <div className="grid min-w-0 flex-1 grid-cols-2 rounded-[11px] border border-[#d2d1cd] bg-[#ebe9e4] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                  <button
                    type="button"
                    className={`rounded-[8px] px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                      leftPanelTab === 'history'
                        ? 'bg-[#333a36] text-[#f7f5ef] shadow-[0_2px_6px_rgba(16,24,20,0.2)]'
                        : 'text-[#4f5751] hover:bg-[#f7f5ef] hover:text-[#1f2622]'
                    }`}
                    onClick={() => {
                      setLeftPanelTab('history')
                    }}
                    data-testid="workspace-left-tab-history"
                  >
                    往年今日
                  </button>
                  <button
                    type="button"
                    className={`rounded-[8px] px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                      leftPanelTab === 'stats'
                        ? 'bg-[#333a36] text-[#f7f5ef] shadow-[0_2px_6px_rgba(16,24,20,0.2)]'
                        : 'text-[#4f5751] hover:bg-[#f7f5ef] hover:text-[#1f2622]'
                    }`}
                    onClick={() => {
                      setLeftPanelTab('stats')
                    }}
                    data-testid="workspace-left-tab-stats"
                  >
                    数据统计
                  </button>
                </div>
              </div>

              <div
                className="min-h-0 flex-1 lg:h-[var(--workspace-panel-body-height)] lg:flex-none"
                style={WORKSPACE_PANEL_HEIGHT_STYLE}
                data-testid="workspace-left-panel-body"
              >
                {leftPanelTab === 'history' ? (
                  <OnThisDayList
                    targetDate={date}
                    diaries={diaries}
                    isLoading={isLoadingDiaries}
                    loadError={diaryLoadError}
                    onSelectDate={handleSelectDate}
                    viewportHeight={WORKSPACE_PANEL_BODY_HEIGHT_DESKTOP}
                  />
                ) : (
                  <StatsOverviewCard
                    summary={statsSummary}
                    isLoading={isLoadingDiaries}
                    error={diaryLoadError}
                  />
                )}
              </div>
            </section>
          </aside>

          <section className="space-y-3 lg:flex lg:h-full lg:flex-col">
            <div className="td-toolbar space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <StatusHint isLoading={diary.isLoading} isSaving={diary.isSaving} error={diary.error} />
                <span className={`td-status-pill ${pullStatusToneClass}`} data-testid="pull-status-pill">
                  {pullStatusLabel}
                </span>
                <span className={`td-status-pill ${pushStatusToneClass}`} data-testid="push-status-pill">
                  {pushStatusLabel}
                </span>
                <div className="ml-auto flex max-w-full items-center gap-2">
                  <button
                    type="button"
                    className="td-btn"
                    onClick={() => {
                      void pullNow()
                    }}
                    data-testid="manual-pull-button"
                  >
                    {isManualPulling ? 'pulling...' : 'pull'}
                  </button>
                  <button
                    type="button"
                    className="td-btn"
                    onClick={() => {
                      void saveNow()
                    }}
                    data-testid="manual-sync-button"
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

            <article
              className="td-card-primary td-panel flex flex-col lg:min-h-[520px] lg:flex-1"
              data-testid="workspace-diary-panel"
            >
              <h3 className="font-display text-xl text-td-text">{date} 日记</h3>
              <div className="min-h-0 flex-1" data-testid="workspace-diary-editor-slot">
                {!diary.isLoading ? (
                  <MarkdownEditor
                    key={`${diary.entryId}:${diary.loadRevision}`}
                    docKey={`${diary.entryId}:${diary.isLoading ? 'loading' : 'ready'}:${diary.loadRevision}`}
                    initialValue={diary.content}
                    onChange={handleEditorChange}
                    placeholder="写下今天的记录（支持 Markdown）"
                    testId="daily-editor"
                    modeToggleClassName="-mt-8 mb-5"
                    viewportHeight={WORKSPACE_EDITOR_BODY_HEIGHT_DESKTOP}
                    fillHeight
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
        open={Boolean(activeConflictState && isDailySyncMetadata(activeConflictState.local))}
        mode={activeConflictMode}
        local={{
          content:
            activeConflictState && isDailySyncMetadata(activeConflictState.local)
              ? activeConflictState.local.content
              : '',
          modifiedAt:
            activeConflictState && isDailySyncMetadata(activeConflictState.local)
              ? activeConflictState.local.modifiedAt
              : undefined,
        }}
        remote={
          activeConflictState?.remote && isDailySyncMetadata(activeConflictState.remote)
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
