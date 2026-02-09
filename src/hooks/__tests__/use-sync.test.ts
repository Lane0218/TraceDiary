import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UploadMetadataFn } from '../../services/sync'
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

    await act(async () => {
      await result.current.saveNow({ content: 'final' })
    })

    expect(uploadMetadata).toHaveBeenCalledTimes(1)
    expect(uploadMetadata).toHaveBeenCalledWith({
      metadata: { content: 'final' },
      reason: 'manual',
    })
    expect(result.current.status).toBe('success')
    expect(result.current.lastSyncedAt).toBe('2026-02-08T12:00:00.000Z')

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

    await act(async () => {
      await result.current.saveNow({ content: 'any' })
    })

    expect(uploadMetadata).toHaveBeenCalledTimes(1)
    expect(result.current.status).toBe('error')
    expect(result.current.errorMessage).toBe('远端不可用')
    expect(result.current.lastSyncedAt).toBeNull()
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

    await act(async () => {
      await result.current.saveNow({ content: 'offline-draft' })
    })

    expect(uploadMetadata).not.toHaveBeenCalled()
    expect(result.current.isOffline).toBe(true)
    expect(result.current.hasPendingRetry).toBe(true)
    expect(result.current.errorMessage).toBe('当前处于离线状态，网络恢复后将自动重试')

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
})
