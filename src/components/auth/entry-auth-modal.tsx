import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  sendEmailOtp,
  signInWithEmailPassword,
  signInWithGitHub,
  signUpWithEmailPassword,
  verifyEmailOtp,
} from '../../services/supabase'

const OTP_COOLDOWN_SECONDS = 60
const OTP_COOLDOWN_STORAGE_KEY = 'trace-diary:entry-auth:otp-cooldown'
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const OTP_PATTERN = /^\d{6}$/
const MIN_PASSWORD_LENGTH = 8
const INVALID_CREDENTIALS_HINT = '邮箱或密码错误，请重试'
const ALREADY_REGISTERED_HINT = '该邮箱已注册，请直接登录'

type EntryAuthViewMode = 'password' | 'otp'

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
  onEnterGuest,
  onChooseAuthFlow,
}: EntryAuthModalProps) {
  const navigate = useNavigate()
  const [viewMode, setViewMode] = useState<EntryAuthViewMode>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showCreateAccountPrompt, setShowCreateAccountPrompt] = useState(false)
  const [isSigningInWithPassword, setIsSigningInWithPassword] = useState(false)
  const [isCreatingAccount, setIsCreatingAccount] = useState(false)
  const [isSigningInWithGitHub, setIsSigningInWithGitHub] = useState(false)
  const [isSendingOtp, setIsSendingOtp] = useState(false)
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false)
  const [otpCooldownRemainingMs, setOtpCooldownRemainingMs] = useState(0)
  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email])
  const normalizedOtp = useMemo(() => otp.trim().replace(/\s+/g, ''), [otp])
  const otpCooldownSeconds = Math.ceil(otpCooldownRemainingMs / 1000)
  const isEmailValid = EMAIL_PATTERN.test(normalizedEmail)
  const isOtpValid = OTP_PATTERN.test(normalizedOtp)
  const isPasswordValid = password.length >= MIN_PASSWORD_LENGTH
  const canSendOtp = isEmailValid && otpCooldownRemainingMs <= 0 && !isSendingOtp
  const canVerifyOtp = isEmailValid && isOtpValid && !isVerifyingOtp
  const canContinueWithPassword = isEmailValid && password.length > 0 && !isSigningInWithPassword && !isCreatingAccount
  const canCreateAccount = isEmailValid && isPasswordValid && !isSigningInWithPassword && !isCreatingAccount
  const isAnyAuthPending =
    isSigningInWithPassword || isCreatingAccount || isSigningInWithGitHub || isSendingOtp || isVerifyingOtp
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
    setError(null)
    setNotice(null)
    setIsVerifyingOtp(true)
    try {
      await verifyEmailOtp(normalizedEmail, normalizedOtp)
      setNotice('登录成功，正在进入。')
      setOtp('')
      onClose?.()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '验证码校验失败，请重试')
    } finally {
      setIsVerifyingOtp(false)
    }
  }

  const handlePasswordSignIn = async () => {
    if (!canContinueWithPassword) {
      return
    }
    setError(null)
    setNotice(null)
    setShowCreateAccountPrompt(false)
    setIsSigningInWithPassword(true)
    try {
      await signInWithEmailPassword(normalizedEmail, password)
      setNotice('登录成功，正在进入。')
      setPassword('')
      onClose?.()
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : '邮箱密码登录失败，请稍后重试'
      if (message.includes(INVALID_CREDENTIALS_HINT)) {
        setShowCreateAccountPrompt(true)
        setNotice('未登录成功。若你是首次使用，可创建新账号继续。')
        return
      }
      setError(message)
    } finally {
      setIsSigningInWithPassword(false)
    }
  }

  const handleCreateAccount = async () => {
    if (!canCreateAccount) {
      return
    }
    setError(null)
    setNotice(null)
    setIsCreatingAccount(true)
    try {
      const result = await signUpWithEmailPassword(normalizedEmail, password)
      setShowCreateAccountPrompt(false)
      if (result.needsEmailConfirmation) {
        setNotice('账号已创建，请先前往邮箱完成验证，再返回此处登录。')
        return
      }
      setNotice('注册并登录成功，正在进入。')
      setPassword('')
      onClose?.()
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : '邮箱密码注册失败，请稍后重试'
      if (message.includes(ALREADY_REGISTERED_HINT)) {
        setShowCreateAccountPrompt(false)
        setError('该邮箱已注册，当前密码不正确，请重新输入后再试。')
        return
      }
      setError(message)
    } finally {
      setIsCreatingAccount(false)
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
                    onChange={(event) => setEmail(event.target.value)}
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
                    <div className="flex justify-end">
                      <button
                        type="button"
                        className="w-fit text-sm text-[#5f594f] underline-offset-4 transition hover:text-[#2d2924] hover:underline"
                        onClick={() => {
                          if (isAnyAuthPending) {
                            return
                          }
                          setViewMode('otp')
                          setShowCreateAccountPrompt(false)
                          setNotice(null)
                          setError(null)
                        }}
                        data-testid="entry-auth-switch-otp-btn"
                      >
                        使用邮箱验证码
                      </button>
                    </div>
                    <button
                      type="button"
                      className="td-btn td-btn-primary-ink h-10"
                      onClick={() => void handlePasswordSignIn()}
                      disabled={!canContinueWithPassword}
                      data-testid="entry-auth-continue-password-btn"
                    >
                      {isSigningInWithPassword ? '继续中...' : '继续'}
                    </button>

                    {showCreateAccountPrompt ? (
                      <div
                        className="space-y-2 rounded-[12px] border border-[#d9d2c6] bg-[#f8f3ea] px-3 py-3"
                        data-testid="entry-auth-create-account-prompt"
                      >
                        <p className="text-sm text-[#594f40]">未登录成功，是否使用该邮箱创建新账号？</p>
                        <p className="text-xs text-[#7a7265]">创建账号需至少 {MIN_PASSWORD_LENGTH} 位密码。</p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <button
                            type="button"
                            className="td-btn td-btn-primary-ink h-9"
                            onClick={() => void handleCreateAccount()}
                            disabled={!canCreateAccount}
                            data-testid="entry-auth-create-account-btn"
                          >
                            {isCreatingAccount ? '创建中...' : '创建账号'}
                          </button>
                          <button
                            type="button"
                            className="td-btn h-9 border-[#d2ccc0] bg-[#fffcf7]"
                            onClick={() => {
                              setShowCreateAccountPrompt(false)
                              setNotice(null)
                            }}
                            disabled={isAnyAuthPending}
                            data-testid="entry-auth-retry-password-btn"
                          >
                            重新输入密码
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : (
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
                          onChange={(event) => setOtp(event.target.value)}
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
                    <div className="flex justify-end">
                      <button
                        type="button"
                        className="w-fit text-sm text-[#5f594f] underline-offset-4 transition hover:text-[#2d2924] hover:underline"
                        onClick={() => {
                          if (isAnyAuthPending) {
                            return
                          }
                          setViewMode('password')
                          setNotice(null)
                          setError(null)
                        }}
                        data-testid="entry-auth-switch-password-btn"
                      >
                        返回密码登录
                      </button>
                    </div>
                    <button
                      type="button"
                      className="td-btn td-btn-primary-ink h-10"
                      onClick={() => void handleVerifyOtp()}
                      disabled={!canVerifyOtp}
                      data-testid="entry-auth-verify-otp-btn"
                    >
                      {isVerifyingOtp ? '验证中...' : '继续'}
                    </button>
                  </>
                )}
              </div>
            )}

            {notice ? (
              <p className="text-sm text-[#16643a]">{notice}</p>
            ) : null}
            {error ? (
              <p className="text-sm text-[#a63f3f]">{error}</p>
            ) : null}

            <div className="flex items-center justify-between border-t border-[#ece5d8] pt-4">
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
              ) : (
                <span />
              )}
              <button
                type="button"
                className="text-sm font-medium text-[#2d2924] underline-offset-4 transition hover:underline"
                data-testid="entry-auth-guest-btn"
                onClick={onEnterGuest}
              >
                先以游客模式进入
              </button>
            </div>
          </section>
        </div>
      </article>
    </div>
  )
}
