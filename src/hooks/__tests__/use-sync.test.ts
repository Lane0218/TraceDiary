import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UploadMetadataFn } from '../../services/sync'
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

  it('输入变更应在 30 秒后触发一次防抖上传，且只上传最新内容', async () => {
    const uploadMetadata: UploadMetadataFn<TestMetadata> = vi.fn(async ({ metadata }) => ({
      syncedAt: `2026-02-08T00:00:00.000Z:${metadata.content}`,
    }))

    const { result } = renderHook(() =>
      useSync<TestMetadata>({
        uploadMetadata,
      }),
    )

    act(() => {
      result.current.onInputChange({ content: 'first' })
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })

    act(() => {
      result.current.onInputChange({ content: 'latest' })
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(29_999)
    })
    expect(uploadMetadata).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })

    expect(uploadMetadata).toHaveBeenCalledTimes(1)
    expect(uploadMetadata).toHaveBeenCalledWith({
      metadata: { content: 'latest' },
      reason: 'debounced',
    })
    expect(result.current.status).toBe('success')
    expect(result.current.lastSyncedAt).toBe('2026-02-08T00:00:00.000Z:latest')
    expect(result.current.errorMessage).toBeNull()
  })

  it('应在本地编辑后标记未提交改动，并在上传成功后清空', async () => {
    const uploadMetadata: UploadMetadataFn<TestMetadata> = vi.fn(async () => ({
      syncedAt: '2026-02-08T10:00:00.000Z',
    }))

    const { result } = renderHook(() =>
      useSync<TestMetadata>({
        uploadMetadata,
        debounceMs: 10,
      }),
    )

    expect(result.current.hasUnsyncedChanges).toBe(false)

    act(() => {
      result.current.onInputChange({ content: 'draft' })
    })
    expect(result.current.hasUnsyncedChanges).toBe(true)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10)
    })

    expect(uploadMetadata).toHaveBeenCalledTimes(1)
    expect(result.current.status).toBe('success')
    expect(result.current.hasUnsyncedChanges).toBe(false)
  })

  it('上传失败后应保留未提交改动标记', async () => {
    const uploadMetadata: UploadMetadataFn<TestMetadata> = vi.fn(async () => {
      throw new Error('mock network error')
    })

    const { result } = renderHook(() =>
      useSync<TestMetadata>({
        uploadMetadata,
      }),
    )

    await act(async () => {
      await result.current.saveNow({ content: 'failed-payload' })
    })

    expect(result.current.status).toBe('error')
    expect(result.current.hasUnsyncedChanges).toBe(true)
  })

  it('手动保存应立即上传并取消已有防抖任务', async () => {
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

    let saveResult: SaveNowResult | null = null
    await act(async () => {
      saveResult = await result.current.saveNow({ content: 'final' })
    })

    expect(uploadMetadata).toHaveBeenCalledTimes(1)
    expect(uploadMetadata).toHaveBeenCalledWith({
      metadata: { content: 'final' },
      reason: 'manual',
    })
    expect(result.current.status).toBe('success')
    expect(result.current.lastSyncedAt).toBe('2026-02-08T12:00:00.000Z')
    expect(saveResult).toEqual({
      ok: true,
      errorMessage: null,
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    expect(uploadMetadata).toHaveBeenCalledTimes(1)
  })

  it('上传失败时应返回 error 状态和错误信息', async () => {
    const uploadMetadata: UploadMetadataFn<TestMetadata> = vi.fn(async () => {
      throw new Error('远端不可用')
    })

    const { result } = renderHook(() =>
      useSync<TestMetadata>({
        uploadMetadata,
      }),
    )

    let saveResult: SaveNowResult | null = null
    await act(async () => {
      saveResult = await result.current.saveNow({ content: 'any' })
    })

    expect(uploadMetadata).toHaveBeenCalledTimes(1)
    expect(result.current.status).toBe('error')
    expect(result.current.errorMessage).toBe('远端不可用')
    expect(result.current.lastSyncedAt).toBeNull()
    expect(saveResult).toEqual({
      ok: false,
      code: 'unknown',
      errorMessage: '远端不可用',
    })
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

  it('手动上传进行中收到同内容输入时不应排队自动上传', async () => {
    let resolveFirstUpload!: (value: { syncedAt: string }) => void
    const firstUploadPromise = new Promise<{ syncedAt: string }>((resolve) => {
      resolveFirstUpload = resolve
    })
    const uploadMetadata: UploadMetadataFn<TestMetadata> = vi
      .fn()
      .mockReturnValueOnce(firstUploadPromise)
      .mockResolvedValueOnce({
        syncedAt: '2026-02-08T13:40:00.000Z',
      })

    const { result } = renderHook(() =>
      useSync<TestMetadata>({
        uploadMetadata,
        debounceMs: 0,
      }),
    )

    let firstSavePromise: Promise<SaveNowResult> | null = null
    act(() => {
      firstSavePromise = result.current.saveNow({ content: 'same-payload' })
    })

    act(() => {
      result.current.onInputChange({ content: 'same-payload' })
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(uploadMetadata).toHaveBeenCalledTimes(1)
    expect(uploadMetadata).toHaveBeenNthCalledWith(1, {
      metadata: { content: 'same-payload' },
      reason: 'manual',
    })

    resolveFirstUpload({ syncedAt: '2026-02-08T13:00:00.000Z' })
    let firstSaveResult: SaveNowResult | null = null
    await act(async () => {
      firstSaveResult = await firstSavePromise!
      await Promise.resolve()
    })

    expect(firstSaveResult).toEqual({
      ok: true,
      errorMessage: null,
    })
    expect(uploadMetadata).toHaveBeenCalledTimes(1)
    expect(result.current.status).toBe('success')
    expect(result.current.hasUnsyncedChanges).toBe(false)
  })

  it('上传请求超时后应退出 syncing 并返回可重试错误', async () => {
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
        debounceMs: 0,
      }),
    )

    let firstSavePromise: Promise<SaveNowResult> | null = null
    act(() => {
      firstSavePromise = result.current.saveNow({ content: 'timeout-first' })
      result.current.onInputChange({ content: 'queued-while-timeout' })
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
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
    expect(uploadMetadata).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000)
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

  it('防抖自动上传不应受手动超时阈值影响', async () => {
    const uploadMetadata = vi.fn<UploadMetadataFn<TestMetadata>>(async () => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 1_500)
      })
      return {
        syncedAt: '2026-02-08T12:10:00.000Z',
      }
    })

    const { result } = renderHook(() =>
      useSync<TestMetadata>({
        uploadMetadata,
        debounceMs: 0,
        uploadTimeoutMs: 1_000,
      }),
    )

    act(() => {
      result.current.onInputChange({ content: 'slow-auto-upload' })
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(uploadMetadata).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000)
    })
    expect(result.current.status).toBe('syncing')
    expect(result.current.errorMessage).toBeNull()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
      await Promise.resolve()
    })

    expect(uploadMetadata).toHaveBeenCalledTimes(1)
    expect(uploadMetadata).toHaveBeenNthCalledWith(1, {
      metadata: { content: 'slow-auto-upload' },
      reason: 'debounced',
    })
    expect(result.current.status).toBe('success')
    expect(result.current.errorMessage).toBeNull()
    expect(result.current.lastSyncedAt).toBe('2026-02-08T12:10:00.000Z')
  })

  it('自动上传请求超时后应退出 syncing 并允许后续手动恢复', async () => {
    const uploadMetadata = vi
      .fn<UploadMetadataFn<TestMetadata>>()
      .mockImplementationOnce(
        () =>
          new Promise(() => {
            // 模拟自动上传请求悬挂
          }),
      )
      .mockResolvedValueOnce({
        syncedAt: '2026-02-08T12:20:00.000Z',
      })

    const { result } = renderHook(() =>
      useSync<TestMetadata>({
        uploadMetadata,
        debounceMs: 0,
        autoUploadTimeoutMs: 1_000,
      }),
    )

    act(() => {
      result.current.onInputChange({ content: 'auto-timeout' })
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(uploadMetadata).toHaveBeenCalledTimes(1)
    expect(result.current.status).toBe('syncing')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000)
    })

    expect(result.current.status).toBe('error')
    expect(result.current.errorMessage).toBe('同步超时，请检查网络后重试')
    expect(result.current.hasUnsyncedChanges).toBe(true)

    let recoverResult: SaveNowResult | null = null
    await act(async () => {
      recoverResult = await result.current.saveNow({ content: 'manual-recover' })
    })

    expect(recoverResult).toEqual({
      ok: true,
      errorMessage: null,
    })
    expect(uploadMetadata).toHaveBeenCalledTimes(2)
    expect(uploadMetadata).toHaveBeenNthCalledWith(2, {
      metadata: { content: 'manual-recover' },
      reason: 'manual',
    })
    expect(result.current.status).toBe('success')
    expect(result.current.errorMessage).toBeNull()
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

  it('离线后恢复在线应自动重试最近一次 payload', async () => {
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
    expect(result.current.hasPendingRetry).toBe(true)
    expect(result.current.errorMessage).toBe('当前处于离线状态，网络恢复后将自动重试')
    expect(saveResult).toEqual({
      ok: false,
      code: 'offline',
      errorMessage: '当前处于离线状态，网络恢复后将自动重试',
    })

    setNavigatorOnline(true)
    await act(async () => {
      window.dispatchEvent(new Event('online'))
      await Promise.resolve()
    })

    expect(uploadMetadata).toHaveBeenCalledTimes(1)
    expect(uploadMetadata).toHaveBeenCalledWith({
      metadata: { content: 'offline-draft' },
      reason: 'manual',
    })
    expect(result.current.status).toBe('success')
    expect(result.current.lastSyncedAt).toBe('2026-02-08T15:00:00.000Z')
  })

  it('自动重试成功后应清空 pending 状态并且不重复重试', async () => {
    const uploadMetadata: UploadMetadataFn<TestMetadata> = vi.fn(async () => ({
      syncedAt: '2026-02-08T16:00:00.000Z',
    }))

    const { result } = renderHook(() =>
      useSync<TestMetadata>({
        uploadMetadata,
      }),
    )

    setNavigatorOnline(false)
    await act(async () => {
      window.dispatchEvent(new Event('offline'))
      await result.current.saveNow({ content: 'needs-retry' })
    })
    expect(result.current.hasPendingRetry).toBe(true)

    setNavigatorOnline(true)
    await act(async () => {
      window.dispatchEvent(new Event('online'))
      await Promise.resolve()
    })

    expect(result.current.hasPendingRetry).toBe(false)
    expect(uploadMetadata).toHaveBeenCalledTimes(1)

    await act(async () => {
      window.dispatchEvent(new Event('online'))
      await Promise.resolve()
    })
    expect(uploadMetadata).toHaveBeenCalledTimes(1)
  })

  it('上传失败后应保留队列最新 payload，并在在线恢复时优先回放', async () => {
    let rejectFirstUpload!: (error: Error) => void
    const firstUploadPromise = new Promise<{ syncedAt: string }>((_resolve, reject) => {
      rejectFirstUpload = reject
    })
    const uploadMetadata: UploadMetadataFn<TestMetadata> = vi
      .fn()
      .mockReturnValueOnce(firstUploadPromise)
      .mockResolvedValueOnce({
        syncedAt: '2026-02-08T16:30:00.000Z',
      })

    const { result } = renderHook(() =>
      useSync<TestMetadata>({
        uploadMetadata,
        debounceMs: 0,
      }),
    )

    let firstSavePromise: Promise<SaveNowResult> | null = null
    act(() => {
      firstSavePromise = result.current.saveNow({ content: 'first-payload' })
      result.current.onInputChange({ content: 'latest-queued' })
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(uploadMetadata).toHaveBeenCalledTimes(1)

    await act(async () => {
      rejectFirstUpload(new Error('Failed to fetch'))
      await Promise.resolve()
    })

    let firstSaveResult: SaveNowResult | null = null
    await act(async () => {
      firstSaveResult = await firstSavePromise!
    })

    expect(firstSaveResult).toEqual({
      ok: false,
      code: 'offline',
      errorMessage: '当前处于离线状态，网络恢复后将自动重试',
    })
    expect(result.current.hasPendingRetry).toBe(true)
    expect(uploadMetadata).toHaveBeenCalledTimes(1)

    setNavigatorOnline(true)
    await act(async () => {
      window.dispatchEvent(new Event('online'))
      await Promise.resolve()
    })

    expect(uploadMetadata).toHaveBeenCalledTimes(2)
    expect(uploadMetadata).toHaveBeenNthCalledWith(2, {
      metadata: { content: 'latest-queued' },
      reason: 'debounced',
    })
    expect(result.current.status).toBe('success')
    expect(result.current.hasPendingRetry).toBe(false)
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
    })
    expect(result.current.conflictState).toBeNull()
    expect(result.current.status).toBe('success')
  })
})
