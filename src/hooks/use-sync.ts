import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createUploadMetadataExecutor,
  type UploadMetadataFn,
  type UploadMetadataPayload,
} from '../services/sync'

const DEFAULT_DEBOUNCE_MS = 30_000
const DEFAULT_UPLOAD_TIMEOUT_MS = 25_000
const SYNC_TIMEOUT_MESSAGE = '同步超时，请检查网络后重试'

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error'

export interface UseSyncOptions<TMetadata = unknown> {
  debounceMs?: number
  uploadTimeoutMs?: number
  uploadMetadata?: UploadMetadataFn<TMetadata>
  now?: () => string
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
  onInputChange: (metadata: TMetadata) => void
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

export function useSync<TMetadata = unknown>(options: UseSyncOptions<TMetadata> = {}): UseSyncResult<TMetadata> {
  const [status, setStatus] = useState<SyncStatus>('idle')
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isOffline, setIsOffline] = useState(() => getIsOffline())
  const [hasPendingRetry, setHasPendingRetry] = useState(false)
  const [hasUnsyncedChanges, setHasUnsyncedChanges] = useState(false)
  const [conflictState, setConflictState] = useState<{
    local: TMetadata
    remote: TMetadata | null
  } | null>(null)

  const now = options.now ?? nowIsoString
  const debounceMs = Math.max(0, options.debounceMs ?? DEFAULT_DEBOUNCE_MS)
  const uploadTimeoutMs = Math.max(1_000, options.uploadTimeoutMs ?? DEFAULT_UPLOAD_TIMEOUT_MS)
  const uploadMetadata = useMemo(
    () =>
      createUploadMetadataExecutor<TMetadata>({
        uploadMetadata: options.uploadMetadata,
      }),
    [options.uploadMetadata],
  )

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestMetadataRef = useRef<TMetadata | null>(null)
  const pendingRetryPayloadRef = useRef<UploadMetadataPayload<TMetadata> | null>(null)
  const pendingRetryPayloadVersionRef = useRef(0)
  const queuedUploadPayloadRef = useRef<UploadMetadataPayload<TMetadata> | null>(null)
  const queuedUploadPayloadVersionRef = useRef(0)
  const payloadVersionRef = useRef(0)
  const inFlightRef = useRef(false)
  const resolvingConflictRef = useRef(false)
  const mountedRef = useRef(true)
  const taskIdRef = useRef(0)

  const clearPendingTimer = useCallback(() => {
    if (!timeoutRef.current) {
      return
    }
    clearTimeout(timeoutRef.current)
    timeoutRef.current = null
  }, [])

  useEffect(() => {
    return () => {
      mountedRef.current = false
      clearPendingTimer()
    }
  }, [clearPendingTimer])

  const markPendingRetry = useCallback((payload: UploadMetadataPayload<TMetadata>, payloadVersion: number) => {
    pendingRetryPayloadRef.current = payload
    pendingRetryPayloadVersionRef.current = payloadVersion
    if (mountedRef.current) {
      setHasPendingRetry(true)
    }
  }, [])

  const clearPendingRetry = useCallback(() => {
    pendingRetryPayloadRef.current = null
    pendingRetryPayloadVersionRef.current = 0
    if (mountedRef.current) {
      setHasPendingRetry(false)
    }
  }, [])

  const clearQueuedUploadPayload = useCallback(() => {
    queuedUploadPayloadRef.current = null
    queuedUploadPayloadVersionRef.current = 0
  }, [])

  const queueLatestUploadPayload = useCallback((payload: UploadMetadataPayload<TMetadata>, payloadVersion: number) => {
    if (payloadVersion < queuedUploadPayloadVersionRef.current) {
      return
    }
    queuedUploadPayloadRef.current = payload
    queuedUploadPayloadVersionRef.current = payloadVersion
  }, [])

  const nextPayloadVersion = useCallback(() => {
    payloadVersionRef.current += 1
    return payloadVersionRef.current
  }, [])

  const runUpload = useCallback(
    async (payload: UploadMetadataPayload<TMetadata>, payloadVersion = nextPayloadVersion()): Promise<SaveNowResult> => {
      let shouldDrainQueuedPayload = false

      if (inFlightRef.current) {
        if (mountedRef.current) {
          setHasUnsyncedChanges(true)
        }
        if (payload.reason === 'manual') {
          return {
            ok: false,
            code: 'busy',
            errorMessage: '当前正在上传，请稍候重试',
          }
        }

        // 自动上传在进行中时仅保留最新请求，避免并发请求造成竞态覆盖。
        queueLatestUploadPayload(payload, payloadVersion)
        return {
          ok: false,
          code: 'stale',
          errorMessage: '同步请求已更新，当前任务完成后将继续上传最新内容',
        }
      }

      let activePayload = payload
      let activePayloadVersion = payloadVersion
      const queuedPayload = queuedUploadPayloadRef.current
      const queuedPayloadVersion = queuedUploadPayloadVersionRef.current
      if (queuedPayload && queuedPayloadVersion >= activePayloadVersion) {
        activePayload = queuedPayload
        activePayloadVersion = queuedPayloadVersion
        clearQueuedUploadPayload()
      } else if (queuedPayload && queuedPayloadVersion < activePayloadVersion) {
        clearQueuedUploadPayload()
      }

      if (getIsOffline()) {
        const message = '当前处于离线状态，网络恢复后将自动重试'
        queueLatestUploadPayload(activePayload, activePayloadVersion)
        markPendingRetry(activePayload, activePayloadVersion)
        if (mountedRef.current) {
          setHasUnsyncedChanges(true)
          setIsOffline(true)
          setStatus('error')
          setErrorMessage(message)
        }
        return {
          ok: false,
          code: 'offline',
          errorMessage: message,
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
        const effectiveUploadTimeoutMs = activePayload.reason === 'manual' ? uploadTimeoutMs : 0
        const result = await withTimeout(
          uploadMetadata(activePayload),
          effectiveUploadTimeoutMs,
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
            setHasUnsyncedChanges(true)
            setStatus('error')
            setConflictState({
              local: result.conflictPayload?.local ?? activePayload.metadata,
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
            const message = '网络异常，已保留本次修改并将在恢复后自动重试'
            queueLatestUploadPayload(activePayload, activePayloadVersion)
            markPendingRetry(activePayload, activePayloadVersion)
            setHasUnsyncedChanges(true)
            setStatus('error')
            setErrorMessage(message)
            resolvingConflictRef.current = false
            return {
              ok: false,
              code: 'network',
              errorMessage: message,
            }
          }

          if (result.reason === 'auth') {
            const message = '鉴权失败，请重新解锁或更新 Token 配置'
            queueLatestUploadPayload(activePayload, activePayloadVersion)
            setHasUnsyncedChanges(true)
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
          queueLatestUploadPayload(activePayload, activePayloadVersion)
          setHasUnsyncedChanges(true)
          setStatus('error')
          setErrorMessage(message)
          resolvingConflictRef.current = false
          return {
            ok: false,
            code: 'unknown',
            errorMessage: message,
          }
        }

        setStatus('success')
        setErrorMessage(null)
        setConflictState(null)
        resolvingConflictRef.current = false
        clearPendingRetry()
        setLastSyncedAt(result?.syncedAt ?? now())
        setHasUnsyncedChanges(Boolean(queuedUploadPayloadRef.current))
        shouldDrainQueuedPayload = true
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
          const message = '当前处于离线状态，网络恢复后将自动重试'
          queueLatestUploadPayload(activePayload, activePayloadVersion)
          markPendingRetry(activePayload, activePayloadVersion)
          setHasUnsyncedChanges(true)
          setIsOffline(true)
          setStatus('error')
          setErrorMessage(message)
          resolvingConflictRef.current = false
          return {
            ok: false,
            code: 'offline',
            errorMessage: message,
          }
        }

        const message = toErrorMessage(error)
        queueLatestUploadPayload(activePayload, activePayloadVersion)
        setHasUnsyncedChanges(true)
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
        if (!mountedRef.current) {
          clearQueuedUploadPayload()
        } else if (shouldDrainQueuedPayload) {
          const queuedPayload = queuedUploadPayloadRef.current
          const queuedPayloadVersion = queuedUploadPayloadVersionRef.current
          if (queuedPayload) {
            clearQueuedUploadPayload()
            // 仅在当前上传成功后继续消化队列，避免失败/超时时被排队任务持续重入。
            void runUpload(queuedPayload, queuedPayloadVersion)
          }
        }
      }
    },
    [
      clearPendingRetry,
      clearQueuedUploadPayload,
      markPendingRetry,
      nextPayloadVersion,
      now,
      queueLatestUploadPayload,
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
      const pendingPayload = pendingRetryPayloadRef.current
      const pendingPayloadVersion = pendingRetryPayloadVersionRef.current
      const queuedPayload = queuedUploadPayloadRef.current
      const queuedPayloadVersion = queuedUploadPayloadVersionRef.current
      if (!pendingPayload && !queuedPayload) {
        return
      }

      if (pendingPayload) {
        clearPendingRetry()
      }

      if (queuedPayload && queuedPayloadVersion >= pendingPayloadVersion) {
        void runUpload(queuedPayload, queuedPayloadVersion)
        return
      }

      if (pendingPayload) {
        void runUpload(pendingPayload, pendingPayloadVersion)
      }
    }

    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)

    return () => {
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
    }
  }, [clearPendingRetry, runUpload])

  const onInputChange = useCallback(
    (metadata: TMetadata) => {
      if (resolvingConflictRef.current) {
        return
      }
      latestMetadataRef.current = metadata
      setHasUnsyncedChanges(true)
      clearPendingTimer()
      timeoutRef.current = setTimeout(() => {
        const latestMetadata = latestMetadataRef.current
        if (latestMetadata === null) {
          return
        }
        const payloadVersion = nextPayloadVersion()
        void runUpload(
          {
            metadata: latestMetadata,
            reason: 'debounced',
          },
          payloadVersion,
        )
      }, debounceMs)
    },
    [clearPendingTimer, debounceMs, nextPayloadVersion, runUpload],
  )

  const saveNow = useCallback(
    async (metadata: TMetadata) => {
      latestMetadataRef.current = metadata
      setHasUnsyncedChanges(true)
      clearPendingTimer()
      const payloadVersion = nextPayloadVersion()
      return runUpload(
        {
          metadata,
          reason: 'manual',
        },
        payloadVersion,
      )
    },
    [clearPendingTimer, nextPayloadVersion, runUpload],
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
      clearPendingTimer()
      clearQueuedUploadPayload()
      setConflictState(null)
      await saveNow(resolvedMetadata)
    },
    [clearPendingTimer, clearQueuedUploadPayload, conflictState, saveNow],
  )

  return {
    status,
    lastSyncedAt,
    errorMessage,
    isOffline,
    hasPendingRetry,
    hasUnsyncedChanges,
    conflictState,
    onInputChange,
    saveNow,
    resolveConflict,
    dismissConflict,
  }
}
