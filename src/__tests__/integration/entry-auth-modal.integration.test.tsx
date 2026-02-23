import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import EntryAuthModal from '../../components/auth/entry-auth-modal'

const sendEmailOtpMock = vi.hoisted(() => vi.fn())
const verifyEmailOtpMock = vi.hoisted(() => vi.fn())
const signInWithEmailPasswordMock = vi.hoisted(() => vi.fn())
const signUpWithEmailPasswordMock = vi.hoisted(() => vi.fn())
const signInWithGitHubMock = vi.hoisted(() => vi.fn())

vi.mock('../../services/supabase', async () => {
  const actual = await vi.importActual<typeof import('../../services/supabase')>('../../services/supabase')
  return {
    ...actual,
    sendEmailOtp: sendEmailOtpMock,
    verifyEmailOtp: verifyEmailOtpMock,
    signInWithEmailPassword: signInWithEmailPasswordMock,
    signUpWithEmailPassword: signUpWithEmailPasswordMock,
    signInWithGitHub: signInWithGitHubMock,
  }
})

const OTP_COOLDOWN_STORAGE_KEY = 'trace-diary:entry-auth:otp-cooldown'

function renderEntryAuthModal(options?: { onClose?: () => void }) {
  return render(
    <MemoryRouter>
      <EntryAuthModal
        open
        canClose
        cloudAuthEnabled
        onClose={options?.onClose ?? (() => undefined)}
        onEnterGuest={() => undefined}
        onChooseAuthFlow={() => undefined}
      />
    </MemoryRouter>,
  )
}

describe('首屏登录弹窗交互', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-02-22T00:00:00.000Z'))
    localStorage.clear()
    sendEmailOtpMock.mockReset()
    verifyEmailOtpMock.mockReset()
    signInWithEmailPasswordMock.mockReset()
    signUpWithEmailPasswordMock.mockReset()
    signInWithGitHubMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('默认展示单入口继续，验证码作为次级切换', () => {
    renderEntryAuthModal()
    expect(screen.queryByText('第一步：邮箱')).toBeNull()
    expect(screen.queryByText('第二步：验证码')).toBeNull()
    expect(screen.queryByText('账号状态')).toBeNull()

    expect(screen.getByText('继续使用 TraceDiary')).toBeTruthy()
    expect(screen.getByTestId('entry-auth-github-btn')).toBeTruthy()
    expect(screen.getByTestId('entry-auth-password-input')).toBeTruthy()
    expect(screen.queryByTestId('entry-auth-otp-input')).toBeNull()

    fireEvent.click(screen.getByTestId('entry-auth-switch-otp-btn'))
    expect(screen.getByText('邮箱')).toBeTruthy()
    expect(screen.getByText('验证码')).toBeTruthy()
    expect(screen.getByTestId('entry-auth-switch-password-btn')).toBeTruthy()
  })

  it('发送验证码后应进入 60 秒倒计时并禁止重复发送', async () => {
    sendEmailOtpMock.mockResolvedValue(undefined)
    renderEntryAuthModal()
    fireEvent.click(screen.getByTestId('entry-auth-switch-otp-btn'))

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
    fireEvent.click(screen.getByTestId('entry-auth-switch-otp-btn'))
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

  it('邮箱密码继续应调用 signInWithEmailPassword 并触发关闭', async () => {
    signInWithEmailPasswordMock.mockResolvedValue(undefined)
    const onClose = vi.fn()
    renderEntryAuthModal({ onClose })

    fireEvent.change(screen.getByTestId('entry-auth-email-input'), {
      target: { value: 'user@example.com' },
    })
    fireEvent.change(screen.getByTestId('entry-auth-password-input'), {
      target: { value: 'Password123' },
    })
    fireEvent.click(screen.getByTestId('entry-auth-continue-password-btn'))

    await waitFor(() => {
      expect(signInWithEmailPasswordMock).toHaveBeenCalledWith('user@example.com', 'Password123')
    })
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  it('登录失败后应展示创建账号确认区', async () => {
    signInWithEmailPasswordMock.mockRejectedValue(new Error('邮箱或密码错误，请重试'))
    renderEntryAuthModal()

    fireEvent.change(screen.getByTestId('entry-auth-email-input'), {
      target: { value: 'new-user@example.com' },
    })
    fireEvent.change(screen.getByTestId('entry-auth-password-input'), {
      target: { value: 'Password123' },
    })
    fireEvent.click(screen.getByTestId('entry-auth-continue-password-btn'))

    await waitFor(() => {
      expect(signInWithEmailPasswordMock).toHaveBeenCalledWith('new-user@example.com', 'Password123')
    })
    expect(screen.getByTestId('entry-auth-create-account-prompt')).toBeTruthy()
    expect(screen.getByText('未登录成功。若你是首次使用，可创建新账号继续。')).toBeTruthy()
  })

  it('确认创建账号后若需邮箱验证，应展示提示文案', async () => {
    signInWithEmailPasswordMock.mockRejectedValue(new Error('邮箱或密码错误，请重试'))
    signUpWithEmailPasswordMock.mockResolvedValue({ needsEmailConfirmation: true })
    renderEntryAuthModal()

    fireEvent.change(screen.getByTestId('entry-auth-email-input'), {
      target: { value: 'new-user@example.com' },
    })
    fireEvent.change(screen.getByTestId('entry-auth-password-input'), {
      target: { value: 'Password123' },
    })
    fireEvent.click(screen.getByTestId('entry-auth-continue-password-btn'))

    await waitFor(() => {
      expect(screen.getByTestId('entry-auth-create-account-prompt')).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId('entry-auth-create-account-btn'))

    await waitFor(() => {
      expect(signUpWithEmailPasswordMock).toHaveBeenCalledWith('new-user@example.com', 'Password123')
    })
    expect(screen.getByText('账号已创建，请先前往邮箱完成验证，再返回此处登录。')).toBeTruthy()
  })

  it('确认创建账号时若邮箱已注册，应提示重新输入密码', async () => {
    signInWithEmailPasswordMock.mockRejectedValue(new Error('邮箱或密码错误，请重试'))
    signUpWithEmailPasswordMock.mockRejectedValue(new Error('该邮箱已注册，请直接登录'))
    renderEntryAuthModal()

    fireEvent.change(screen.getByTestId('entry-auth-email-input'), {
      target: { value: 'exists@example.com' },
    })
    fireEvent.change(screen.getByTestId('entry-auth-password-input'), {
      target: { value: 'Password123' },
    })
    fireEvent.click(screen.getByTestId('entry-auth-continue-password-btn'))

    await waitFor(() => {
      expect(screen.getByTestId('entry-auth-create-account-prompt')).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId('entry-auth-create-account-btn'))

    await waitFor(() => {
      expect(screen.getByText('该邮箱已注册，当前密码不正确，请重新输入后再试。')).toBeTruthy()
    })
  })

  it('点击 GitHub 登录应发起 OAuth 流程', async () => {
    signInWithGitHubMock.mockResolvedValue(undefined)
    renderEntryAuthModal()

    fireEvent.click(screen.getByTestId('entry-auth-github-btn'))

    await waitFor(() => {
      expect(signInWithGitHubMock).toHaveBeenCalledTimes(1)
    })
  })
})
