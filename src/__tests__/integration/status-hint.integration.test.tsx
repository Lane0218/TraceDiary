import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import StatusHint from '../../components/common/status-hint'

describe('StatusHint', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('加载中时应显示加载提示', () => {
    render(<StatusHint isLoading isSaving={false} error={null} />)
    expect(screen.getByText('加载中')).toBeTruthy()
  })

  it('快速保存时不应显示保存中提示', async () => {
    vi.useFakeTimers()
    render(<StatusHint isLoading={false} isSaving error={null} />)

    expect(screen.queryByText('保存中')).toBeNull()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    expect(screen.queryByText('保存中')).toBeNull()
  })

  it('慢保存时应显示保存中，结束后隐藏', async () => {
    vi.useFakeTimers()
    const { rerender } = render(<StatusHint isLoading={false} isSaving error={null} />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })
    expect(screen.getByText('保存中')).toBeTruthy()

    rerender(<StatusHint isLoading={false} isSaving={false} error={null} />)
    expect(screen.queryByText('保存中')).toBeNull()
  })

  it('出现错误时应优先展示本地保存异常', async () => {
    vi.useFakeTimers()
    const { rerender } = render(<StatusHint isLoading={false} isSaving error={null} />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })
    expect(screen.getByText('保存中')).toBeTruthy()

    rerender(<StatusHint isLoading={false} isSaving error="保存失败" />)
    expect(screen.getByText('本地保存异常')).toBeTruthy()
    expect(screen.queryByText('保存中')).toBeNull()
  })
})
