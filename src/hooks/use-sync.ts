import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createUploadMetadataExecutor,
  type UploadMetadataFn,
  type UploadMetadataPayload,
} from '../services/sync'

const DEFAULT_DEBOUNCE_MS = 30_000

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error'

export interface UseSyncOptions<TMetadata = unknown> {
  debounceMs?: number
  uploadMetadata?: UploadMetadataFn<TMetadata>
  now?: () => string
}

export interface UseSyncResult<TMetadata = unknown> {
  status: SyncStatus
  lastSyncedAt: string | null
  errorMessage: string | null
  isOffline: boolean
  hasPendingRetry: boolean
  onInputChange: (metadata: TMetadata) => void
  saveNow: (metadata: TMetadata) => Promise<void>
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

export function useSync<TMetadata = unknown>(options: UseSyncOptions<TMetadata> = {}): UseSyncResult<TMetadata> {
  const [status, setStatus] = useState<SyncStatus>('idle')
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isOffline, setIsOffline] = useState(() => getIsOffline())
  const [hasPendingRetry, setHasPendingRetry] = useState(false)

  const now = options.now ?? nowIsoString
  const debounceMs = Math.max(0, options.debounceMs ?? DEFAULT_DEBOUNCE_MS)
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

  const markPendingRetry = useCallback((payload: UploadMetadataPayload<TMetadata>) => {
    pendingRetryPayloadRef.current = payload
    if (mountedRef.current) {
      setHasPendingRetry(true)
    }
  }, [])

  const clearPendingRetry = useCallback(() => {
    pendingRetryPayloadRef.current = null
    if (mountedRef.current) {
      setHasPendingRetry(false)
    }
  }, [])

  const runUpload = useCallback(
    async (payload: UploadMetadataPayload<TMetadata>) => {
      if (getIsOffline()) {
        markPendingRetry(payload)
        if (mountedRef.current) {
          setIsOffline(true)
          setStatus('error')
          setErrorMessage('当前处于离线状态，网络恢复后将自动重试')
        }
        return
      }

      const taskId = taskIdRef.current + 1
      taskIdRef.current = taskId
      if (mountedRef.current) {
        setStatus('syncing')
        setErrorMessage(null)
      }

      try {
        const result = await uploadMetadata(payload)
        if (!mountedRef.current || taskIdRef.current !== taskId) {
          return
        }

        setStatus('success')
        setErrorMessage(null)
        setLastSyncedAt(result?.syncedAt ?? now())
      } catch (error) {
        if (!mountedRef.current || taskIdRef.current !== taskId) {
          return
        }

        if (isNetworkOfflineError(error)) {
          markPendingRetry(payload)
          setIsOffline(true)
          setStatus('error')
          setErrorMessage('当前处于离线状态，网络恢复后将自动重试')
          return
        }

        setStatus('error')
        setErrorMessage(toErrorMessage(error))
      }
    },
    [markPendingRetry, now, uploadMetadata],
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
      if (!pendingPayload) {
        return
      }

      clearPendingRetry()
      void runUpload(pendingPayload)
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
      latestMetadataRef.current = metadata
      clearPendingTimer()
      timeoutRef.current = setTimeout(() => {
        const latestMetadata = latestMetadataRef.current
        if (latestMetadata === null) {
          return
        }
        void runUpload({
          metadata: latestMetadata,
          reason: 'debounced',
        })
      }, debounceMs)
    },
    [clearPendingTimer, debounceMs, runUpload],
  )

  const saveNow = useCallback(
    async (metadata: TMetadata) => {
      latestMetadataRef.current = metadata
      clearPendingTimer()
      await runUpload({
        metadata,
        reason: 'manual',
      })
    },
    [clearPendingTimer, runUpload],
  )

  return {
    status,
    lastSyncedAt,
    errorMessage,
    isOffline,
    hasPendingRetry,
    onInputChange,
    saveNow,
  }
}
