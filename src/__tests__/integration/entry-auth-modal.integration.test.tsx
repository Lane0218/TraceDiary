import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import EntryAuthModal from '../../components/auth/entry-auth-modal'

const sendEmailOtpMock = vi.hoisted(() => vi.fn())
const verifyEmailOtpMock = vi.hoisted(() => vi.fn())

vi.mock('../../services/supabase', async () => {
  const actual = await vi.importActual<typeof import('../../services/supabase')>('../../services/supabase')
  return {
    ...actual,
    sendEmailOtp: sendEmailOtpMock,
    verifyEmailOtp: verifyEmailOtpMock,
  }
})

const OTP_COOLDOWN_STORAGE_KEY = 'trace-diary:entry-auth:otp-cooldown'

function renderEntryAuthModal() {
  return render(
    <MemoryRouter>
      <EntryAuthModal
        open
        canClose
        cloudAuthEnabled
        onClose={() => undefined}
        onEnterGuest={() => undefined}
        onChooseAuthFlow={() => undefined}
      />
    </MemoryRouter>,
  )
}

describe('首屏登录弹窗 OTP 交互', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-02-22T00:00:00.000Z'))
    localStorage.clear()
    sendEmailOtpMock.mockReset()
    verifyEmailOtpMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('不应展示步骤编号文案', () => {
    renderEntryAuthModal()
    expect(screen.queryByText('第一步：邮箱')).toBeNull()
    expect(screen.queryByText('第二步：验证码')).toBeNull()
    expect(screen.queryByText('账号状态')).toBeNull()
    expect(screen.getByText('邮箱')).toBeTruthy()
    expect(screen.getByText('验证码')).toBeTruthy()
  })

  it('发送验证码后应进入 60 秒倒计时并禁止重复发送', async () => {
    sendEmailOtpMock.mockResolvedValue(undefined)
    renderEntryAuthModal()

    fireEvent.change(screen.getByTestId('entry-auth-email-input'), {
      target: { value: 'user@example.com' },
    })

    const sendButton = screen.getByTestId('entry-auth-send-otp-btn') as HTMLButtonElement
    fireEvent.click(sendButton)

    await waitFor(() => {
      expect(sendEmailOtpMock).toHaveBeenCalledWith('user@example.com')
    })
    await waitFor(() => {
      expect(sendButton.textContent).toContain('60s 后重发')
    })
    expect(sendButton.disabled).toBe(true)

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(sendButton.textContent).toContain('59s 后重发')

    act(() => {
      vi.advanceTimersByTime(59_000)
    })
    await waitFor(() => {
      expect(sendButton.textContent).toBe('发送验证码')
    })
    expect(sendButton.disabled).toBe(false)
  })

  it('倒计时应在重新渲染后继续生效', async () => {
    localStorage.setItem(
      OTP_COOLDOWN_STORAGE_KEY,
      JSON.stringify({
        'persist@example.com': Date.now() + 30_000,
      }),
    )

    renderEntryAuthModal()
    fireEvent.change(screen.getByTestId('entry-auth-email-input'), {
      target: { value: 'persist@example.com' },
    })

    const sendButton = screen.getByTestId('entry-auth-send-otp-btn') as HTMLButtonElement
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    await waitFor(() => {
      expect(sendButton.textContent).toContain('后重发')
    })
    expect(sendButton.disabled).toBe(true)
  })
})
