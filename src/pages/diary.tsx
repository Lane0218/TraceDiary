import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import AuthModal from '../components/auth/auth-modal'
import MonthCalendar from '../components/calendar/month-calendar'
import AppHeader, { type AppHeaderAuthEntry } from '../components/common/app-header'
import ConflictDialog from '../components/common/conflict-dialog'
import SyncControlBar from '../components/common/sync-control-bar'
import StatusHint from '../components/common/status-hint'
import MarkdownEditor from '../components/editor/markdown-editor'
import OnThisDayList from '../components/history/on-this-day-list'
import StatsOverviewCard from '../components/stats/stats-overview-card'
import type { UseAuthResult } from '../hooks/use-auth'
import { useDiary } from '../hooks/use-diary'
import { useSync } from '../hooks/use-sync'
import { useToast } from '../hooks/use-toast'
import {
  DIARY_INDEX_TYPE,
  getDiary,
  getSyncBaseline,
  listDiariesByIndex,
  saveSyncBaseline,
  type DiaryRecord,
} from '../services/indexeddb'
import {
  GUEST_MODE_READ_ONLY_MESSAGE,
  getDemoDailyEntry,
  listDemoDailyRecords,
  listDemoYearlySummaries,
} from '../services/demo-data'
import {
  createDiaryUploadExecutor,
  pullDiaryFromGitee,
  type DiarySyncMetadata,
} from '../services/sync'
import type { DateString } from '../types/diary'
import { formatDateKey, getDiaryDateKey } from '../utils/date'
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
  getManualSyncFailureMessage,
  getSyncActionLabel,
  getSyncActionToneClass,
  loadSyncActionSnapshot,
  saveSyncActionSnapshot,
  type SyncActionSnapshot,
} from '../utils/sync-presentation'
import { REMOTE_PULL_COMPLETED_EVENT } from '../utils/remote-sync-events'

interface DiaryPageProps {
  auth: UseAuthResult
  headerAuthEntry?: AppHeaderAuthEntry
  isGuestMode: boolean
  onEnterUserMode: () => void
}

interface YearlyReminder {
  show: boolean
  targetYear: number
  message: string
}

type DiaryLeftPanelTab = 'history' | 'stats'

const DIARY_LEFT_PANEL_STORAGE_KEY = 'trace-diary:diary:left-panel'
const DIARY_PANEL_HEIGHT_DESKTOP = 340
const DIARY_PANEL_BODY_HEIGHT_DESKTOP = 252
const DIARY_EDITOR_BODY_HEIGHT_DESKTOP = 480
const EMPTY_PUSH_BLOCKED_MESSAGE = '当前内容为空，无需 push'
const DIARY_PANEL_HEIGHT_STYLE = {
  '--diary-panel-height': `${DIARY_PANEL_HEIGHT_DESKTOP}px`,
  '--diary-panel-body-height': `${DIARY_PANEL_BODY_HEIGHT_DESKTOP}px`,
} as CSSProperties

function getInitialLeftPanelTab(): DiaryLeftPanelTab {
  if (typeof window === 'undefined') {
    return 'history'
  }
  const persisted = window.localStorage.getItem(DIARY_LEFT_PANEL_STORAGE_KEY)
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

function hasDiaryContent(content: string): boolean {
  return countVisibleChars(content) > 0
}

function upsertDailyRecord(records: DiaryRecord[], date: DateString, content: string): DiaryRecord[] {
  const id = `daily:${date}`
  if (!hasDiaryContent(content)) {
    return records.filter((record) => record.id !== id)
  }

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

export default function DiaryPage({ auth, headerAuthEntry, isGuestMode, onEnterUserMode }: DiaryPageProps) {
  const navigate = useNavigate()
  const { push: pushToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const [monthOffset, setMonthOffset] = useState(0)
  const [leftPanelTab, setLeftPanelTab] = useState<DiaryLeftPanelTab>(() => getInitialLeftPanelTab())
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
  const [dismissedTokenRefreshKey, setDismissedTokenRefreshKey] = useState<string | null>(null)
  const [pullConflictState, setPullConflictState] = useState<{
    local: DiarySyncMetadata
    remote: DiarySyncMetadata | null
    remoteSha?: string
  } | null>(null)

  const today = useMemo(() => getDiaryDateKey(new Date()) as DateString, [])
  const date = useMemo(() => {
    const queryDate = searchParams.get('date')
    return isValidDateString(queryDate) ? queryDate : today
  }, [searchParams, today])

  const baseMonth = useMemo(() => toMonthStartFromDateKey(date), [date])
  const month = useMemo(() => shiftMonth(baseMonth, monthOffset), [baseMonth, monthOffset])
  const demoDiaryEntry = useMemo(() => getDemoDailyEntry(date), [date])

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
  const canSyncToRemote = !isGuestMode && syncAvailability.canSyncToRemote
  const syncDisabledMessage = isGuestMode ? GUEST_MODE_READ_ONLY_MESSAGE : syncAvailability.disabledMessage
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
      saveSyncActionSnapshot('diary', diary.entryId, action, snapshot)
    },
    [diary.entryId],
  )
  const updateSyncActionStatus = useCallback(
    (
      action: 'pull' | 'push',
      status: SyncActionSnapshot['status'],
      reason: string | null = null,
      at: string = new Date().toISOString(),
    ) => {
      updateSyncActionSnapshot(action, { status, at, reason })
    },
    [updateSyncActionSnapshot],
  )
  const lastSyncNotifyMessageRef = useRef<string | null>(null)

  const yearlyReminder = useMemo(() => getYearlyReminder(new Date()), [])
  const statsSummary = useMemo(() => buildStatsSummary([...diaries, ...yearlySummaries]), [diaries, yearlySummaries])

  const diaryDateSet = useMemo(() => {
    return new Set(
      diaries
        .filter((record) => record.type === 'daily' && hasDiaryContent(record.content ?? ''))
        .map((record) => record.date),
    )
  }, [diaries])

  const needsTokenRefresh = auth.state.stage === 'needs-token-refresh'
  const tokenRefreshKey = [
    auth.state.tokenRefreshReason ?? 'unknown',
    auth.state.errorMessage ?? '',
    auth.state.config?.giteeOwner ?? '',
    auth.state.config?.giteeRepoName ?? '',
    auth.state.config?.giteeBranch ?? '',
  ].join('|')
  const forceOpenAuthModal = (auth.state.stage === 'checking' || auth.state.stage === 'needs-unlock') && !isGuestMode
  const authModalOpen = forceOpenAuthModal || (needsTokenRefresh && !isGuestMode && dismissedTokenRefreshKey !== tokenRefreshKey)

  useEffect(() => {
    if (!canSyncToRemote) {
      return
    }
    setActiveSyncMetadata(activeSyncMetadata)
  }, [activeSyncMetadata, canSyncToRemote, setActiveSyncMetadata])

  useEffect(() => {
    setPullActionSnapshot(loadSyncActionSnapshot('diary', diary.entryId, 'pull'))
    setPushActionSnapshot(loadSyncActionSnapshot('diary', diary.entryId, 'push'))
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

      if (isGuestMode) {
        if (!mounted) {
          return
        }
        setDiaries(listDemoDailyRecords(date))
        setYearlySummaries(listDemoYearlySummaries(Number.parseInt(date.slice(0, 4), 10)))
        setIsLoadingDiaries(false)
        return
      }

      try {
        const [dailyRecords, yearlySummaryRecords] = await Promise.all([
          listDiariesByIndex(DIARY_INDEX_TYPE, 'daily'),
          listDiariesByIndex(DIARY_INDEX_TYPE, 'yearly_summary'),
        ])
        if (!mounted) {
          return
        }
        setDiaries(
          dailyRecords.filter((record) => record.type === 'daily' && hasDiaryContent(record.content ?? '')),
        )
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
  }, [date, isGuestMode, remotePullSignal])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    window.localStorage.setItem(DIARY_LEFT_PANEL_STORAGE_KEY, leftPanelTab)
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
  const handleEditorChange = (nextContent: string) => {
    if (isGuestMode) {
      return
    }
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
      updateSyncActionStatus('push', 'error', syncDisabledMessage)
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

    const persistedEntry = await diary.waitForPersisted()
    const latestDailyEntry =
      persistedEntry && persistedEntry.type === 'daily' ? persistedEntry : diary.entry
    const persistedContent = latestDailyEntry?.content ?? ''
    const liveContent = diary.content
    let contentForSync = persistedContent.trim() ? persistedContent : liveContent

    if (!contentForSync.trim()) {
      const storedEntry = await getDiary(diary.entryId).catch(() => null)
      const storedContent = typeof storedEntry?.content === 'string' ? storedEntry.content : ''
      if (storedContent.trim()) {
        contentForSync = storedContent
      }
    }

    const payload: DiarySyncMetadata = {
      type: 'daily',
      entryId: diary.entryId,
      date,
      content: contentForSync,
      modifiedAt: latestDailyEntry?.modifiedAt ?? new Date().toISOString(),
    }
    if (!payload.content.trim()) {
      setManualSyncError(null)
      pushToast({
        kind: 'push',
        level: 'warning',
        message: EMPTY_PUSH_BLOCKED_MESSAGE,
      })
      return
    }
    const pushStartedAt = new Date().toISOString()
    updateSyncActionStatus('push', 'running', null, pushStartedAt)
    setManualSyncError(MANUAL_SYNC_PENDING_MESSAGE)
    pushToast({
      kind: 'push',
      level: 'info',
      message: MANUAL_SYNC_PENDING_MESSAGE,
      autoDismiss: false,
    })
    const result = await sync.saveNow(payload)
    if (!result.ok) {
      const errorMessage = getManualSyncFailureMessage(result)
      if (result.code !== 'busy') {
        updateSyncActionStatus('push', 'error', errorMessage)
      }
      setManualSyncError(errorMessage)
      pushToast({
        kind: 'push',
        level: result.code === 'busy' || result.code === 'offline' ? 'warning' : 'error',
        message: errorMessage,
      })
      return
    }
    updateSyncActionStatus('push', 'success')
    setManualSyncError(null)
    pushToast({
      kind: 'push',
      level: 'success',
      message: 'push 已完成，同步成功',
    })
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
    updateSyncActionStatus('pull', 'success')
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
      updateSyncActionStatus('pull', 'error', syncDisabledMessage)
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

    const persistedEntry = await diary.waitForPersisted()
    const latestDailyEntry =
      persistedEntry && persistedEntry.type === 'daily' ? persistedEntry : diary.entry
    const persistedContent = latestDailyEntry?.content ?? ''
    const liveContent = diary.content
    const contentForSync = persistedContent.trim() ? persistedContent : liveContent
    const localPayload: DiarySyncMetadata = {
      type: 'daily',
      entryId: diary.entryId,
      date,
      content: contentForSync,
      modifiedAt: latestDailyEntry?.modifiedAt ?? new Date().toISOString(),
    }

    setIsManualPulling(true)
    updateSyncActionStatus('pull', 'running')
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
        const message = '检测到拉取冲突，请选择保留本地、远端或合并版本'
        setPullConflictState({
          local: result.conflictPayload?.local ?? localPayload,
          remote: result.conflictPayload?.remote ?? null,
          remoteSha: result.remoteSha,
        })
        updateSyncActionStatus('pull', 'error', message)
        setManualPullError(message)
        pushToast({
          kind: 'pull',
          level: 'warning',
          message,
        })
        return
      }

      if (!result.ok || !result.pulledMetadata) {
        const message = getManualPullFailureMessage(result.reason)
        updateSyncActionStatus('pull', 'error', message)
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
      const message = error instanceof Error && error.message.trim() ? error.message : '拉取失败，请稍后重试'
      updateSyncActionStatus('pull', 'error', message)
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
    updateSyncActionStatus('push', 'running')
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
            updateSyncActionStatus('push', 'error', result.errorMessage)
          }
          setManualSyncError(result.errorMessage)
          pushToast({
            kind: 'push',
            level: result.code === 'busy' || result.code === 'offline' ? 'warning' : 'error',
            message: result.errorMessage,
          })
          return
        }
        updateSyncActionStatus('push', 'success')
        setManualSyncError(null)
        pushToast({
          kind: 'push',
          level: 'success',
          message: '冲突已处理，push 成功',
        })
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : '冲突处理失败，请稍后重试'
        updateSyncActionStatus('push', 'error', message)
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
      pushToast({
        kind: 'pull',
        level: 'info',
        message: '已应用合并内容，请确认后手动上传',
      })
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

  const isManualSyncing = sync.status === 'syncing'
  const activeConflictState = pullConflictState ?? sync.conflictState
  const activeConflictMode = pullConflictState ? 'pull' : 'push'
  const yearlyNavHref = useMemo(() => `/yearly/${Number.parseInt(date.slice(0, 4), 10)}`, [date])

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
      if (remote && isDailySyncMetadata(remote)) {
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
        <AppHeader
          currentPage="diary"
          yearlyHref={yearlyNavHref}
          authEntry={headerAuthEntry}
          guestMode={
            isGuestMode
              ? {
                  enabled: true,
                  onExit: onEnterUserMode,
                }
              : undefined
          }
        />

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
          aria-label="diary-layout"
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
              className="td-card-muted td-panel flex flex-col space-y-2.5 lg:h-[var(--diary-panel-height)]"
              style={DIARY_PANEL_HEIGHT_STYLE}
              data-testid="diary-left-panel"
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
                    data-testid="diary-left-tab-history"
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
                    data-testid="diary-left-tab-stats"
                  >
                    统计概览
                  </button>
                </div>
              </div>

              <div
                className="min-h-0 flex-1 lg:h-[var(--diary-panel-body-height)] lg:flex-none"
                style={DIARY_PANEL_HEIGHT_STYLE}
                data-testid="diary-left-panel-body"
              >
                {leftPanelTab === 'history' ? (
                  <OnThisDayList
                    targetDate={date}
                    diaries={diaries}
                    isLoading={isLoadingDiaries}
                    loadError={diaryLoadError}
                    onSelectDate={handleSelectDate}
                    viewportHeight={DIARY_PANEL_BODY_HEIGHT_DESKTOP}
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
            <SyncControlBar
              statusHint={
                <StatusHint
                  isLoading={isGuestMode ? false : diary.isLoading}
                  isSaving={isGuestMode ? false : diary.isSaving}
                  error={isGuestMode ? null : diary.error}
                />
              }
              pullStatusLabel={pullStatusLabel}
              pushStatusLabel={pushStatusLabel}
              pullStatusToneClass={pullStatusToneClass}
              pushStatusToneClass={pushStatusToneClass}
              pullStatus={pullActionSnapshot.status}
              pushStatus={pushActionSnapshot.status}
              pullFailureReason={pullActionSnapshot.reason}
              pushFailureReason={pushActionSnapshot.reason}
              isPulling={isManualPulling}
              isPushing={isManualSyncing}
              onPull={() => {
                void pullNow()
              }}
              onPush={() => {
                void saveNow()
              }}
            />

            <article
              className="td-card-primary td-panel flex flex-col lg:min-h-[520px] lg:flex-1"
              data-testid="diary-panel"
            >
              <h3 className="font-display text-xl text-td-text">{date} 日记</h3>
              <div className="min-h-0 flex-1" data-testid="diary-editor-slot">
                {isGuestMode || !diary.isLoading ? (
                  <MarkdownEditor
                    key={isGuestMode ? `guest:${date}` : `${diary.entryId}:${diary.loadRevision}`}
                    docKey={
                      isGuestMode
                        ? `guest:${date}`
                        : `${diary.entryId}:${diary.isLoading ? 'loading' : 'ready'}:${diary.loadRevision}`
                    }
                    initialValue={isGuestMode ? (demoDiaryEntry.content ?? '') : diary.content}
                    onChange={handleEditorChange}
                    placeholder="写下今天的记录（支持 Markdown）"
                    testId="daily-editor"
                    modeToggleClassName="-mt-8 mb-5"
                    viewportHeight={DIARY_EDITOR_BODY_HEIGHT_DESKTOP}
                    fillHeight
                    disabled={isGuestMode}
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
        onClose={() => setDismissedTokenRefreshKey(tokenRefreshKey)}
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
