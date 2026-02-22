import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import type { UseAuthResult } from '../../hooks/use-auth'
import {
  sendEmailOtp,
  verifyEmailOtp,
} from '../../services/supabase'

interface EntryAuthModalProps {
  open: boolean
  canClose?: boolean
  auth: UseAuthResult
  session: Session | null
  cloudAuthEnabled: boolean
  onClose?: () => void
  onEnterGuest: () => void
  onChooseAuthFlow: () => void
}

export default function EntryAuthModal({
  open,
  canClose = false,
  auth,
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
  const [isRestoringConfig, setIsRestoringConfig] = useState(false)
  const [otpStepActive, setOtpStepActive] = useState(false)

  if (!open) {
    return null
  }

  const handleSendOtp = async () => {
    setError(null)
    setNotice(null)
    setIsSendingOtp(true)
    try {
      await sendEmailOtp(email)
      setNotice('验证码已发送，请检查邮箱并输入 6 位验证码。')
      setOtpStepActive(true)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '验证码发送失败，请稍后重试')
    } finally {
      setIsSendingOtp(false)
    }
  }

  const handleVerifyOtp = async () => {
    setError(null)
    setNotice(null)
    setIsVerifyingOtp(true)
    try {
      await verifyEmailOtp(email, otp)
      setNotice('登录成功，可继续恢复云端配置。')
      setOtp('')
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '验证码校验失败，请重试')
    } finally {
      setIsVerifyingOtp(false)
    }
  }

  const handleRestoreCloudConfig = async () => {
    setError(null)
    setNotice(null)
    setIsRestoringConfig(true)
    try {
      await auth.restoreConfigFromCloud()
      setNotice('已从云端恢复配置，请输入主密码完成解锁。')
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '云端恢复失败，请稍后重试')
    } finally {
      setIsRestoringConfig(false)
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
              <section className="space-y-3 rounded-[14px] border border-[#e4ddd0] bg-[#faf6ee] p-4">
                <p className="text-sm text-[#5f5b54]">当前未配置 Supabase，登录能力暂不可用。</p>
              </section>
            ) : session ? (
              <section className="space-y-3 rounded-[14px] border border-[#dfd8cb] bg-white p-4">
                <p className="text-xs tracking-[0.06em] text-[#7c7467]">账号状态</p>
                <p className="text-base text-[#2c2925]">
                  已登录：<span className="font-semibold">{session.user.email ?? '未知邮箱'}</span>
                </p>
                {auth.state.stage === 'needs-setup' ? (
                  <button
                    type="button"
                    className="td-btn td-btn-primary-ink h-10"
                    onClick={() => void handleRestoreCloudConfig()}
                    disabled={isRestoringConfig}
                    data-testid="entry-auth-restore-config-btn"
                  >
                    {isRestoringConfig ? '恢复中...' : '从云端恢复配置'}
                  </button>
                ) : null}
              </section>
            ) : (
              <section className="space-y-3 rounded-[14px] border border-[#dfd8cb] bg-white p-4">
                <p className="text-xs tracking-[0.06em] text-[#7c7467]">{otpStepActive ? '第二步：输入验证码' : '第一步：输入邮箱'}</p>
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
                      setOtp('')
                      setOtpStepActive(false)
                    }}
                    data-testid="entry-auth-email-input"
                  />
                </label>

                {otpStepActive ? (
                  <>
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
                      className="td-btn td-btn-primary-ink h-10"
                      onClick={() => void handleVerifyOtp()}
                      disabled={isVerifyingOtp}
                      data-testid="entry-auth-verify-otp-btn"
                    >
                      {isVerifyingOtp ? '验证中...' : '登录并继续'}
                    </button>
                    <button
                      type="button"
                      className="text-left text-xs text-[#766f62] underline-offset-4 transition hover:text-[#2c2925] hover:underline"
                      onClick={() => void handleSendOtp()}
                      disabled={isSendingOtp}
                      data-testid="entry-auth-send-otp-btn"
                    >
                      {isSendingOtp ? '发送中...' : '重新发送验证码'}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="td-btn td-btn-primary-ink h-10"
                    onClick={() => void handleSendOtp()}
                    disabled={isSendingOtp}
                    data-testid="entry-auth-send-otp-btn"
                  >
                    {isSendingOtp ? '发送中...' : '发送验证码'}
                  </button>
                )}
              </section>
            )}

            {notice ? (
              <p className="rounded-[10px] border border-[#cde8d2] bg-[#f2fbf4] px-3 py-2 text-sm text-[#16643a]">{notice}</p>
            ) : null}
            {error ? (
              <p className="rounded-[10px] border border-[#f0c5c5] bg-[#fff4f4] px-3 py-2 text-sm text-[#a63f3f]">{error}</p>
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
