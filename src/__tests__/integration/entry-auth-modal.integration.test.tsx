import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import EntryAuthModal from '../../components/auth/entry-auth-modal'

const sendEmailOtpMock = vi.hoisted(() => vi.fn())
const verifyEmailOtpMock = vi.hoisted(() => vi.fn())
const signInWithEmailPasswordMock = vi.hoisted(() => vi.fn())
const signInWithGitHubMock = vi.hoisted(() => vi.fn())
const requestPasswordResetMock = vi.hoisted(() => vi.fn())
const updateSupabasePasswordMock = vi.hoisted(() => vi.fn())

vi.mock('../../services/supabase', async () => {
  const actual = await vi.importActual<typeof import('../../services/supabase')>('../../services/supabase')
  return {
    ...actual,
    sendEmailOtp: sendEmailOtpMock,
    verifyEmailOtp: verifyEmailOtpMock,
    signInWithEmailPassword: signInWithEmailPasswordMock,
    signInWithGitHub: signInWithGitHubMock,
    requestPasswordReset: requestPasswordResetMock,
    updateSupabasePassword: updateSupabasePasswordMock,
  }
})

const OTP_COOLDOWN_STORAGE_KEY = 'trace-diary:entry-auth:otp-cooldown'

function createEntryAuthModalElement(options?: { onClose?: () => void }) {
  return (
    <EntryAuthModal
      open
      canClose
      cloudAuthEnabled
      onClose={options?.onClose ?? (() => undefined)}
      onEnterGuest={() => undefined}
      onChooseAuthFlow={() => undefined}
    />
  )
}

function renderEntryAuthModal(options?: { onClose?: () => void }) {
  return render(
    <MemoryRouter>
      {createEntryAuthModalElement(options)}
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
    verifyEmailOtpMock.mockResolvedValue({ isNewUser: false })
    signInWithEmailPasswordMock.mockReset()
    signInWithGitHubMock.mockReset()
    requestPasswordResetMock.mockReset()
    updateSupabasePasswordMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('默认展示密码登录，验证码为次级切换', () => {
    renderEntryAuthModal()

    expect(screen.getByText('继续使用 TraceDiary')).toBeTruthy()
    expect(screen.getByTestId('entry-auth-github-btn')).toBeTruthy()
    expect(screen.getByTestId('entry-auth-password-input')).toBeTruthy()
    expect(screen.getByTestId('entry-auth-go-register-btn')).toBeTruthy()
    expect(screen.queryByTestId('entry-auth-otp-input')).toBeNull()

    fireEvent.click(screen.getByTestId('entry-auth-switch-otp-btn'))
    expect(screen.getByTestId('entry-auth-otp-input')).toBeTruthy()
    expect(screen.getByTestId('entry-auth-switch-password-btn')).toBeTruthy()
    expect(screen.getByTestId('entry-auth-otp-inline-status').textContent).toBe('')
    expect(screen.queryByTestId('entry-auth-otp-intent-hint')).toBeNull()
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
    expect(screen.getByTestId('entry-auth-otp-inline-status').textContent).toBe('验证码已发送，请检查邮箱。')
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
      target: { value: 'User@Example.com' },
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

  it('密码登录失败时只展示错误，不再弹创建账号卡片', async () => {
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
    expect(screen.getByText('邮箱或密码错误，请重试')).toBeTruthy()
    expect(screen.queryByTestId('entry-auth-create-account-prompt')).toBeNull()
    expect(screen.getByTestId('entry-auth-go-register-btn')).toBeTruthy()
  })

  it('点击注册入口后应进入统一验证码视图', () => {
    renderEntryAuthModal()

    fireEvent.click(screen.getByTestId('entry-auth-go-register-btn'))
    expect(screen.getByTestId('entry-auth-otp-input')).toBeTruthy()
    expect(screen.queryByTestId('entry-auth-otp-intent-hint')).toBeNull()
  })

  it('从注册入口进入后，非首登验证码验证成功应直接进入', async () => {
    verifyEmailOtpMock.mockResolvedValue({ isNewUser: false })
    const onClose = vi.fn()
    renderEntryAuthModal({ onClose })

    fireEvent.change(screen.getByTestId('entry-auth-email-input'), {
      target: { value: 'register@example.com' },
    })
    fireEvent.click(screen.getByTestId('entry-auth-go-register-btn'))
    fireEvent.change(screen.getByTestId('entry-auth-otp-input'), {
      target: { value: '123456' },
    })
    fireEvent.click(screen.getByTestId('entry-auth-verify-otp-btn'))

    await waitFor(() => {
      expect(verifyEmailOtpMock).toHaveBeenCalledWith('register@example.com', '123456')
    })
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  it('从注册入口进入后，首登成功应提示设置密码并允许跳过', async () => {
    verifyEmailOtpMock.mockResolvedValue({ isNewUser: true })
    const onClose = vi.fn()
    renderEntryAuthModal({ onClose })

    fireEvent.change(screen.getByTestId('entry-auth-email-input'), {
      target: { value: 'first-user@example.com' },
    })
    fireEvent.click(screen.getByTestId('entry-auth-go-register-btn'))
    fireEvent.change(screen.getByTestId('entry-auth-otp-input'), {
      target: { value: '654321' },
    })
    fireEvent.click(screen.getByTestId('entry-auth-verify-otp-btn'))

    await waitFor(() => {
      expect(verifyEmailOtpMock).toHaveBeenCalledWith('first-user@example.com', '654321')
    })
    expect(screen.getByTestId('entry-auth-password-setup-view')).toBeTruthy()
    expect(screen.queryByTestId('entry-auth-guest-btn')).toBeNull()
    expect(onClose).toHaveBeenCalledTimes(0)

    fireEvent.click(screen.getByTestId('entry-auth-skip-set-password-btn'))
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  it('首登成功后设置密码应调用 updateSupabasePassword 并关闭弹窗', async () => {
    verifyEmailOtpMock.mockResolvedValue({ isNewUser: true })
    updateSupabasePasswordMock.mockResolvedValue(undefined)
    const onClose = vi.fn()
    renderEntryAuthModal({ onClose })

    fireEvent.change(screen.getByTestId('entry-auth-email-input'), {
      target: { value: 'first-set-password@example.com' },
    })
    fireEvent.click(screen.getByTestId('entry-auth-go-register-btn'))
    fireEvent.change(screen.getByTestId('entry-auth-otp-input'), {
      target: { value: '112233' },
    })
    fireEvent.click(screen.getByTestId('entry-auth-verify-otp-btn'))
    await waitFor(() => {
      expect(screen.getByTestId('entry-auth-password-setup-view')).toBeTruthy()
    })

    fireEvent.change(screen.getByTestId('entry-auth-setup-password-input'), {
      target: { value: 'Password123' },
    })
    fireEvent.change(screen.getByTestId('entry-auth-setup-password-confirm-input'), {
      target: { value: 'Password123' },
    })
    fireEvent.click(screen.getByTestId('entry-auth-submit-set-password-btn'))

    await waitFor(() => {
      expect(updateSupabasePasswordMock).toHaveBeenCalledWith('Password123')
    })
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  it('首登设置密码两次不一致时不应提交', async () => {
    verifyEmailOtpMock.mockResolvedValue({ isNewUser: true })
    const onClose = vi.fn()
    renderEntryAuthModal({ onClose })

    fireEvent.change(screen.getByTestId('entry-auth-email-input'), {
      target: { value: 'first-set-password-mismatch@example.com' },
    })
    fireEvent.click(screen.getByTestId('entry-auth-go-register-btn'))
    fireEvent.change(screen.getByTestId('entry-auth-otp-input'), {
      target: { value: '445566' },
    })
    fireEvent.click(screen.getByTestId('entry-auth-verify-otp-btn'))
    await waitFor(() => {
      expect(screen.getByTestId('entry-auth-password-setup-view')).toBeTruthy()
    })

    fireEvent.change(screen.getByTestId('entry-auth-setup-password-input'), {
      target: { value: 'Password123' },
    })
    fireEvent.change(screen.getByTestId('entry-auth-setup-password-confirm-input'), {
      target: { value: 'Password124' },
    })

    const submitButton = screen.getByTestId('entry-auth-submit-set-password-btn') as HTMLButtonElement
    expect(submitButton.disabled).toBe(true)
    expect(screen.getByText('两次输入的密码不一致。')).toBeTruthy()
    expect(updateSupabasePasswordMock).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(0)
  })

  it('点击忘记密码应发送重置邮件', async () => {
    requestPasswordResetMock.mockResolvedValue(undefined)
    renderEntryAuthModal()

    fireEvent.change(screen.getByTestId('entry-auth-email-input'), {
      target: { value: 'reset-user@example.com' },
    })
    fireEvent.click(screen.getByTestId('entry-auth-forgot-password-btn'))

    await waitFor(() => {
      expect(requestPasswordResetMock).toHaveBeenCalledWith('reset-user@example.com')
    })
    expect(screen.getByText('如果该邮箱存在，我们已发送重置邮件。请按邮件提示设置新密码后再登录。')).toBeTruthy()
  })

  it('验证码发送失败时应在返回密码登录左侧展示错误', async () => {
    sendEmailOtpMock.mockRejectedValue(new Error('验证码发送失败，请稍后重试'))
    renderEntryAuthModal()
    fireEvent.click(screen.getByTestId('entry-auth-switch-otp-btn'))

    fireEvent.change(screen.getByTestId('entry-auth-email-input'), {
      target: { value: 'otp-error@example.com' },
    })
    fireEvent.click(screen.getByTestId('entry-auth-send-otp-btn'))

    await waitFor(() => {
      expect(sendEmailOtpMock).toHaveBeenCalledWith('otp-error@example.com')
    })
    await waitFor(() => {
      expect(screen.getByTestId('entry-auth-otp-inline-status').textContent).toBe('验证码发送失败，请稍后重试')
    })
    expect(screen.getAllByText('验证码发送失败，请稍后重试')).toHaveLength(1)
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
