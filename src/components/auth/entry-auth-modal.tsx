import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import {
  sendEmailOtp,
  verifyEmailOtp,
} from '../../services/supabase'

const OTP_COOLDOWN_SECONDS = 60
const OTP_COOLDOWN_STORAGE_KEY = 'trace-diary:entry-auth:otp-cooldown'
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const OTP_PATTERN = /^\d{6}$/

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
  session: Session | null
  cloudAuthEnabled: boolean
  onClose?: () => void
  onEnterGuest: () => void
  onChooseAuthFlow: () => void
}

export default function EntryAuthModal({
  open,
  canClose = false,
  session,
  cloudAuthEnabled,
  onClose,
  onEnterGuest,
  onChooseAuthFlow,
}: EntryAuthModalProps) {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSendingOtp, setIsSendingOtp] = useState(false)
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false)
  const [otpCooldownRemainingMs, setOtpCooldownRemainingMs] = useState(0)
  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email])
  const normalizedOtp = useMemo(() => otp.trim().replace(/\s+/g, ''), [otp])
  const otpCooldownSeconds = Math.ceil(otpCooldownRemainingMs / 1000)
  const isEmailValid = EMAIL_PATTERN.test(normalizedEmail)
  const isOtpValid = OTP_PATTERN.test(normalizedOtp)
  const canSendOtp = isEmailValid && otpCooldownRemainingMs <= 0 && !isSendingOtp
  const canVerifyOtp = isEmailValid && isOtpValid && !isVerifyingOtp

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
      setNotice('登录成功。系统将自动尝试恢复云端配置；你也可以前往设置页继续配置。')
      setOtp('')
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '验证码校验失败，请重试')
    } finally {
      setIsVerifyingOtp(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[#151311]/55 px-4 py-6 backdrop-blur-[2px] td-fade-in"
      aria-label="entry-auth-modal"
      data-testid="entry-auth-modal"
    >
      <article className="relative w-full max-w-[560px] overflow-hidden rounded-[20px] border border-[#dad3c7] bg-[#fffdfa] shadow-[0_24px_72px_rgba(24,20,16,0.32)]">
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
              <h2 className="text-[26px] leading-tight text-td-text sm:text-[30px]">登录 TraceDiary</h2>
            </header>

            {!cloudAuthEnabled ? (
              <p className="text-sm text-[#5f5b54]">当前未配置 Supabase，登录能力暂不可用。</p>
            ) : session ? (
              <div className="space-y-2">
                <p className="text-xs tracking-[0.06em] text-[#7c7467]">账号状态</p>
                <p className="text-base text-[#2c2925]">
                  已登录：<span className="font-semibold">{session.user.email ?? '未知邮箱'}</span>
                </p>
                <p className="text-sm text-[#6b655a]">系统会自动尝试恢复云端配置；你也可前往设置页继续绑定仓库。</p>
              </div>
            ) : (
              <div className="space-y-3">
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
                <button
                  type="button"
                  className="td-btn td-btn-primary-ink h-10"
                  onClick={() => void handleVerifyOtp()}
                  disabled={!canVerifyOtp}
                  data-testid="entry-auth-verify-otp-btn"
                >
                  {isVerifyingOtp ? '验证中...' : '登录 / 注册'}
                </button>
              </div>
            )}

            {notice ? (
              <p className="text-sm text-[#16643a]">{notice}</p>
            ) : null}
            {error ? (
              <p className="text-sm text-[#a63f3f]">{error}</p>
            ) : null}

            <div className="flex items-center justify-between border-t border-[#ece5d8] pt-4">
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
