import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UploadMetadataFn } from '../../services/sync'
import { useSync } from '../use-sync'

interface TestMetadata {
  content: string
}

describe('useSync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
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
})

