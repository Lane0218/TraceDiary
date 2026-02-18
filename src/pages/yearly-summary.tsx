import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import AuthModal from '../components/auth/auth-modal'
import AppHeader from '../components/common/app-header'
import ConflictDialog from '../components/common/conflict-dialog'
import PullResultDialog from '../components/common/pull-result-dialog'
import SyncControlBar from '../components/common/sync-control-bar'
import StatusHint from '../components/common/status-hint'
import MarkdownEditor from '../components/editor/markdown-editor'
import YearlyQuickStats from '../components/yearly/yearly-quick-stats'
import YearlyToc from '../components/yearly/yearly-toc'
import type { UseAuthResult } from '../hooks/use-auth'
import { useDiary } from '../hooks/use-diary'
import { useSync } from '../hooks/use-sync'
import { useToast } from '../hooks/use-toast'
import { DIARY_INDEX_TYPE, getDiary, getSyncBaseline, listDiariesByIndex, saveSyncBaseline } from '../services/indexeddb'
import {
  createDiaryUploadExecutor,
  pullDiaryFromGitee,
  pullRemoteDiariesToIndexedDb,
  type DiarySyncMetadata,
  type PullRemoteDiariesToIndexedDbResult,
} from '../services/sync'
import { buildMarkdownToc, type TocHeadingItem } from '../utils/markdown-toc'
import { emitRemotePullCompletedEvent } from '../utils/remote-sync-events'
import { getSyncAvailability } from '../utils/sync-availability'
import { getDiarySyncEntryId, getDiarySyncFingerprint } from '../utils/sync-dirty'
import {
  buildYearlySidebarStats,
  createEmptyYearlySidebarStats,
  type YearlySidebarStats,
} from '../utils/yearly-sidebar-stats'
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
const RENDERED_HEADING_SELECTOR = '.ProseMirror h1'

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
  const yearlyEditorPanelRef = useRef<HTMLElement | null>(null)
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
  const [pullExecutionResult, setPullExecutionResult] = useState<PullRemoteDiariesToIndexedDbResult | null>(null)

  const currentYear = useMemo(() => new Date().getFullYear(), [])
  const year = useMemo(() => normalizeYear(params.year, currentYear), [currentYear, params.year])
  const [isYearPickerOpen, setIsYearPickerOpen] = useState(false)
  const [draftYear, setDraftYear] = useState(year)
  const [draftYearInput, setDraftYearInput] = useState(String(year))
  const [sidebarStats, setSidebarStats] = useState<YearlySidebarStats>(() => createEmptyYearlySidebarStats())
  const [isSidebarStatsLoading, setIsSidebarStatsLoading] = useState(true)
  const [activeTocId, setActiveTocId] = useState<string | null>(null)
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
  const updateSyncActionStatus = (
    action: 'pull' | 'push',
    status: SyncActionSnapshot['status'],
    reason: string | null = null,
    at: string = new Date().toISOString(),
  ) => {
    updateSyncActionSnapshot(action, { status, at, reason })
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
    setDraftYear(year)
    setDraftYearInput(String(year))
  }, [year])

  useEffect(() => {
    let mounted = true
    setIsSidebarStatsLoading(true)

    void listDiariesByIndex(DIARY_INDEX_TYPE, 'daily')
      .then((dailyRecords) => {
        if (!mounted) {
          return
        }
        setSidebarStats(buildYearlySidebarStats(dailyRecords, year))
      })
      .catch(() => {
        if (!mounted) {
          return
        }
        setSidebarStats(createEmptyYearlySidebarStats())
      })
      .finally(() => {
        if (!mounted) {
          return
        }
        setIsSidebarStatsLoading(false)
      })

    return () => {
      mounted = false
    }
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
  const tocItems = useMemo(() => buildMarkdownToc(summary.content), [summary.content])

  const collectRenderedHeadings = useCallback((): HTMLElement[] => {
    const panel = yearlyEditorPanelRef.current
    if (!panel) {
      return []
    }
    return [...panel.querySelectorAll(RENDERED_HEADING_SELECTOR)] as HTMLElement[]
  }, [])

  const resolveTocIdFromRenderedHeading = useCallback(
    (target: HTMLElement, renderedHeadings: HTMLElement[]): string | null => {
      const headingTagText = target.tagName.trim().toUpperCase()
      const level = Number.parseInt(headingTagText.replace('H', ''), 10)
      if (!Number.isFinite(level) || level < 1 || level > 3) {
        return null
      }
      const headingText = target.textContent?.trim() ?? ''
      if (!headingText) {
        return null
      }

      let headingOccurrence = 0
      for (const renderedHeading of renderedHeadings) {
        const renderedTagText = renderedHeading.tagName.trim().toUpperCase()
        const renderedLevel = Number.parseInt(renderedTagText.replace('H', ''), 10)
        const renderedText = renderedHeading.textContent?.trim() ?? ''
        if (renderedLevel === level && renderedText === headingText) {
          headingOccurrence += 1
        }
        if (renderedHeading === target) {
          break
        }
      }
      if (headingOccurrence === 0) {
        return null
      }

      let modelOccurrence = 0
      for (const item of tocItems) {
        if (item.level === level && item.text === headingText) {
          modelOccurrence += 1
          if (modelOccurrence === headingOccurrence) {
            return item.id
          }
        }
      }

      return null
    },
    [tocItems],
  )

  useEffect(() => {
    setActiveTocId(tocItems[0]?.id ?? null)
  }, [tocItems])

  useEffect(() => {
    if (tocItems.length === 0) {
      setActiveTocId(null)
      return
    }
    const panel = yearlyEditorPanelRef.current
    if (!panel) {
      return
    }

    let rafHandle = 0
    const updateActiveTocIdByViewport = () => {
      const renderedHeadings = collectRenderedHeadings()
      if (renderedHeadings.length === 0) {
        return
      }

      const panelTop = panel.getBoundingClientRect().top
      const anchorTop = panelTop + 112

      let candidate = renderedHeadings[0]
      for (const heading of renderedHeadings) {
        if (heading.getBoundingClientRect().top <= anchorTop) {
          candidate = heading
          continue
        }
        break
      }

      const nextActiveId = resolveTocIdFromRenderedHeading(candidate, renderedHeadings)
      if (nextActiveId) {
        setActiveTocId(nextActiveId)
      }
    }

    const scheduleUpdate = () => {
      if (rafHandle) {
        cancelAnimationFrame(rafHandle)
      }
      rafHandle = requestAnimationFrame(updateActiveTocIdByViewport)
    }

    scheduleUpdate()
    panel.addEventListener('scroll', scheduleUpdate, true)
    window.addEventListener('resize', scheduleUpdate)
    const observer = new MutationObserver(scheduleUpdate)
    observer.observe(panel, { childList: true, subtree: true })

    return () => {
      if (rafHandle) {
        cancelAnimationFrame(rafHandle)
      }
      panel.removeEventListener('scroll', scheduleUpdate, true)
      window.removeEventListener('resize', scheduleUpdate)
      observer.disconnect()
    }
  }, [collectRenderedHeadings, resolveTocIdFromRenderedHeading, tocItems])

  const handleSelectTocItem = useCallback(
    (item: TocHeadingItem) => {
      const renderedHeadings = collectRenderedHeadings()
      if (renderedHeadings.length === 0) {
        return
      }

      const match = renderedHeadings.find((heading) => resolveTocIdFromRenderedHeading(heading, renderedHeadings) === item.id)
      if (!match) {
        return
      }
      setActiveTocId(item.id)
      match.scrollIntoView({ behavior: 'smooth', block: 'start' })
    },
    [collectRenderedHeadings, resolveTocIdFromRenderedHeading],
  )

  const handleYearChange = (nextYear: number) => {
    if (!Number.isFinite(nextYear) || nextYear < MIN_YEAR || nextYear > MAX_YEAR || nextYear === year) {
      return
    }
    navigate(`/yearly/${nextYear}`)
  }

  const applyDraftYear = (nextYear: number) => {
    if (!Number.isFinite(nextYear) || nextYear < MIN_YEAR || nextYear > MAX_YEAR) {
      return
    }
    setDraftYear(nextYear)
    setDraftYearInput(String(nextYear))
  }

  const handleConfirmYearPicker = () => {
    setIsYearPickerOpen(false)
    handleYearChange(draftYear)
  }

  const handleResetYearPicker = () => {
    const nowYear = new Date().getFullYear()
    applyDraftYear(nowYear)
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
    updateSyncActionStatus('push', 'running', null, pushStartedAt)
    setManualSyncError(MANUAL_SYNC_PENDING_MESSAGE)
    pushToast({
      kind: 'push',
      level: 'info',
      message: MANUAL_SYNC_PENDING_MESSAGE,
      autoDismiss: false,
    })
    const result = await sync.saveNow(manualPayload)
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
      const message = error instanceof Error ? error.message : '拉取失败，请稍后重试'
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

  const pullAllNow = async () => {
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

    setIsManualPulling(true)
    setPullExecutionResult(null)
    updateSyncActionStatus('pull', 'running')
    setManualPullError(MANUAL_PULL_PENDING_MESSAGE)
    pushToast({
      kind: 'pull',
      level: 'info',
      message: MANUAL_PULL_PENDING_MESSAGE,
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

      setPullExecutionResult(result)
      emitRemotePullCompletedEvent()

      const summaryMessage = `全量 pull 完成：新增 ${result.inserted}，更新 ${result.updated}，跳过 ${result.skipped}，冲突 ${result.conflicted}，失败 ${result.failed}`
      if (result.failed > 0) {
        const failedMessage = `全量 pull 部分失败（${result.failed} 条）`
        updateSyncActionStatus('pull', 'error', failedMessage)
        setManualPullError(failedMessage)
        pushToast({
          kind: 'pull',
          level: 'warning',
          message: summaryMessage,
        })
        return
      }

      updateSyncActionStatus('pull', 'success')
      setManualPullError(null)
      pushToast({
        kind: 'pull',
        level: result.conflicted > 0 ? 'warning' : 'success',
        message: summaryMessage,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : '全量拉取失败，请稍后重试'
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
          className="mt-4 grid gap-4 td-fade-in lg:min-h-[calc(100vh-150px)] lg:grid-cols-[minmax(260px,300px)_minmax(0,1fr)] lg:items-stretch"
          aria-label="yearly-summary-page"
        >
          <aside className="space-y-3 lg:flex lg:min-h-0 lg:flex-col">
            <section className="td-card-muted td-panel" data-testid="yearly-sidebar-header">
              <div className="relative">
                <h1 className="font-display text-td-text" aria-label={`${year} 年度总结`}>
                  <button
                    type="button"
                    aria-label="选择年份"
                    className="block text-[40px] leading-none tracking-tight transition hover:text-[#333333] sm:text-[44px]"
                    onClick={() => {
                      setIsYearPickerOpen((prev) => {
                        if (prev) {
                          return false
                        }
                        setDraftYear(year)
                        setDraftYearInput(String(year))
                        return true
                      })
                    }}
                  >
                    {year}
                  </button>
                  <span className="mt-2 block text-lg font-semibold tracking-[0.02em] text-td-muted sm:text-xl">年度总结</span>
                </h1>

                {isYearPickerOpen ? (
                  <div className="absolute left-0 top-[calc(100%+10px)] z-30">
                    <div className="w-[244px] rounded-[10px] border border-td-line bg-[#f8f8f8] p-3 shadow-thin td-fade-in">
                      <div className="mb-2.5 flex items-center gap-2">
                        <div className="inline-flex h-9 items-center overflow-hidden rounded-[8px] border border-[#d6d6d6] bg-white">
                          <button
                            type="button"
                            aria-label="年份减一"
                            disabled={draftYear <= MIN_YEAR}
                            className="h-full w-8 text-sm text-td-muted transition hover:bg-[#f5f5f5] hover:text-td-text disabled:cursor-not-allowed disabled:text-[#c5c5c5] disabled:hover:bg-white"
                            onClick={() => applyDraftYear(draftYear - 1)}
                          >
                            &#8249;
                          </button>
                          <input
                            id="summary-year"
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            aria-label="跳转年份"
                            value={draftYearInput}
                            onChange={(event) => {
                              const sanitized = event.target.value.replace(/\D+/g, '').slice(0, 4)
                              setDraftYearInput(sanitized)
                              const parsed = parseValidYearInput(sanitized)
                              if (parsed !== null) {
                                applyDraftYear(parsed)
                              }
                            }}
                            onBlur={() => {
                              const parsed = parseValidYearInput(draftYearInput)
                              if (parsed === null) {
                                setDraftYearInput(String(draftYear))
                                return
                              }
                              applyDraftYear(parsed)
                            }}
                            className="h-full w-[80px] border-x border-[#e1e1e1] bg-white px-1.5 text-center text-[15px] text-td-text outline-none"
                          />
                          <button
                            type="button"
                            aria-label="年份加一"
                            disabled={draftYear >= MAX_YEAR}
                            className="h-full w-8 text-sm text-td-muted transition hover:bg-[#f5f5f5] hover:text-td-text disabled:cursor-not-allowed disabled:text-[#c5c5c5] disabled:hover:bg-white"
                            onClick={() => applyDraftYear(draftYear + 1)}
                          >
                            &#8250;
                          </button>
                        </div>
                        <button
                          type="button"
                          aria-label="回到今年"
                          className="ml-auto inline-flex h-9 items-center rounded-[8px] border border-[#d2d2d2] bg-white px-2.5 text-xs text-td-muted transition hover:border-[#bcbcbc] hover:bg-[#fafafa] hover:text-td-text"
                          onClick={handleResetYearPicker}
                        >
                          今年
                        </button>
                      </div>

                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          className="rounded-[8px] border border-[#d2d2d2] bg-white px-2.5 py-1 text-xs text-td-muted transition hover:border-[#bcbcbc] hover:text-td-text"
                          onClick={() => setIsYearPickerOpen(false)}
                        >
                          取消
                        </button>
                        <button
                          type="button"
                          className="rounded-[8px] border border-[#1f1f1f] bg-[#1f1f1f] px-2.5 py-1 text-xs text-white transition hover:border-black hover:bg-black"
                          onClick={handleConfirmYearPicker}
                        >
                          确定
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </section>

            <section className="td-card-muted td-panel" data-testid="yearly-sidebar-stats">
              <YearlyQuickStats stats={sidebarStats} isLoading={isSidebarStatsLoading} />
            </section>

            <section className="td-card-muted td-panel lg:min-h-0 lg:flex-1" data-testid="yearly-sidebar-toc">
              <YearlyToc items={tocItems} activeId={activeTocId} onSelect={handleSelectTocItem} />
            </section>
          </aside>

          <section className="space-y-3 lg:flex lg:min-h-0 lg:flex-col">
            <SyncControlBar
              statusHint={<StatusHint isLoading={summary.isLoading} isSaving={summary.isSaving} error={summary.error} />}
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
                void pullAllNow()
              }}
              onPullCurrent={() => {
                void pullNow()
              }}
              onPush={() => {
                void saveNow()
              }}
            />

            <article
              ref={yearlyEditorPanelRef}
              className="td-card-primary td-panel flex flex-col lg:min-h-0 lg:flex-1"
              data-testid="yearly-panel"
            >
              <div className="min-h-0 flex-1" data-testid="yearly-editor-slot">
                {!summary.isLoading ? (
                  <MarkdownEditor
                    key={`${summary.entryId}:${summary.loadRevision}`}
                    docKey={`${summary.entryId}:${summary.isLoading ? 'loading' : 'ready'}:${summary.loadRevision}`}
                    initialValue={summary.content}
                    onChange={handleEditorChange}
                    placeholder="写下本年度总结"
                    modeTogglePlacement="bottom"
                    modeToggleClassName="mt-3"
                    viewportHeight={YEARLY_EDITOR_BODY_HEIGHT_DESKTOP}
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
        onClose={() => undefined}
      />

      <PullResultDialog
        open={Boolean(pullExecutionResult)}
        result={pullExecutionResult}
        onClose={() => setPullExecutionResult(null)}
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
