import { useEffect, useMemo, useState } from 'react'
import AuthPanel from '../components/auth/auth-panel'
import AppHeader from '../components/common/app-header'
import ExportDataPanel from '../components/common/export-data-panel'
import ImportDataPanel from '../components/common/import-data-panel'
import type { UseAuthResult } from '../hooks/use-auth'
import {
  getSupabaseSession,
  isSupabaseConfigured,
  onSupabaseAuthStateChange,
  sendEmailOtp,
  signOutSupabase,
  verifyEmailOtp,
} from '../services/supabase'
import type { Session } from '@supabase/supabase-js'

interface SettingsPageProps {
  auth: UseAuthResult
}

export default function SettingsPage({ auth }: SettingsPageProps) {
  const currentYear = useMemo(() => new Date().getFullYear(), [])
  const [session, setSession] = useState<Session | null>(null)
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [cloudNotice, setCloudNotice] = useState<string | null>(null)
  const [cloudError, setCloudError] = useState<string | null>(null)
  const [isSendingOtp, setIsSendingOtp] = useState(false)
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false)
  const [isRestoringConfig, setIsRestoringConfig] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const cloudAuthEnabled = isSupabaseConfigured()

  useEffect(() => {
    if (!cloudAuthEnabled) {
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
  }, [cloudAuthEnabled])

  const handleSendOtp = async () => {
    setCloudError(null)
    setCloudNotice(null)
    setIsSendingOtp(true)
    try {
      await sendEmailOtp(email)
      setCloudNotice('验证码已发送，请检查邮箱并输入 6 位验证码完成登录。')
    } catch (error) {
      setCloudError(error instanceof Error ? error.message : '验证码发送失败，请稍后重试')
    } finally {
      setIsSendingOtp(false)
    }
  }

  const handleVerifyOtp = async () => {
    setCloudError(null)
    setCloudNotice(null)
    setIsVerifyingOtp(true)
    try {
      await verifyEmailOtp(email, otp)
      setCloudNotice('登录成功，可在当前设备恢复或同步你的配置。')
      setOtp('')
    } catch (error) {
      setCloudError(error instanceof Error ? error.message : '验证码校验失败，请重试')
    } finally {
      setIsVerifyingOtp(false)
    }
  }

  const handleRestoreCloudConfig = async () => {
    setCloudError(null)
    setCloudNotice(null)
    setIsRestoringConfig(true)
    try {
      await auth.restoreConfigFromCloud()
      setCloudNotice('已从云端恢复配置，请输入主密码完成解锁。')
    } catch (error) {
      setCloudError(error instanceof Error ? error.message : '云端恢复失败，请稍后重试')
    } finally {
      setIsRestoringConfig(false)
    }
  }

  const handleSignOut = async () => {
    setCloudError(null)
    setCloudNotice(null)
    setIsSigningOut(true)
    try {
      await signOutSupabase()
      setCloudNotice('已退出登录。')
      setSession(null)
    } catch (error) {
      setCloudError(error instanceof Error ? error.message : '退出失败，请稍后重试')
    } finally {
      setIsSigningOut(false)
    }
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 pb-4 sm:px-6">
      <AppHeader currentPage="settings" yearlyHref={`/yearly/${currentYear}`} />

      <section className="mt-4 space-y-4 td-fade-in" aria-label="settings-page">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-2xl text-td-text">设置</h2>
        </header>

        <article className="td-card-muted td-panel space-y-3" aria-label="cloud-auth-panel">
          <header>
            <h2 className="td-settings-section-title">账号（可选）</h2>
            <p className="td-settings-section-desc">
              先体验游客模式；若需要跨设备恢复配置，再登录邮箱账号。
            </p>
          </header>

          {!cloudAuthEnabled ? (
            <p className="text-sm text-td-muted">
              当前未配置 Supabase，登录功能已关闭。你仍可继续本地配置与使用。
            </p>
          ) : session ? (
            <div className="space-y-3">
              <p className="text-sm text-td-muted">
                当前登录：<span className="font-medium text-td-text">{session.user.email ?? '未知邮箱'}</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {auth.state.stage === 'needs-setup' ? (
                  <button
                    type="button"
                    className="td-btn td-btn-primary-ink"
                    onClick={() => void handleRestoreCloudConfig()}
                    disabled={isRestoringConfig}
                    data-testid="cloud-restore-config-btn"
                  >
                    {isRestoringConfig ? '恢复中...' : '从云端恢复配置'}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="td-btn"
                  onClick={() => void handleSignOut()}
                  disabled={isSigningOut}
                  data-testid="cloud-signout-btn"
                >
                  {isSigningOut ? '退出中...' : '退出登录'}
                </button>
              </div>
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
                  data-testid="cloud-auth-email-input"
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
                  data-testid="cloud-auth-otp-input"
                />
              </label>
              <div className="sm:col-span-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="td-btn td-btn-primary-ink"
                  onClick={() => void handleSendOtp()}
                  disabled={isSendingOtp}
                  data-testid="cloud-auth-send-otp-btn"
                >
                  {isSendingOtp ? '发送中...' : '发送验证码'}
                </button>
                <button
                  type="button"
                  className="td-btn"
                  onClick={() => void handleVerifyOtp()}
                  disabled={isVerifyingOtp}
                  data-testid="cloud-auth-verify-otp-btn"
                >
                  {isVerifyingOtp ? '校验中...' : '登录 / 注册'}
                </button>
              </div>
            </div>
          )}

          {cloudNotice ? <p className="text-sm text-emerald-700">{cloudNotice}</p> : null}
          {cloudError ? <p className="text-sm text-red-700">{cloudError}</p> : null}
        </article>

        <article className="td-card-muted td-panel space-y-4">
          <header>
            <h2 className="td-settings-section-title">同步设置</h2>
            <p className="td-settings-section-desc">更新仓库连接与凭证，保存后会立即校验。</p>
          </header>
          <AuthPanel auth={auth} variant="embedded" />
        </article>

        <article className="td-card-muted td-panel td-settings-data-card" aria-label="settings-data-panels">
          <header>
            <h2 className="td-settings-section-title">数据管理</h2>
            <p className="td-settings-section-desc">导入 Markdown 文本或导出明文备份。</p>
          </header>
          <div className="td-settings-data-stack">
            <ImportDataPanel auth={auth} variant="row" />
            <ExportDataPanel auth={auth} variant="row" />
          </div>
        </article>
      </section>
    </main>
  )
}
