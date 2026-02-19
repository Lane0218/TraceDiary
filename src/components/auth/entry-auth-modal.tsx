import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import type { UseAuthResult } from '../../hooks/use-auth'
import {
  getSupabaseSession,
  isSupabaseConfigured,
  onSupabaseAuthStateChange,
  sendEmailOtp,
  verifyEmailOtp,
} from '../../services/supabase'

interface EntryAuthModalProps {
  open: boolean
  auth: UseAuthResult
  onEnterGuest: () => void
  onChooseAuthFlow: () => void
}

export default function EntryAuthModal({ open, auth, onEnterGuest, onChooseAuthFlow }: EntryAuthModalProps) {
  const navigate = useNavigate()
  const [session, setSession] = useState<Session | null>(null)
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSendingOtp, setIsSendingOtp] = useState(false)
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false)
  const [isRestoringConfig, setIsRestoringConfig] = useState(false)
  const cloudAuthEnabled = isSupabaseConfigured()

  useEffect(() => {
    if (!open || !cloudAuthEnabled) {
      return
    }

    let cancelled = false
    void getSupabaseSession()
      .then((nextSession) => {
        if (!cancelled) {
          setSession(nextSession)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSession(null)
        }
      })

    const unsubscribe = onSupabaseAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })

    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [cloudAuthEnabled, open])

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
      setNotice('登录成功。你可以立即从云端恢复配置，或前往设置页继续配置。')
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
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 px-4 py-6 backdrop-blur-sm td-fade-in"
      aria-label="entry-auth-modal"
      data-testid="entry-auth-modal"
    >
      <article className="td-card w-full max-w-xl bg-td-bg shadow-card">
        <header className="border-b border-td-line px-4 py-3 sm:px-5">
          <h2 className="text-xl text-td-text">开始使用 TraceDiary</h2>
          <p className="mt-1 text-sm text-td-muted">你可以先登录/注册并恢复云端配置，或先以游客模式体验。</p>
        </header>

        <section className="space-y-3 px-4 py-4 sm:px-5 sm:py-5">
          {!cloudAuthEnabled ? (
            <p className="text-sm text-td-muted">
              当前未配置 Supabase，登录功能已关闭。你仍可继续本地配置与使用。
            </p>
          ) : session ? (
            <div className="space-y-2">
              <p className="text-sm text-td-muted">
                当前登录：<span className="font-medium text-td-text">{session.user.email ?? '未知邮箱'}</span>
              </p>
              {auth.state.stage === 'needs-setup' ? (
                <button
                  type="button"
                  className="td-btn td-btn-primary-ink"
                  onClick={() => void handleRestoreCloudConfig()}
                  disabled={isRestoringConfig}
                  data-testid="entry-auth-restore-config-btn"
                >
                  {isRestoringConfig ? '恢复中...' : '从云端恢复配置'}
                </button>
              ) : null}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm text-td-muted">
                邮箱
                <input
                  type="email"
                  className="td-input"
                  placeholder="name@example.com"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  data-testid="entry-auth-email-input"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-td-muted">
                验证码
                <input
                  type="text"
                  className="td-input"
                  placeholder="6 位验证码"
                  autoComplete="one-time-code"
                  value={otp}
                  onChange={(event) => setOtp(event.target.value)}
                  data-testid="entry-auth-otp-input"
                />
              </label>
              <div className="sm:col-span-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="td-btn td-btn-primary-ink"
                  onClick={() => void handleSendOtp()}
                  disabled={isSendingOtp}
                  data-testid="entry-auth-send-otp-btn"
                >
                  {isSendingOtp ? '发送中...' : '发送验证码'}
                </button>
                <button
                  type="button"
                  className="td-btn"
                  onClick={() => void handleVerifyOtp()}
                  disabled={isVerifyingOtp}
                  data-testid="entry-auth-verify-otp-btn"
                >
                  {isVerifyingOtp ? '校验中...' : '登录 / 注册'}
                </button>
              </div>
            </div>
          )}

          {notice ? <p className="text-sm text-emerald-700">{notice}</p> : null}
          {error ? <p className="text-sm text-red-700">{error}</p> : null}

          <div className="flex flex-wrap gap-2 border-t border-td-line pt-3">
            <button
              type="button"
              className="td-btn td-btn-primary-ink"
              data-testid="entry-auth-go-settings-btn"
              onClick={() => {
                onChooseAuthFlow()
                navigate('/settings')
              }}
            >
              去设置页登录 / 配置
            </button>
            <button
              type="button"
              className="td-btn"
              data-testid="entry-auth-guest-btn"
              onClick={onEnterGuest}
            >
              以游客身份访问
            </button>
          </div>
        </section>
      </article>
    </div>
  )
}
