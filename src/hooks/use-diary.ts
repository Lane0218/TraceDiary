import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getDiary, saveDiary, type DiaryRecord } from '../services/indexeddb'
import type { DateString, DiaryEntry, EntryId } from '../types/diary'
import { REMOTE_PULL_COMPLETED_EVENT } from '../utils/remote-sync-events'

export type DiaryTarget =
  | {
      type: 'daily'
      date: DateString
    }
  | {
      type: 'yearly_summary'
      year: number
    }

export interface DiaryDependencies {
  getDiary: typeof getDiary
  saveDiary: typeof saveDiary
  now: () => string
}

export interface UseDiaryOptions {
  externalReloadSignal?: number
}

export interface UseDiaryResult {
  entryId: EntryId
  content: string
  entry: DiaryEntry | null
  loadRevision: number
  isLoading: boolean
  isSaving: boolean
  error: string | null
  setContent: (nextContent: string) => void
  waitForPersisted: () => Promise<DiaryEntry | null>
}

const defaultDependencies: DiaryDependencies = {
  getDiary,
  saveDiary,
  now: () => new Date().toISOString(),
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }
  return '未知错误'
}

function countWords(content: string): number {
  const normalized = content.trim()
  if (!normalized) {
    return 0
  }
  return normalized.split(/\s+/u).length
}

function buildEntryFromContent(
  target: DiaryTarget,
  content: string,
  existingEntry: DiaryEntry | null,
  nowIso: string,
): DiaryEntry {
  const wordCount = countWords(content)
  const createdAt = existingEntry?.createdAt ?? nowIso

  if (target.type === 'daily') {
    return {
      type: 'daily',
      id: `daily:${target.date}`,
      date: target.date,
      filename: `${target.date}.md.enc`,
      content,
      wordCount,
      createdAt,
      modifiedAt: nowIso,
    }
  }

  const yearDate = `${target.year}-12-31` as DateString
  return {
    type: 'yearly_summary',
    id: `summary:${target.year}`,
    year: target.year,
    date: yearDate,
    filename: `${target.year}-summary.md.enc`,
    content,
    wordCount,
    createdAt,
    modifiedAt: nowIso,
  }
}

function normalizeDiaryRecord(target: DiaryTarget, diary: DiaryRecord): DiaryEntry {
  const content = typeof diary.content === 'string' ? diary.content : ''
  const defaultEntry = buildEntryFromContent(target, content, null, new Date().toISOString())

  if (target.type === 'daily') {
    return {
      ...defaultEntry,
      type: 'daily',
      id: `daily:${target.date}`,
      date: target.date,
      filename:
        typeof diary.filename === 'string'
          ? (`${diary.filename}` as `${string}.md.enc`)
          : `${target.date}.md.enc`,
      createdAt: typeof diary.createdAt === 'string' ? diary.createdAt : defaultEntry.createdAt,
      modifiedAt:
        typeof diary.modifiedAt === 'string' ? diary.modifiedAt : defaultEntry.modifiedAt,
      content,
      wordCount: typeof diary.wordCount === 'number' ? diary.wordCount : countWords(content),
    }
  }

  return {
    ...defaultEntry,
    type: 'yearly_summary',
    id: `summary:${target.year}`,
    year: target.year,
    date:
      typeof diary.date === 'string'
        ? (diary.date as DateString)
        : (`${target.year}-12-31` as DateString),
    filename:
      typeof diary.filename === 'string'
        ? (`${diary.filename}` as `${number}-summary.md.enc`)
        : `${target.year}-summary.md.enc`,
    createdAt: typeof diary.createdAt === 'string' ? diary.createdAt : defaultEntry.createdAt,
    modifiedAt: typeof diary.modifiedAt === 'string' ? diary.modifiedAt : defaultEntry.modifiedAt,
    content,
    wordCount: typeof diary.wordCount === 'number' ? diary.wordCount : countWords(content),
  }
}

function toEntryId(target: DiaryTarget): EntryId {
  if (target.type === 'daily') {
    return `daily:${target.date}`
  }
  return `summary:${target.year}`
}

export function useDiary(
  target: DiaryTarget,
  dependencies: DiaryDependencies = defaultDependencies,
  options?: UseDiaryOptions,
): UseDiaryResult {
  const targetType = target.type
  const targetDate = targetType === 'daily' ? target.date : null
  const targetYear = targetType === 'yearly_summary' ? target.year : null

  const stableTarget = useMemo<DiaryTarget>(() => {
    if (targetType === 'daily' && targetDate) {
      return {
        type: 'daily',
        date: targetDate,
      }
    }

    return {
      type: 'yearly_summary',
      year: targetYear ?? new Date().getFullYear(),
    }
  }, [targetDate, targetType, targetYear])

  const entryId = useMemo(() => toEntryId(stableTarget), [stableTarget])
  const [content, setContentState] = useState('')
  const [entry, setEntry] = useState<DiaryEntry | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadedEntryId, setLoadedEntryId] = useState<string | null>(null)
  const [loadRevision, setLoadRevision] = useState(0)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [remotePullSignal, setRemotePullSignal] = useState(0)
  const externalReloadSignal = options?.externalReloadSignal ?? 0

  const entryRef = useRef<DiaryEntry | null>(null)
  const latestSaveTaskRef = useRef<Promise<void> | null>(null)
  const scopeVersionRef = useRef(0)
  const saveVersionRef = useRef(0)
  const isScopedEntryReady = loadedEntryId === entryId
  const visibleContent = useMemo(() => (isScopedEntryReady ? content : ''), [content, isScopedEntryReady])
  const visibleEntry = useMemo(() => (isScopedEntryReady ? entry : null), [entry, isScopedEntryReady])
  const visibleIsLoading = isLoading || !isScopedEntryReady

  useEffect(() => {
    entryRef.current = entry
  }, [entry])

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
    let isCancelled = false
    const scopeVersion = scopeVersionRef.current + 1
    scopeVersionRef.current = scopeVersion

    void dependencies
      .getDiary(entryId)
      .then((stored) => {
        if (isCancelled || scopeVersion !== scopeVersionRef.current) {
          return
        }

        if (!stored) {
          setEntry(null)
          entryRef.current = null
          latestSaveTaskRef.current = null
          setContentState('')
          setIsSaving(false)
          setError(null)
          setIsLoading(false)
          setLoadedEntryId(entryId)
          setLoadRevision((prev) => prev + 1)
          return
        }

        const normalized = normalizeDiaryRecord(stableTarget, stored)
        setEntry(normalized)
        entryRef.current = normalized
        latestSaveTaskRef.current = null
        setContentState(normalized.content)
        setIsSaving(false)
        setError(null)
        setIsLoading(false)
        setLoadedEntryId(entryId)
        setLoadRevision((prev) => prev + 1)
      })
      .catch((loadError: unknown) => {
        if (isCancelled || scopeVersion !== scopeVersionRef.current) {
          return
        }

        setIsSaving(false)
        setError(`读取失败：${getErrorMessage(loadError)}`)
        latestSaveTaskRef.current = null
        setIsLoading(false)
        setLoadedEntryId(entryId)
        setLoadRevision((prev) => prev + 1)
      })

    return () => {
      isCancelled = true
    }
  }, [dependencies, entryId, externalReloadSignal, remotePullSignal, stableTarget])

  const setContent = useCallback(
    (nextContent: string) => {
      setContentState(nextContent)
      setError(null)

      const scopeVersion = scopeVersionRef.current
      const nextSaveVersion = saveVersionRef.current + 1
      saveVersionRef.current = nextSaveVersion

      setIsSaving(true)
      const nextEntry = buildEntryFromContent(
        stableTarget,
        nextContent,
        entryRef.current,
        dependencies.now(),
      )

      setEntry(nextEntry)
      entryRef.current = nextEntry

      const persistTask = dependencies
        .saveDiary(nextEntry)
        .then(() => {
          if (
            scopeVersion !== scopeVersionRef.current ||
            nextSaveVersion !== saveVersionRef.current
          ) {
            return
          }
          setIsSaving(false)
        })
        .catch((saveError: unknown) => {
          if (
            scopeVersion !== scopeVersionRef.current ||
            nextSaveVersion !== saveVersionRef.current
          ) {
            return
          }

          setIsSaving(false)
          setError(`保存失败：${getErrorMessage(saveError)}`)
        })
      latestSaveTaskRef.current = persistTask.then(
        () => undefined,
        () => undefined,
      )

      void persistTask
    },
    [dependencies, stableTarget],
  )

  const waitForPersisted = useCallback(async (): Promise<DiaryEntry | null> => {
    const latestSaveTask = latestSaveTaskRef.current
    if (latestSaveTask) {
      await latestSaveTask
    }

    // 返回当前编辑态快照，避免 IndexedDB 异步写入时序导致读到旧内容。
    if (entryRef.current) {
      return entryRef.current
    }

    try {
      const stored = await dependencies.getDiary(entryId)
      if (!stored) {
        return null
      }
      return normalizeDiaryRecord(stableTarget, stored)
    } catch {
      return entryRef.current
    }
  }, [dependencies, entryId, stableTarget])

  return {
    entryId,
    content: visibleContent,
    entry: visibleEntry,
    loadRevision,
    isLoading: visibleIsLoading,
    isSaving,
    error,
    setContent,
    waitForPersisted,
  }
}
