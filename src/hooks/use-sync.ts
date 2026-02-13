import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createUploadMetadataExecutor,
  type UploadMetadataFn,
  type UploadMetadataPayload,
} from '../services/sync'

const DEFAULT_UPLOAD_TIMEOUT_MS = 25_000
const SYNC_TIMEOUT_MESSAGE = '同步超时，请检查网络后重试'
const OFFLINE_MANUAL_RETRY_MESSAGE = '当前处于离线状态，请恢复网络后再次手动上传'
const NETWORK_MANUAL_RETRY_MESSAGE = '网络异常，请检查后再次手动上传'

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error'

export interface UseSyncOptions<TMetadata = unknown> {
  uploadTimeoutMs?: number
  uploadMetadata?: UploadMetadataFn<TMetadata>
  isMetadataEqual?: (prev: TMetadata, next: TMetadata) => boolean
  getEntryId?: (metadata: TMetadata) => string
  getFingerprint?: (metadata: TMetadata) => string
  loadBaseline?: (entryId: string) => Promise<SyncBaselineRecord | null>
  saveBaseline?: (baseline: SyncBaselineRecord) => Promise<void>
  now?: () => string
}

export interface SyncBaselineRecord {
  entryId: string
  fingerprint: string
  syncedAt: string
  remoteSha?: string
}

export interface UseSyncResult<TMetadata = unknown> {
  status: SyncStatus
  lastSyncedAt: string | null
  errorMessage: string | null
  isOffline: boolean
  hasPendingRetry: boolean
  hasUnsyncedChanges: boolean
  conflictState: {
    local: TMetadata
    remote: TMetadata | null
  } | null
  setActiveMetadata: (metadata: TMetadata) => void
  onInputChange: (metadata: TMetadata) => void
  markSynced: (
    metadata: TMetadata,
    options?: {
      syncedAt?: string
      remoteSha?: string
    },
  ) => Promise<void>
  saveNow: (metadata: TMetadata) => Promise<SaveNowResult>
  resolveConflict: (
    choice: 'local' | 'remote' | 'merged',
    mergedMetadata?: TMetadata,
  ) => Promise<void>
  dismissConflict: () => void
}

export type SaveNowErrorCode = 'busy' | 'offline' | 'network' | 'auth' | 'conflict' | 'unknown' | 'stale'

export type SaveNowResult =
  | {
      ok: true
      errorMessage: null
    }
  | {
      ok: false
      code: SaveNowErrorCode
      errorMessage: string
    }

function nowIsoString(): string {
  return new Date().toISOString()
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }
  return '同步失败，请稍后重试'
}

function defaultIsMetadataEqual<TMetadata>(prev: TMetadata, next: TMetadata): boolean {
  if (Object.is(prev, next)) {
    return true
  }

  try {
    return JSON.stringify(prev) === JSON.stringify(next)
  } catch {
    return false
  }
}

function defaultGetEntryId<TMetadata>(metadata: TMetadata): string {
  try {
    const serialized = JSON.stringify(metadata)
    return serialized ? `default:${serialized}` : 'default:empty'
  } catch {
    return 'default:fallback'
  }
}

function defaultGetFingerprint<TMetadata>(metadata: TMetadata): string {
  try {
    return JSON.stringify(metadata)
  } catch {
    return String(metadata)
  }
}

function getIsOffline(): boolean {
  if (typeof window === 'undefined' || typeof window.navigator === 'undefined') {
    return false
  }
  return window.navigator.onLine === false
}

function isNetworkOfflineError(error: unknown): boolean {
  if (getIsOffline()) {
    return true
  }

  if (!(error instanceof Error)) {
    return false
  }

  const errorMessage = error.message.toLowerCase()
  return (
    errorMessage.includes('failed to fetch') ||
    errorMessage.includes('networkerror') ||
    errorMessage.includes('network request failed')
  )
}

function withTimeout<T>(task: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  if (timeoutMs <= 0) {
    return task
  }

  return new Promise<T>((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) {
        return
      }
      settled = true
      reject(new Error(timeoutMessage))
    }, timeoutMs)

    task.then(
      (value) => {
        if (settled) {
          return
        }
        settled = true
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        if (settled) {
          return
        }
        settled = true
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

interface MetadataKeyState {
  entryId: string
  fingerprint: string
}

export function useSync<TMetadata = unknown>(options: UseSyncOptions<TMetadata> = {}): UseSyncResult<TMetadata> {
  const [status, setStatus] = useState<SyncStatus>('idle')
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isOffline, setIsOffline] = useState(() => getIsOffline())
  const [hasPendingRetry] = useState(false)
  const [hasUnsyncedChanges, setHasUnsyncedChanges] = useState(false)
  const [conflictState, setConflictState] = useState<{
    local: TMetadata
    remote: TMetadata | null
  } | null>(null)

  const now = options.now ?? nowIsoString
  const uploadTimeoutMs = Math.max(1_000, options.uploadTimeoutMs ?? DEFAULT_UPLOAD_TIMEOUT_MS)
  const isMetadataEqual = options.isMetadataEqual ?? defaultIsMetadataEqual<TMetadata>
  const getEntryId = options.getEntryId ?? defaultGetEntryId<TMetadata>
  const getFingerprint = options.getFingerprint ?? defaultGetFingerprint<TMetadata>
  const loadBaseline = options.loadBaseline
  const saveBaseline = options.saveBaseline
  const uploadMetadata = useMemo(
    () =>
      createUploadMetadataExecutor<TMetadata>({
        uploadMetadata: options.uploadMetadata,
      }),
    [options.uploadMetadata],
  )

  const latestMetadataRef = useRef<TMetadata | null>(null)
  const inFlightRef = useRef(false)
  const resolvingConflictRef = useRef(false)
  const mountedRef = useRef(true)
  const taskIdRef = useRef(0)
  const activeEntryIdRef = useRef<string | null>(null)
  const activeFingerprintRef = useRef<string | null>(null)
  const baselineByEntryRef = useRef<Map<string, SyncBaselineRecord>>(new Map())
  const preferredExpectedShaByEntryRef = useRef<Map<string, string>>(new Map())
  const loadedBaselineEntriesRef = useRef<Set<string>>(new Set())
  const dirtyByEntryRef = useRef<Map<string, boolean>>(new Map())

  useEffect(() => {
    return () => {
      mountedRef.current = false
    }
  }, [])

  const toMetadataKeyState = useCallback(
    (metadata: TMetadata): MetadataKeyState => ({
      entryId: getEntryId(metadata).trim() || 'default:fallback',
      fingerprint: getFingerprint(metadata),
    }),
    [getEntryId, getFingerprint],
  )

  const setEntryDirtyState = useCallback((entryId: string, dirty: boolean) => {
    dirtyByEntryRef.current.set(entryId, dirty)
    if (mountedRef.current && activeEntryIdRef.current === entryId) {
      setHasUnsyncedChanges(dirty)
    }
  }, [])

  const resolveDirtyState = useCallback(
    (
      keyState: MetadataKeyState,
      options: {
        fallbackWhenBaselineMissing: boolean
      },
    ): boolean => {
      const baseline = baselineByEntryRef.current.get(keyState.entryId)
      if (!baseline) {
        return options.fallbackWhenBaselineMissing
      }
      return baseline.fingerprint !== keyState.fingerprint
    },
    [],
  )

  const ensureBaselineLoaded = useCallback(
    async (entryId: string): Promise<SyncBaselineRecord | null> => {
      if (!loadBaseline) {
        return baselineByEntryRef.current.get(entryId) ?? null
      }
      if (loadedBaselineEntriesRef.current.has(entryId)) {
        return baselineByEntryRef.current.get(entryId) ?? null
      }

      loadedBaselineEntriesRef.current.add(entryId)
      try {
        const baseline = await loadBaseline(entryId)
        const existing = baselineByEntryRef.current.get(entryId)
        if (baseline && !existing) {
          baselineByEntryRef.current.set(entryId, baseline)
          return baseline
        }
      } catch {
        // baseline 读取失败时保持内存态，避免影响主流程。
      }
      return baselineByEntryRef.current.get(entryId) ?? null
    },
    [loadBaseline],
  )

  const refreshActiveEntryDirtyState = useCallback(() => {
    const activeEntryId = activeEntryIdRef.current
    const activeFingerprint = activeFingerprintRef.current
    if (!activeEntryId || activeFingerprint === null) {
      return
    }

    const dirty = resolveDirtyState(
      {
        entryId: activeEntryId,
        fingerprint: activeFingerprint,
      },
      {
        fallbackWhenBaselineMissing: dirtyByEntryRef.current.get(activeEntryId) ?? false,
      },
    )
    setEntryDirtyState(activeEntryId, dirty)
  }, [resolveDirtyState, setEntryDirtyState])

  const markSynced = useCallback(
    async (
      metadata: TMetadata,
      options?: {
        syncedAt?: string
        remoteSha?: string
      },
    ) => {
      const keyState = toMetadataKeyState(metadata)
      latestMetadataRef.current = metadata
      activeEntryIdRef.current = keyState.entryId
      activeFingerprintRef.current = keyState.fingerprint

      const syncedAt = options?.syncedAt ?? now()
      const nextBaseline: SyncBaselineRecord = {
        entryId: keyState.entryId,
        fingerprint: keyState.fingerprint,
        syncedAt,
        remoteSha: options?.remoteSha?.trim() || undefined,
      }
      baselineByEntryRef.current.set(keyState.entryId, nextBaseline)
      loadedBaselineEntriesRef.current.add(keyState.entryId)
      preferredExpectedShaByEntryRef.current.delete(keyState.entryId)

      if (saveBaseline) {
        try {
          await saveBaseline(nextBaseline)
        } catch {
          // baseline 持久化失败不应阻断主流程。
        }
      }

      if (!mountedRef.current) {
        return
      }
      setEntryDirtyState(keyState.entryId, false)
      setStatus('success')
      setErrorMessage(null)
      setConflictState(null)
      setLastSyncedAt(syncedAt)
    },
    [now, saveBaseline, setEntryDirtyState, toMetadataKeyState],
  )

  const runUpload = useCallback(
    async (payload: UploadMetadataPayload<TMetadata>): Promise<SaveNowResult> => {
      if (inFlightRef.current) {
        return {
          ok: false,
          code: 'busy',
          errorMessage: '当前正在上传，请稍候重试',
        }
      }

      const keyState = toMetadataKeyState(payload.metadata)
      if (getIsOffline()) {
        setEntryDirtyState(
          keyState.entryId,
          resolveDirtyState(keyState, {
            fallbackWhenBaselineMissing: dirtyByEntryRef.current.get(keyState.entryId) ?? true,
          }),
        )
        if (mountedRef.current) {
          setIsOffline(true)
          setStatus('error')
          setErrorMessage(OFFLINE_MANUAL_RETRY_MESSAGE)
        }
        return {
          ok: false,
          code: 'offline',
          errorMessage: OFFLINE_MANUAL_RETRY_MESSAGE,
        }
      }

      const taskId = taskIdRef.current + 1
      taskIdRef.current = taskId
      inFlightRef.current = true
      if (mountedRef.current) {
        setStatus('syncing')
        setErrorMessage(null)
      }

      try {
        if (loadBaseline && !loadedBaselineEntriesRef.current.has(keyState.entryId)) {
          await ensureBaselineLoaded(keyState.entryId)
        }
        const baseline = baselineByEntryRef.current.get(keyState.entryId)
        const expectedSha =
          preferredExpectedShaByEntryRef.current.get(keyState.entryId) ?? baseline?.remoteSha
        const uploadPayload = expectedSha
          ? {
              ...payload,
              expectedSha,
            }
          : payload
        const result = await withTimeout(
          uploadMetadata(uploadPayload),
          uploadTimeoutMs,
          SYNC_TIMEOUT_MESSAGE,
        )
        if (!mountedRef.current || taskIdRef.current !== taskId) {
          return {
            ok: false,
            code: 'stale',
            errorMessage: '同步请求已更新，本次上传结果已忽略',
          }
        }

        if (result?.ok === false || result?.conflict) {
          if (result.conflict) {
            const message = resolvingConflictRef.current
              ? '冲突仍未解决，请刷新远端版本后重新决策'
              : '检测到同步冲突，请选择保留本地、远端或合并版本'
            if (result.remoteSha?.trim()) {
              preferredExpectedShaByEntryRef.current.set(keyState.entryId, result.remoteSha.trim())
            }
            setEntryDirtyState(keyState.entryId, true)
            setStatus('error')
            setConflictState({
              local: result.conflictPayload?.local ?? payload.metadata,
              remote: result.conflictPayload?.remote ?? null,
            })
            setErrorMessage(message)
            resolvingConflictRef.current = false
            return {
              ok: false,
              code: 'conflict',
              errorMessage: message,
            }
          }

          if (result.reason === 'network') {
            setEntryDirtyState(
              keyState.entryId,
              resolveDirtyState(keyState, {
                fallbackWhenBaselineMissing: dirtyByEntryRef.current.get(keyState.entryId) ?? true,
              }),
            )
            setStatus('error')
            setErrorMessage(NETWORK_MANUAL_RETRY_MESSAGE)
            resolvingConflictRef.current = false
            return {
              ok: false,
              code: 'network',
              errorMessage: NETWORK_MANUAL_RETRY_MESSAGE,
            }
          }

          if (result.reason === 'auth') {
            const message = '鉴权失败，请重新解锁或更新 Token 配置'
            setEntryDirtyState(
              keyState.entryId,
              resolveDirtyState(keyState, {
                fallbackWhenBaselineMissing: dirtyByEntryRef.current.get(keyState.entryId) ?? true,
              }),
            )
            setStatus('error')
            setErrorMessage(message)
            resolvingConflictRef.current = false
            return {
              ok: false,
              code: 'auth',
              errorMessage: message,
            }
          }

          const message = '同步失败，请稍后重试'
          setEntryDirtyState(
            keyState.entryId,
            resolveDirtyState(keyState, {
              fallbackWhenBaselineMissing: dirtyByEntryRef.current.get(keyState.entryId) ?? true,
            }),
          )
          setStatus('error')
          setErrorMessage(message)
          resolvingConflictRef.current = false
          return {
            ok: false,
            code: 'unknown',
            errorMessage: message,
          }
        }

        resolvingConflictRef.current = false
        await markSynced(payload.metadata, {
          syncedAt: result?.syncedAt ?? now(),
          remoteSha: result?.remoteSha,
        })
        refreshActiveEntryDirtyState()
        return {
          ok: true,
          errorMessage: null,
        }
      } catch (error) {
        if (!mountedRef.current || taskIdRef.current !== taskId) {
          return {
            ok: false,
            code: 'stale',
            errorMessage: '同步请求已更新，本次上传结果已忽略',
          }
        }

        if (isNetworkOfflineError(error)) {
          const offline = getIsOffline()
          const message = offline ? OFFLINE_MANUAL_RETRY_MESSAGE : NETWORK_MANUAL_RETRY_MESSAGE
          setEntryDirtyState(
            keyState.entryId,
            resolveDirtyState(keyState, {
              fallbackWhenBaselineMissing: dirtyByEntryRef.current.get(keyState.entryId) ?? true,
            }),
          )
          setIsOffline(offline)
          setStatus('error')
          setErrorMessage(message)
          resolvingConflictRef.current = false
          return {
            ok: false,
            code: offline ? 'offline' : 'network',
            errorMessage: message,
          }
        }

        const message = toErrorMessage(error)
        setEntryDirtyState(
          keyState.entryId,
          resolveDirtyState(keyState, {
            fallbackWhenBaselineMissing: dirtyByEntryRef.current.get(keyState.entryId) ?? true,
          }),
        )
        setStatus('error')
        setErrorMessage(message)
        resolvingConflictRef.current = false
        return {
          ok: false,
          code: 'unknown',
          errorMessage: message,
        }
      } finally {
        inFlightRef.current = false
      }
    },
    [
      ensureBaselineLoaded,
      loadBaseline,
      markSynced,
      now,
      refreshActiveEntryDirtyState,
      resolveDirtyState,
      setEntryDirtyState,
      toMetadataKeyState,
      uploadMetadata,
      uploadTimeoutMs,
    ],
  )

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const handleOffline = () => {
      setIsOffline(true)
    }

    const handleOnline = () => {
      setIsOffline(false)
    }

    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)

    return () => {
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
    }
  }, [])

  const setActiveMetadata = useCallback(
    (metadata: TMetadata) => {
      latestMetadataRef.current = metadata
      const previousEntryId = activeEntryIdRef.current
      const keyState = toMetadataKeyState(metadata)
      activeEntryIdRef.current = keyState.entryId
      activeFingerprintRef.current = keyState.fingerprint
      if (mountedRef.current && previousEntryId !== keyState.entryId) {
        // 切换条目时先清空展示时间，避免沿用上一个条目的最近同步时间。
        setLastSyncedAt(null)
      }

      setEntryDirtyState(
        keyState.entryId,
        resolveDirtyState(keyState, {
          fallbackWhenBaselineMissing: dirtyByEntryRef.current.get(keyState.entryId) ?? false,
        }),
      )

      void ensureBaselineLoaded(keyState.entryId).then(() => {
        if (!mountedRef.current) {
          return
        }
        if (
          activeEntryIdRef.current !== keyState.entryId ||
          activeFingerprintRef.current !== keyState.fingerprint
        ) {
          return
        }
        const baseline = baselineByEntryRef.current.get(keyState.entryId)
        setLastSyncedAt(baseline?.syncedAt ?? null)
        refreshActiveEntryDirtyState()
      })
    },
    [
      ensureBaselineLoaded,
      refreshActiveEntryDirtyState,
      resolveDirtyState,
      setEntryDirtyState,
      toMetadataKeyState,
    ],
  )

  const onInputChange = useCallback(
    (metadata: TMetadata) => {
      if (resolvingConflictRef.current) {
        return
      }
      const latestMetadata = latestMetadataRef.current
      if (latestMetadata !== null && isMetadataEqual(latestMetadata, metadata)) {
        return
      }
      const keyState = toMetadataKeyState(metadata)
      latestMetadataRef.current = metadata
      activeEntryIdRef.current = keyState.entryId
      activeFingerprintRef.current = keyState.fingerprint
      setEntryDirtyState(
        keyState.entryId,
        resolveDirtyState(keyState, {
          fallbackWhenBaselineMissing: true,
        }),
      )
      if (mountedRef.current) {
        setStatus('idle')
        setErrorMessage(null)
      }
      void ensureBaselineLoaded(keyState.entryId).then(() => {
        if (!mountedRef.current) {
          return
        }
        if (
          activeEntryIdRef.current !== keyState.entryId ||
          activeFingerprintRef.current !== keyState.fingerprint
        ) {
          return
        }
        refreshActiveEntryDirtyState()
      })
    },
    [
      ensureBaselineLoaded,
      isMetadataEqual,
      refreshActiveEntryDirtyState,
      resolveDirtyState,
      setEntryDirtyState,
      toMetadataKeyState,
    ],
  )

  const saveNow = useCallback(
    async (metadata: TMetadata) => {
      const keyState = toMetadataKeyState(metadata)
      latestMetadataRef.current = metadata
      activeEntryIdRef.current = keyState.entryId
      activeFingerprintRef.current = keyState.fingerprint
      setEntryDirtyState(
        keyState.entryId,
        resolveDirtyState(keyState, {
          fallbackWhenBaselineMissing: dirtyByEntryRef.current.get(keyState.entryId) ?? false,
        }),
      )
      void ensureBaselineLoaded(keyState.entryId).then(() => {
        if (!mountedRef.current) {
          return
        }
        if (
          activeEntryIdRef.current !== keyState.entryId ||
          activeFingerprintRef.current !== keyState.fingerprint
        ) {
          return
        }
        refreshActiveEntryDirtyState()
      })
      return runUpload({
        metadata,
        reason: 'manual',
      })
    },
    [
      ensureBaselineLoaded,
      refreshActiveEntryDirtyState,
      resolveDirtyState,
      runUpload,
      setEntryDirtyState,
      toMetadataKeyState,
    ],
  )

  const dismissConflict = useCallback(() => {
    setConflictState(null)
  }, [])

  const resolveConflict = useCallback(
    async (choice: 'local' | 'remote' | 'merged', mergedMetadata?: TMetadata) => {
      if (!conflictState) {
        return
      }

      let resolvedMetadata: TMetadata | null = null
      if (choice === 'local') {
        resolvedMetadata = conflictState.local
      } else if (choice === 'remote') {
        resolvedMetadata = conflictState.remote
      } else if (choice === 'merged') {
        resolvedMetadata = mergedMetadata ?? null
      }

      if (!resolvedMetadata) {
        setErrorMessage('无法获取冲突版本，请刷新后重试')
        return
      }

      resolvingConflictRef.current = true
      setConflictState(null)
      await saveNow(resolvedMetadata)
    },
    [conflictState, saveNow],
  )

  return {
    status,
    lastSyncedAt,
    errorMessage,
    isOffline,
    hasPendingRetry,
    hasUnsyncedChanges,
    conflictState,
    setActiveMetadata,
    onInputChange,
    markSynced,
    saveNow,
    resolveConflict,
    dismissConflict,
  }
}
