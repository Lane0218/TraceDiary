import { act, renderHook } from '@testing-library/react'
import { StrictMode, createElement, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UploadMetadataFn } from '../../services/sync'
import { getSyncLabel } from '../../utils/sync-presentation'
import type { SaveNowResult } from '../use-sync'
import { useSync } from '../use-sync'

interface TestMetadata {
  content: string
}

describe('useSync', () => {
  let navigatorOnline = true
  let onLineGetterSpy: ReturnType<typeof vi.spyOn>

  function setNavigatorOnline(nextOnline: boolean): void {
    navigatorOnline = nextOnline
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    navigatorOnline = true
    onLineGetterSpy = vi.spyOn(window.navigator, 'onLine', 'get').mockImplementation(() => navigatorOnline)
  })

  afterEach(() => {
    onLineGetterSpy.mockRestore()
    vi.useRealTimers()
  })

  it('输入变更仅应更新脏状态，不应自动上传', async () => {
    const uploadMetadata: UploadMetadataFn<TestMetadata> = vi.fn(async () => ({
      syncedAt: '2026-02-08T00:00:00.000Z',
    }))

    const { result } = renderHook(() =>
      useSync<TestMetadata>({
        uploadMetadata,
      }),
    )

    expect(result.current.hasUnsyncedChanges).toBe(false)

    act(() => {
      result.current.onInputChange({ content: 'draft-1' })
      result.current.onInputChange({ content: 'draft-2' })
    })

    expect(result.current.hasUnsyncedChanges).toBe(true)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000)
    })

    expect(uploadMetadata).not.toHaveBeenCalled()
    expect(result.current.status).toBe('idle')
  })

  it('手动保存应立即上传并清空未提交改动', async () => {
    const uploadMetadata: UploadMetadataFn<TestMetadata> = vi.fn(async () => ({
      syncedAt: '2026-02-08T12:00:00.000Z',
    }))

    const { result } = renderHook(() =>
      useSync<TestMetadata>({
        uploadMetadata,
      }),
    )

    act(() => {
      result.current.onInputChange({ content: 'draft' })
    })
    expect(result.current.hasUnsyncedChanges).toBe(true)

    let saveResult: SaveNowResult | null = null
    await act(async () => {
      saveResult = await result.current.saveNow({ content: 'final' })
    })

    expect(uploadMetadata).toHaveBeenCalledTimes(1)
    expect(uploadMetadata).toHaveBeenCalledWith({
      metadata: { content: 'final' },
      reason: 'manual',
    })
    expect(saveResult).toEqual({
      ok: true,
      errorMessage: null,
    })
    expect(result.current.status).toBe('success')
    expect(result.current.errorMessage).toBeNull()
    expect(result.current.lastSyncedAt).toBe('2026-02-08T12:00:00.000Z')
    expect(result.current.hasUnsyncedChanges).toBe(false)
  })

  it('StrictMode 下单次手动保存不应被误判为 stale', async () => {
    const uploadMetadata: UploadMetadataFn<TestMetadata> = vi.fn(async () => ({
      syncedAt: '2026-02-16T00:00:00.000Z',
    }))
    const strictModeWrapper = ({ children }: { children: ReactNode }) =>
      createElement(StrictMode, null, children)

    const { result } = renderHook(
      () =>
        useSync<TestMetadata>({
          uploadMetadata,
        }),
      {
        wrapper: strictModeWrapper,
      },
    )

    let saveResult: SaveNowResult | null = null
    await act(async () => {
      saveResult = await result.current.saveNow({ content: 'strict-mode' })
    })

    expect(uploadMetadata).toHaveBeenCalledTimes(1)
    expect(saveResult).toEqual({
      ok: true,
      errorMessage: null,
    })
    expect(result.current.status).toBe('success')
    expect(result.current.errorMessage).toBeNull()
  })

  it('手动保存在内容未变化时不应把未提交改动从无置为有', async () => {
    const uploadMetadata: UploadMetadataFn<TestMetadata> = vi.fn(async () => ({
      syncedAt: '2026-02-08T11:00:00.000Z',
    }))

    const { result } = renderHook(() =>
      useSync<TestMetadata>({
        uploadMetadata,
      }),
    )

    expect(result.current.hasUnsyncedChanges).toBe(false)

    await act(async () => {
      await result.current.saveNow({ content: 'unchanged' })
    })

    expect(result.current.status).toBe('success')
    expect(result.current.hasUnsyncedChanges).toBe(false)
  })

  it('上传进行中再次手动保存应返回 busy 且不发起并发上传', async () => {
    let resolveFirstUpload!: (value: { syncedAt: string }) => void
    const firstUploadPromise = new Promise<{ syncedAt: string }>((resolve) => {
      resolveFirstUpload = resolve
    })
    const uploadMetadata: UploadMetadataFn<TestMetadata> = vi
      .fn()
      .mockReturnValueOnce(firstUploadPromise)
      .mockResolvedValueOnce({
        syncedAt: '2026-02-08T13:30:00.000Z',
      })

    const { result } = renderHook(() =>
      useSync<TestMetadata>({
        uploadMetadata,
      }),
    )

    let firstSavePromise: Promise<SaveNowResult> | null = null
    act(() => {
      firstSavePromise = result.current.saveNow({ content: 'first' })
    })

    let secondSaveResult: SaveNowResult | null = null
    await act(async () => {
      secondSaveResult = await result.current.saveNow({ content: 'second' })
    })

    expect(uploadMetadata).toHaveBeenCalledTimes(1)
    expect(secondSaveResult).toEqual({
      ok: false,
      code: 'busy',
      errorMessage: '当前正在上传，请稍候重试',
    })

    resolveFirstUpload({ syncedAt: '2026-02-08T13:00:00.000Z' })
    let firstSaveResult: SaveNowResult | null = null
    await act(async () => {
      firstSaveResult = await firstSavePromise!
    })

    expect(firstSaveResult).toEqual({
      ok: true,
      errorMessage: null,
    })
    expect(result.current.status).toBe('success')
    expect(result.current.lastSyncedAt).toBe('2026-02-08T13:00:00.000Z')
  })

  it('上传失败后应保留未提交改动标记', async () => {
    const uploadMetadata: UploadMetadataFn<TestMetadata> = vi.fn(async () => {
      throw new Error('远端不可用')
    })

    const { result } = renderHook(() =>
      useSync<TestMetadata>({
        uploadMetadata,
      }),
    )

    act(() => {
      result.current.onInputChange({ content: 'failed-payload' })
    })
    expect(result.current.hasUnsyncedChanges).toBe(true)

    await act(async () => {
      await result.current.saveNow({ content: 'failed-payload' })
    })

    expect(result.current.status).toBe('error')
    expect(result.current.errorMessage).toBe('远端不可用')
    expect(result.current.hasUnsyncedChanges).toBe(true)
  })

  it('离线时手动保存应返回 offline，并提示恢复网络后再次手动上传', async () => {
    const uploadMetadata: UploadMetadataFn<TestMetadata> = vi.fn(async () => ({
      syncedAt: '2026-02-08T15:00:00.000Z',
    }))

    const { result } = renderHook(() =>
      useSync<TestMetadata>({
        uploadMetadata,
      }),
    )

    setNavigatorOnline(false)
    await act(async () => {
      window.dispatchEvent(new Event('offline'))
    })

    let saveResult: SaveNowResult | null = null
    await act(async () => {
      saveResult = await result.current.saveNow({ content: 'offline-draft' })
    })

    expect(uploadMetadata).not.toHaveBeenCalled()
    expect(result.current.isOffline).toBe(true)
    expect(result.current.hasPendingRetry).toBe(false)
    expect(result.current.errorMessage).toBe('当前处于离线状态，请恢复网络后再次手动上传')
    expect(saveResult).toEqual({
      ok: false,
      code: 'offline',
      errorMessage: '当前处于离线状态，请恢复网络后再次手动上传',
    })
  })

  it('离线恢复在线后不会自动重试，需用户再次手动保存', async () => {
    const uploadMetadata: UploadMetadataFn<TestMetadata> = vi.fn(async () => ({
      syncedAt: '2026-02-08T15:30:00.000Z',
    }))

    const { result } = renderHook(() =>
      useSync<TestMetadata>({
        uploadMetadata,
      }),
    )

    setNavigatorOnline(false)
    await act(async () => {
      window.dispatchEvent(new Event('offline'))
      await result.current.saveNow({ content: 'offline-draft' })
    })
    expect(uploadMetadata).toHaveBeenCalledTimes(0)
    expect(result.current.hasPendingRetry).toBe(false)

    setNavigatorOnline(true)
    await act(async () => {
      window.dispatchEvent(new Event('online'))
      await Promise.resolve()
    })

    expect(result.current.isOffline).toBe(false)
    expect(uploadMetadata).toHaveBeenCalledTimes(0)
    expect(result.current.hasPendingRetry).toBe(false)

    let retryResult: SaveNowResult | null = null
    await act(async () => {
      retryResult = await result.current.saveNow({ content: 'manual-retry' })
    })

    expect(retryResult).toEqual({
      ok: true,
      errorMessage: null,
    })
    expect(uploadMetadata).toHaveBeenCalledTimes(1)
    expect(uploadMetadata).toHaveBeenLastCalledWith({
      metadata: { content: 'manual-retry' },
      reason: 'manual',
    })
    expect(result.current.hasPendingRetry).toBe(false)
  })

  it('网络错误后不会自动重试，恢复后仍需手动重试', async () => {
    const uploadMetadata: UploadMetadataFn<TestMetadata> = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        conflict: false,
        reason: 'network',
      })
      .mockResolvedValueOnce({
        ok: true,
        conflict: false,
        syncedAt: '2026-02-08T16:00:00.000Z',
      })

    const { result } = renderHook(() =>
      useSync<TestMetadata>({
        uploadMetadata,
      }),
    )

    let firstSaveResult: SaveNowResult | null = null
    await act(async () => {
      firstSaveResult = await result.current.saveNow({ content: 'network-failed' })
    })

    expect(firstSaveResult).toEqual({
      ok: false,
      code: 'network',
      errorMessage: '网络异常，请检查后再次手动上传',
    })
    expect(result.current.hasPendingRetry).toBe(false)
    expect(uploadMetadata).toHaveBeenCalledTimes(1)

    setNavigatorOnline(true)
    await act(async () => {
      window.dispatchEvent(new Event('online'))
      await Promise.resolve()
    })

    expect(uploadMetadata).toHaveBeenCalledTimes(1)

    let secondSaveResult: SaveNowResult | null = null
    await act(async () => {
      secondSaveResult = await result.current.saveNow({ content: 'network-retry' })
    })

    expect(secondSaveResult).toEqual({
      ok: true,
      errorMessage: null,
    })
    expect(uploadMetadata).toHaveBeenCalledTimes(2)
    expect(result.current.hasPendingRetry).toBe(false)
  })

  it('上传请求超时后应退出 syncing，且不会自动重试', async () => {
    const uploadMetadata = vi.fn<UploadMetadataFn<TestMetadata>>(
      () =>
        new Promise(() => {
          // 模拟请求悬挂
        }),
    )

    const { result } = renderHook(() =>
      useSync<TestMetadata>({
        uploadMetadata,
        uploadTimeoutMs: 1_000,
      }),
    )

    let firstSavePromise: Promise<SaveNowResult> | null = null
    act(() => {
      firstSavePromise = result.current.saveNow({ content: 'timeout-first' })
    })

    expect(uploadMetadata).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000)
    })

    let firstSaveResult: SaveNowResult | null = null
    await act(async () => {
      firstSaveResult = await firstSavePromise!
    })

    expect(firstSaveResult).toEqual({
      ok: false,
      code: 'unknown',
      errorMessage: '同步超时，请检查网络后重试',
    })
    expect(result.current.status).toBe('error')
    expect(result.current.errorMessage).toBe('同步超时，请检查网络后重试')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000)
    })
    expect(uploadMetadata).toHaveBeenCalledTimes(1)

    let secondSavePromise: Promise<SaveNowResult> | null = null
    act(() => {
      secondSavePromise = result.current.saveNow({ content: 'timeout-second' })
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000)
    })

    let secondSaveResult: SaveNowResult | null = null
    await act(async () => {
      secondSaveResult = await secondSavePromise!
    })

    expect(secondSaveResult).toEqual({
      ok: false,
      code: 'unknown',
      errorMessage: '同步超时，请检查网络后重试',
    })
    expect(uploadMetadata).toHaveBeenCalledTimes(2)
  })

  it('离线状态切换时应更新 isOffline', async () => {
    const { result } = renderHook(() =>
      useSync<TestMetadata>({
        uploadMetadata: vi.fn(async () => ({
          syncedAt: '2026-02-08T14:00:00.000Z',
        })),
      }),
    )

    expect(result.current.isOffline).toBe(false)

    setNavigatorOnline(false)
    await act(async () => {
      window.dispatchEvent(new Event('offline'))
    })
    expect(result.current.isOffline).toBe(true)

    setNavigatorOnline(true)
    await act(async () => {
      window.dispatchEvent(new Event('online'))
      await Promise.resolve()
    })
    expect(result.current.isOffline).toBe(false)
  })

  it('上传返回冲突时应设置 conflictState 并提示用户处理', async () => {
    const uploadMetadata: UploadMetadataFn<TestMetadata> = vi.fn(async ({ metadata }) => ({
      ok: false,
      conflict: true,
      reason: 'sha_mismatch' as const,
      conflictPayload: {
        local: metadata,
        remote: { content: 'remote-version' },
      },
    }))

    const { result } = renderHook(() =>
      useSync<TestMetadata>({
        uploadMetadata,
      }),
    )

    await act(async () => {
      await result.current.saveNow({ content: 'local-version' })
    })

    expect(result.current.status).toBe('error')
    expect(result.current.conflictState).toEqual({
      local: { content: 'local-version' },
      remote: { content: 'remote-version' },
    })
    expect(result.current.errorMessage).toContain('冲突')
  })

  it('选择保留本地版本后应重新提交冲突内容', async () => {
    const uploadMetadata: UploadMetadataFn<TestMetadata> = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        conflict: true,
        reason: 'sha_mismatch' as const,
        remoteSha: 'sha-latest',
      })
      .mockResolvedValueOnce({
        ok: true,
        conflict: false,
        syncedAt: '2026-02-08T17:00:00.000Z',
      })

    const { result } = renderHook(() =>
      useSync<TestMetadata>({
        uploadMetadata,
      }),
    )

    await act(async () => {
      await result.current.saveNow({ content: 'retry-local' })
    })
    expect(result.current.conflictState).toBeTruthy()

    await act(async () => {
      await result.current.resolveConflict('local')
    })

    expect(uploadMetadata).toHaveBeenCalledTimes(2)
    expect(uploadMetadata).toHaveBeenLastCalledWith({
      metadata: { content: 'retry-local' },
      reason: 'manual',
      expectedSha: 'sha-latest',
    })
    expect(result.current.conflictState).toBeNull()
    expect(result.current.status).toBe('success')
  })

  it('切换 entry 时未提交改动状态应按 entry 隔离', async () => {
    const uploadMetadata: UploadMetadataFn<{ entryId: string; content: string }> = vi.fn(async () => ({
      syncedAt: '2026-02-08T11:30:00.000Z',
    }))
    const loadBaseline = vi
      .fn<(entryId: string) => Promise<{ entryId: string; fingerprint: string; syncedAt: string } | null>>()
      .mockImplementation(async (entryId) => {
        if (entryId === 'entry:a') {
          return {
            entryId: 'entry:a',
            fingerprint: 'A',
            syncedAt: '2026-02-08T11:00:00.000Z',
          }
        }
        if (entryId === 'entry:b') {
          return {
            entryId: 'entry:b',
            fingerprint: 'B',
            syncedAt: '2026-02-08T11:00:00.000Z',
          }
        }
        return null
      })

    const { result } = renderHook(() =>
      useSync<{ entryId: string; content: string }>({
        uploadMetadata,
        getEntryId: (metadata) => metadata.entryId,
        getFingerprint: (metadata) => metadata.content,
        loadBaseline,
      }),
    )

    await act(async () => {
      result.current.setActiveMetadata({ entryId: 'entry:a', content: 'A' })
      await Promise.resolve()
    })
    expect(result.current.hasUnsyncedChanges).toBe(false)

    act(() => {
      result.current.onInputChange({ entryId: 'entry:a', content: 'A-updated' })
    })
    expect(result.current.hasUnsyncedChanges).toBe(true)

    await act(async () => {
      result.current.setActiveMetadata({ entryId: 'entry:b', content: 'B' })
      await Promise.resolve()
    })
    expect(result.current.hasUnsyncedChanges).toBe(false)
  })

  it('baseline 异步回写晚于上传成功时不应覆盖最新同步状态', async () => {
    let resolveBaseline!: (value: { entryId: string; fingerprint: string; syncedAt: string }) => void
    const loadBaseline = vi.fn(
      () =>
        new Promise<{ entryId: string; fingerprint: string; syncedAt: string }>((resolve) => {
          resolveBaseline = resolve
        }),
    )
    const uploadMetadata: UploadMetadataFn<{ entryId: string; content: string }> = vi.fn(async () => ({
      ok: true,
      conflict: false,
      remoteSha: 'sha-new',
      syncedAt: '2026-02-08T20:00:00.000Z',
    }))

    const { result } = renderHook(() =>
      useSync<{ entryId: string; content: string }>({
        uploadMetadata,
        getEntryId: (metadata) => metadata.entryId,
        getFingerprint: (metadata) => metadata.content,
        loadBaseline,
      }),
    )

    await act(async () => {
      result.current.setActiveMetadata({ entryId: 'entry:late', content: 'v2' })
      await Promise.resolve()
    })

    await act(async () => {
      await result.current.saveNow({ entryId: 'entry:late', content: 'v2' })
    })
    expect(result.current.status).toBe('success')
    expect(result.current.hasUnsyncedChanges).toBe(false)

    await act(async () => {
      resolveBaseline({
        entryId: 'entry:late',
        fingerprint: 'v1',
        syncedAt: '2026-02-08T10:00:00.000Z',
      })
      await Promise.resolve()
    })

    expect(result.current.status).toBe('success')
    expect(result.current.hasUnsyncedChanges).toBe(false)
  })

  it('未注入上传实现时应使用默认占位上传并成功返回同步时间', async () => {
    const { result } = renderHook(() =>
      useSync<TestMetadata>({
        now: () => '2026-02-08T13:00:00.000Z',
      }),
    )

    await act(async () => {
      await result.current.saveNow({ content: 'placeholder' })
    })

    expect(result.current.status).toBe('success')
    expect(result.current.errorMessage).toBeNull()
    expect(result.current.lastSyncedAt).not.toBeNull()
  })

  it('加载到匹配 baseline 后应恢复“云端已同步”标签（刷新后状态收敛）', async () => {
    const loadBaseline = vi.fn(
      async (entryId: string) =>
        ({
          entryId,
          fingerprint: 'fp:matched',
          syncedAt: '2026-02-12T09:30:00.000Z',
        }) as { entryId: string; fingerprint: string; syncedAt: string },
    )

    const { result } = renderHook(() =>
      useSync<{ entryId: string; content: string }>({
        uploadMetadata: vi.fn(async () => ({
          ok: true,
          conflict: false,
          syncedAt: '2026-02-12T10:00:00.000Z',
        })),
        getEntryId: (metadata) => metadata.entryId,
        getFingerprint: () => 'fp:matched',
        loadBaseline,
      }),
    )

    await act(async () => {
      result.current.setActiveMetadata({
        entryId: 'daily:2100-01-08',
        content: 'persisted-content',
      })
      await Promise.resolve()
    })

    expect(result.current.hasUnsyncedChanges).toBe(false)
    expect(
      getSyncLabel({
        canSyncToRemote: true,
        hasConflict: false,
        isOffline: result.current.isOffline,
        hasPendingRetry: result.current.hasPendingRetry,
        status: result.current.status,
        hasUnsyncedChanges: result.current.hasUnsyncedChanges,
        lastSyncedAt: result.current.lastSyncedAt,
      }),
    ).toBe('云端已同步')
  })

  it('本地 modifiedAt 晚于最近同步时间时应判定为云端待同步（即使内容一致）', async () => {
    const loadBaseline = vi.fn(
      async (entryId: string) =>
        ({
          entryId,
          fingerprint: 'fp:stable',
          syncedAt: '2026-02-12T09:30:00.000Z',
        }) as { entryId: string; fingerprint: string; syncedAt: string },
    )

    const { result } = renderHook(() =>
      useSync<{ entryId: string; content: string; modifiedAt: string }>({
        getEntryId: (metadata) => metadata.entryId,
        getFingerprint: () => 'fp:stable',
        getLocalModifiedAt: (metadata) => metadata.modifiedAt,
        loadBaseline,
      }),
    )

    await act(async () => {
      result.current.setActiveMetadata({
        entryId: 'daily:2100-01-08',
        content: 'same-content',
        modifiedAt: '2026-02-12T09:20:00.000Z',
      })
      await Promise.resolve()
    })

    expect(result.current.hasUnsyncedChanges).toBe(false)
    expect(
      getSyncLabel({
        canSyncToRemote: true,
        hasConflict: false,
        isOffline: result.current.isOffline,
        hasPendingRetry: result.current.hasPendingRetry,
        status: result.current.status,
        hasUnsyncedChanges: result.current.hasUnsyncedChanges,
        lastSyncedAt: result.current.lastSyncedAt,
      }),
    ).toBe('云端已同步')

    await act(async () => {
      result.current.onInputChange({
        entryId: 'daily:2100-01-08',
        content: 'same-content',
        modifiedAt: '2026-02-12T09:40:00.000Z',
      })
      await Promise.resolve()
    })

    expect(result.current.hasUnsyncedChanges).toBe(true)
    expect(
      getSyncLabel({
        canSyncToRemote: true,
        hasConflict: false,
        isOffline: result.current.isOffline,
        hasPendingRetry: result.current.hasPendingRetry,
        status: result.current.status,
        hasUnsyncedChanges: result.current.hasUnsyncedChanges,
        lastSyncedAt: result.current.lastSyncedAt,
      }),
    ).toBe('云端待同步')
  })
})
