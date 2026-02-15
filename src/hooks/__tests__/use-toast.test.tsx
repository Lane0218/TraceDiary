import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider, useToast } from '../use-toast'

function ToastHarness() {
  const { toasts, push } = useToast()

  return (
    <div>
      <button
        type="button"
        data-testid="push-auto"
        onClick={() => {
          push({
            kind: 'push',
            level: 'info',
            message: 'auto-dismiss',
          })
        }}
      >
        auto
      </button>
      <button
        type="button"
        data-testid="push-sticky"
        onClick={() => {
          push({
            kind: 'push',
            level: 'info',
            message: 'sticky-pending',
            autoDismiss: false,
          })
        }}
      >
        sticky
      </button>
      <button
        type="button"
        data-testid="push-success"
        onClick={() => {
          push({
            kind: 'push',
            level: 'success',
            message: 'sync-success',
          })
        }}
      >
        success
      </button>
      <span data-testid="toast-count">{toasts.length}</span>
      <span data-testid="toast-message">{toasts[0]?.message ?? ''}</span>
    </div>
  )
}

describe('useToast', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('默认 toast 应按级别时长自动消失', async () => {
    vi.useFakeTimers()
    render(
      <ToastProvider>
        <ToastHarness />
      </ToastProvider>,
    )

    fireEvent.click(screen.getByTestId('push-auto'))
    expect(screen.getByTestId('toast-count')).toHaveTextContent('1')
    expect(screen.getByTestId('toast-message')).toHaveTextContent('auto-dismiss')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_200)
    })

    expect(screen.getByTestId('toast-count')).toHaveTextContent('0')
    expect(screen.getByTestId('toast-message')).toHaveTextContent('')
  })

  it('autoDismiss=false 的进行中 toast 应常驻，直到被同 kind 结果 toast 顶替', async () => {
    vi.useFakeTimers()
    render(
      <ToastProvider>
        <ToastHarness />
      </ToastProvider>,
    )

    fireEvent.click(screen.getByTestId('push-sticky'))
    expect(screen.getByTestId('toast-count')).toHaveTextContent('1')
    expect(screen.getByTestId('toast-message')).toHaveTextContent('sticky-pending')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })

    expect(screen.getByTestId('toast-count')).toHaveTextContent('1')
    expect(screen.getByTestId('toast-message')).toHaveTextContent('sticky-pending')

    fireEvent.click(screen.getByTestId('push-success'))
    expect(screen.getByTestId('toast-count')).toHaveTextContent('1')
    expect(screen.getByTestId('toast-message')).toHaveTextContent('sync-success')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_200)
    })

    expect(screen.getByTestId('toast-count')).toHaveTextContent('0')
  })
})
