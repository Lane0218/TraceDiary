import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  requestPasswordReset,
  sendEmailOtp,
  signInWithEmailPassword,
  signInWithGitHub,
  updateSupabasePassword,
  verifyEmailOtp,
} from '../../services/supabase'

const OTP_COOLDOWN_SECONDS = 60
const OTP_COOLDOWN_STORAGE_KEY = 'trace-diary:entry-auth:otp-cooldown'
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const OTP_PATTERN = /^\d{6}$/
const ACCOUNT_PASSWORD_MIN_LENGTH = 8

type EntryAuthViewMode = 'password' | 'otp' | 'setup-password'

function readOtpCooldownMap(): Record<string, number> {
  if (typeof window === 'undefined') {
    return {}
  }
  const raw = localStorage.getItem(OTP_COOLDOWN_STORAGE_KEY)
  if (!raw) {
    return {}
  }
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') {
      return {}
    }
    const result: Record<string, number> = {}
    for (const [email, expiresAt] of Object.entries(parsed)) {
      if (typeof expiresAt === 'number' && Number.isFinite(expiresAt)) {
        result[email] = expiresAt
      }
    }
    return result
  } catch {
    return {}
  }
}

function writeOtpCooldownMap(next: Record<string, number>): void {
  if (typeof window === 'undefined') {
    return
  }
  localStorage.setItem(OTP_COOLDOWN_STORAGE_KEY, JSON.stringify(next))
}

function getOtpCooldownRemainingMs(email: string): number {
  if (!email) {
    return 0
  }
  const cooldownMap = readOtpCooldownMap()
  const expiresAt = cooldownMap[email]
  if (!expiresAt) {
    return 0
  }
  return Math.max(0, expiresAt - Date.now())
}

function setOtpCooldown(email: string, expiresAt: number): void {
  const cooldownMap = readOtpCooldownMap()
  cooldownMap[email] = expiresAt
  writeOtpCooldownMap(cooldownMap)
}

interface EntryAuthModalProps {
  open: boolean
  canClose?: boolean
  cloudAuthEnabled: boolean
  onClose?: () => void
  onLockOpenForAuthTransition?: () => void
  onEnterGuest: () => void
  onChooseAuthFlow: () => void
}

function GitHubMarkIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4 fill-current">
      <path d="M8 0C3.58 0 0 3.58 0 8a8.01 8.01 0 0 0 5.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.58.82-2.14-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.57 7.57 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.14 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  )
}

export default function EntryAuthModal({
  open,
  canClose = false,
  cloudAuthEnabled,
  onClose,
  onLockOpenForAuthTransition,
  onEnterGuest,
  onChooseAuthFlow,
}: EntryAuthModalProps) {
  const navigate = useNavigate()
  const [viewMode, setViewMode] = useState<EntryAuthViewMode>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [setupPassword, setSetupPassword] = useState('')
  const [setupPasswordConfirm, setSetupPasswordConfirm] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSigningInWithPassword, setIsSigningInWithPassword] = useState(false)
  const [isSigningInWithGitHub, setIsSigningInWithGitHub] = useState(false)
  const [isSendingOtp, setIsSendingOtp] = useState(false)
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false)
  const [isSendingPasswordReset, setIsSendingPasswordReset] = useState(false)
  const [isSettingUpPassword, setIsSettingUpPassword] = useState(false)
  const [otpCooldownRemainingMs, setOtpCooldownRemainingMs] = useState(0)
  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email])
  const normalizedOtp = useMemo(() => otp.trim().replace(/\s+/g, ''), [otp])
  const normalizedSetupPassword = useMemo(() => setupPassword.trim(), [setupPassword])
  const normalizedSetupPasswordConfirm = useMemo(() => setupPasswordConfirm.trim(), [setupPasswordConfirm])
  const otpCooldownSeconds = Math.ceil(otpCooldownRemainingMs / 1000)
  const isEmailValid = EMAIL_PATTERN.test(normalizedEmail)
  const isOtpValid = OTP_PATTERN.test(normalizedOtp)
  const canSendOtp = isEmailValid && otpCooldownRemainingMs <= 0 && !isSendingOtp
  const canVerifyOtp = isEmailValid && isOtpValid && !isVerifyingOtp
  const canContinueWithPassword = isEmailValid && password.length > 0 && !isSigningInWithPassword
  const canRequestPasswordReset = isEmailValid && !isSendingPasswordReset
  const isSetupPasswordLengthValid = normalizedSetupPassword.length >= ACCOUNT_PASSWORD_MIN_LENGTH
  const isSetupPasswordConfirmValid =
    normalizedSetupPasswordConfirm.length > 0 && normalizedSetupPasswordConfirm === normalizedSetupPassword
  const canSubmitSetupPassword =
    isSetupPasswordLengthValid && isSetupPasswordConfirmValid && !isSettingUpPassword
  const otpInlineStatus = viewMode === 'otp' ? (error ?? notice) : null
  const isAnyAuthPending =
    isSigningInWithPassword
    || isSigningInWithGitHub
    || isSendingOtp
    || isVerifyingOtp
    || isSendingPasswordReset
    || isSettingUpPassword
  const shouldShowGoSettings = !cloudAuthEnabled

  useEffect(() => {
    if (!open || !normalizedEmail) {
      setOtpCooldownRemainingMs(0)
      return
    }
    const syncCooldown = () => {
      setOtpCooldownRemainingMs(getOtpCooldownRemainingMs(normalizedEmail))
    }
    syncCooldown()
    const timer = window.setInterval(syncCooldown, 1000)
    return () => {
      window.clearInterval(timer)
    }
  }, [normalizedEmail, open])

  if (!open) {
    return null
  }

  const resetOtpFlow = () => {
    setOtp('')
  }

  const resetSetupPasswordFlow = () => {
    setSetupPassword('')
    setSetupPasswordConfirm('')
  }

  const switchToPasswordLogin = () => {
    if (isAnyAuthPending || viewMode === 'setup-password') {
      return
    }
    setViewMode('password')
    resetOtpFlow()
    resetSetupPasswordFlow()
    setNotice(null)
    setError(null)
  }

  const switchToOtpLogin = () => {
    if (isAnyAuthPending || viewMode === 'setup-password') {
      return
    }
    setViewMode('otp')
    resetOtpFlow()
    resetSetupPasswordFlow()
    setNotice(null)
    setError(null)
  }

  const handleSendOtp = async () => {
    if (!canSendOtp) {
      return
    }
    setError(null)
    setNotice(null)
    setIsSendingOtp(true)
    try {
      await sendEmailOtp(normalizedEmail)
      const expiresAt = Date.now() + OTP_COOLDOWN_SECONDS * 1000
      setOtpCooldown(normalizedEmail, expiresAt)
      setOtpCooldownRemainingMs(OTP_COOLDOWN_SECONDS * 1000)
      setNotice('验证码已发送，请检查邮箱。')
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '验证码发送失败，请稍后重试')
    } finally {
      setIsSendingOtp(false)
    }
  }

  const handleVerifyOtp = async () => {
    if (!canVerifyOtp) {
      return
    }
    onLockOpenForAuthTransition?.()
    setError(null)
    setNotice(null)
    setIsVerifyingOtp(true)
    try {
      const verifyResult = await verifyEmailOtp(normalizedEmail, normalizedOtp)
      setOtp('')
      if (verifyResult.isNewUser) {
        resetSetupPasswordFlow()
        setViewMode('setup-password')
        setNotice(null)
        return
      }
      setNotice('登录成功，正在进入。')
      onClose?.()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '验证码校验失败，请重试')
    } finally {
      setIsVerifyingOtp(false)
    }
  }

  const handleSubmitSetupPassword = async () => {
    if (isAnyAuthPending || !canSubmitSetupPassword) {
      return
    }
    setIsSettingUpPassword(true)
    setNotice(null)
    setError(null)
    try {
      await updateSupabasePassword(normalizedSetupPassword)
      setNotice('密码设置成功，正在进入。')
      onClose?.()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '密码设置失败，请稍后重试')
    } finally {
      setIsSettingUpPassword(false)
    }
  }

  const handleSkipSetPassword = () => {
    if (isAnyAuthPending || viewMode !== 'setup-password') {
      return
    }
    setViewMode('password')
    resetSetupPasswordFlow()
    setNotice('登录成功，正在进入。')
    setError(null)
    onClose?.()
  }

  const handleRequestPasswordReset = async () => {
    if (!isEmailValid || !canRequestPasswordReset) {
      setError('请先填写有效邮箱地址')
      return
    }
    setError(null)
    setNotice(null)
    setIsSendingPasswordReset(true)
    try {
      await requestPasswordReset(normalizedEmail)
      setNotice('如果该邮箱存在，我们已发送重置邮件。请按邮件提示设置新密码后再登录。')
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '重置邮件发送失败，请稍后重试')
    } finally {
      setIsSendingPasswordReset(false)
    }
  }

  const handlePasswordSignIn = async () => {
    if (!canContinueWithPassword) {
      return
    }
    setError(null)
    setNotice(null)
    setIsSigningInWithPassword(true)
    try {
      await signInWithEmailPassword(normalizedEmail, password)
      setNotice('登录成功，正在进入。')
      setPassword('')
      onClose?.()
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : '邮箱密码登录失败，请稍后重试'
      setError(message)
    } finally {
      setIsSigningInWithPassword(false)
    }
  }

  const handleGitHubSignIn = async () => {
    if (isAnyAuthPending) {
      return
    }
    setError(null)
    setNotice(null)
    setIsSigningInWithGitHub(true)
    try {
      setNotice('正在跳转 GitHub...')
      await signInWithGitHub()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'GitHub 登录发起失败，请稍后重试')
    } finally {
      setIsSigningInWithGitHub(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[#151311]/55 px-4 py-6 backdrop-blur-[2px] td-fade-in"
      aria-label="entry-auth-modal"
      data-testid="entry-auth-modal"
    >
      <article className="relative w-full max-w-[560px] max-h-[calc(100vh-1.5rem)] overflow-y-auto rounded-[20px] border border-[#dad3c7] bg-[#fffdfa] shadow-[0_24px_72px_rgba(24,20,16,0.32)]">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(203,185,156,0.22),transparent_52%)]"
          aria-hidden="true"
        />
        <div className="relative px-5 py-5 sm:px-7 sm:py-6">
          {canClose ? (
            <button
              type="button"
              className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#d9d2c7] bg-white text-[#6f665a] transition hover:bg-[#f6f1e8]"
              onClick={onClose}
              aria-label="关闭登录弹窗"
              data-testid="entry-auth-close-btn"
            >
              ×
            </button>
          ) : null}

          <section className="space-y-4">
            <header className="border-b border-[#ece5d8] pb-4">
              <h2 className="text-[26px] leading-tight text-td-text sm:text-[30px]">继续使用 TraceDiary</h2>
              <p className="mt-2 text-sm text-[#6c6459]">首次使用将自动引导完成账号创建与配置。</p>
            </header>

            {!cloudAuthEnabled ? (
              <p className="text-sm text-[#5f5b54]">当前未配置 Supabase，登录能力暂不可用。</p>
            ) : (
              <div className="space-y-3">
                <button
                  type="button"
                  className="td-btn td-btn-primary-ink h-10 w-full border border-[#2d2924]"
                  onClick={() => void handleGitHubSignIn()}
                  disabled={isAnyAuthPending}
                  data-testid="entry-auth-github-btn"
                >
                  <span className="inline-flex items-center gap-2">
                    <GitHubMarkIcon />
                    {isSigningInWithGitHub ? '跳转中...' : '使用 GitHub 继续'}
                  </span>
                </button>
                <div className="relative py-1">
                  <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-[#e4ddcf]" aria-hidden="true" />
                  <span className="relative mx-auto block w-fit bg-[#fffdfa] px-2 text-xs text-[#8b8275]">或</span>
                </div>
                <label className="flex flex-col gap-1 text-sm text-[#6a6357]">
                  邮箱
                  <input
                    type="email"
                    className="td-input border-[#dad3c6] bg-[#fffcf7]"
                    placeholder="name@example.com"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value)
                      setError(null)
                    }}
                    data-testid="entry-auth-email-input"
                  />
                </label>

                {viewMode === 'password' ? (
                  <>
                    <label className="flex flex-col gap-1 text-sm text-[#6a6357]">
                      密码
                      <input
                        type="password"
                        className="td-input border-[#dad3c6] bg-[#fffcf7]"
                        placeholder="输入账号密码"
                        autoComplete="current-password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        data-testid="entry-auth-password-input"
                      />
                    </label>
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        className="w-fit text-sm text-[#5f594f] underline-offset-4 transition hover:text-[#2d2924] hover:underline"
                        onClick={() => void handleRequestPasswordReset()}
                        disabled={!canRequestPasswordReset}
                        data-testid="entry-auth-forgot-password-btn"
                      >
                        {isSendingPasswordReset ? '发送中...' : '忘记密码'}
                      </button>
                      <button
                        type="button"
                        className="w-fit text-sm text-[#5f594f] underline-offset-4 transition hover:text-[#2d2924] hover:underline"
                        onClick={switchToOtpLogin}
                        data-testid="entry-auth-switch-otp-btn"
                      >
                        使用邮箱验证码登录
                      </button>
                    </div>
                    <button
                      type="button"
                      className="td-btn td-btn-primary-ink h-11 w-full text-base"
                      onClick={() => void handlePasswordSignIn()}
                      disabled={!canContinueWithPassword}
                      data-testid="entry-auth-continue-password-btn"
                    >
                      {isSigningInWithPassword ? '继续中...' : '继续'}
                    </button>
                  </>
                ) : null}

                {viewMode === 'otp' ? (
                  <>
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_148px] sm:items-end">
                      <label className="flex flex-col gap-1 text-sm text-[#6a6357]">
                        验证码
                        <input
                          type="text"
                          className="td-input border-[#dad3c6] bg-[#fffcf7]"
                          placeholder="6 位验证码"
                          autoComplete="one-time-code"
                          value={otp}
                          onChange={(event) => {
                            setOtp(event.target.value)
                          }}
                          data-testid="entry-auth-otp-input"
                        />
                      </label>
                      <button
                        type="button"
                        className="td-btn h-10 border-[#d2ccc0] bg-[#f9f7f2]"
                        onClick={() => void handleSendOtp()}
                        disabled={!canSendOtp}
                        data-testid="entry-auth-send-otp-btn"
                      >
                        {isSendingOtp ? '发送中...' : otpCooldownSeconds > 0 ? `${otpCooldownSeconds}s 后重发` : '发送验证码'}
                      </button>
                    </div>
                    <div className="flex min-h-[20px] items-center gap-3">
                      <p
                        className={`flex-1 text-xs ${error ? 'text-[#a63f3f]' : 'text-[#16643a]'}`}
                        data-testid="entry-auth-otp-inline-status"
                      >
                        {otpInlineStatus ?? ''}
                      </p>
                      <button
                        type="button"
                        className="w-fit text-sm text-[#5f594f] underline-offset-4 transition hover:text-[#2d2924] hover:underline"
                        onClick={switchToPasswordLogin}
                        data-testid="entry-auth-switch-password-btn"
                      >
                        返回密码登录
                      </button>
                    </div>
                    <button
                      type="button"
                      className="td-btn td-btn-primary-ink h-11 w-full text-base"
                      onClick={() => void handleVerifyOtp()}
                      disabled={!canVerifyOtp}
                      data-testid="entry-auth-verify-otp-btn"
                    >
                      {isVerifyingOtp ? '验证中...' : '继续'}
                    </button>
                  </>
                ) : null}

                {viewMode === 'setup-password' ? (
                  <div className="space-y-3" data-testid="entry-auth-password-setup-view">
                    <div className="rounded-[14px] border border-[#ddd5c8] bg-[#f9f5ed] px-3 py-3 text-sm text-[#5d5548]">
                      首次注册成功。请设置登录密码，后续可直接使用邮箱密码登录。
                    </div>
                    <label className="flex flex-col gap-1 text-sm text-[#6a6357]">
                      新密码
                      <input
                        type="password"
                        className="td-input border-[#dad3c6] bg-[#fffcf7]"
                        placeholder="至少 8 位，建议包含字母和数字"
                        autoComplete="new-password"
                        value={setupPassword}
                        onChange={(event) => {
                          setSetupPassword(event.target.value)
                          setError(null)
                        }}
                        data-testid="entry-auth-setup-password-input"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm text-[#6a6357]">
                      确认密码
                      <input
                        type="password"
                        className="td-input border-[#dad3c6] bg-[#fffcf7]"
                        placeholder="再次输入密码"
                        autoComplete="new-password"
                        value={setupPasswordConfirm}
                        onChange={(event) => {
                          setSetupPasswordConfirm(event.target.value)
                          setError(null)
                        }}
                        data-testid="entry-auth-setup-password-confirm-input"
                      />
                    </label>
                    {!isSetupPasswordLengthValid && normalizedSetupPassword.length > 0 ? (
                      <p className="text-xs text-[#a63f3f]">密码至少需要 8 位。</p>
                    ) : null}
                    {normalizedSetupPasswordConfirm.length > 0 && !isSetupPasswordConfirmValid ? (
                      <p className="text-xs text-[#a63f3f]">两次输入的密码不一致。</p>
                    ) : null}
                    <button
                      type="button"
                      className="td-btn td-btn-primary-ink h-11 w-full text-base"
                      onClick={() => void handleSubmitSetupPassword()}
                      disabled={!canSubmitSetupPassword}
                      data-testid="entry-auth-submit-set-password-btn"
                    >
                      {isSettingUpPassword ? '设置中...' : '设置密码并继续'}
                    </button>
                    <button
                      type="button"
                      className="w-full text-sm text-[#5f594f] underline-offset-4 transition hover:text-[#2d2924] hover:underline"
                      onClick={handleSkipSetPassword}
                      data-testid="entry-auth-skip-set-password-btn"
                    >
                      先跳过，稍后设置
                    </button>
                    {notice ? <p className="text-sm text-[#16643a]">{notice}</p> : null}
                    {error ? <p className="text-sm text-[#a63f3f]">{error}</p> : null}
                  </div>
                ) : null}
              </div>
            )}

            {notice && viewMode === 'password' ? (
              <p className="text-sm text-[#16643a]">{notice}</p>
            ) : null}
            {error && viewMode === 'password' ? (
              <p className="text-sm text-[#a63f3f]">{error}</p>
            ) : null}

            {viewMode !== 'setup-password' ? (
              <div className="flex items-center justify-between border-t border-[#ece5d8] pt-4">
                <button
                  type="button"
                  className="text-sm font-medium text-[#2d2924] underline-offset-4 transition hover:underline"
                  data-testid="entry-auth-guest-btn"
                  onClick={onEnterGuest}
                >
                  先以游客模式进入
                </button>
                {shouldShowGoSettings ? (
                  <button
                    type="button"
                    className="text-sm text-[#5f594f] underline-offset-4 transition hover:text-[#2d2924] hover:underline"
                    data-testid="entry-auth-go-settings-btn"
                    onClick={() => {
                      onChooseAuthFlow()
                      navigate('/settings')
                    }}
                  >
                    去设置页继续配置
                  </button>
                ) : cloudAuthEnabled && viewMode === 'password' ? (
                  <button
                    type="button"
                    className="text-sm text-[#5f594f] underline-offset-4 transition hover:text-[#2d2924] hover:underline"
                    onClick={switchToOtpLogin}
                    data-testid="entry-auth-go-register-btn"
                  >
                    还没有账号？点击注册
                  </button>
                ) : (
                  <span />
                )}
              </div>
            ) : null}
          </section>
        </div>
      </article>
    </div>
  )
}
