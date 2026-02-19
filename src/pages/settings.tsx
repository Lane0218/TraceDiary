import { useEffect, useMemo, useState } from 'react'
import AuthPanel from '../components/auth/auth-panel'
import AppHeader, { type AppHeaderAuthEntry } from '../components/common/app-header'
import ExportDataPanel from '../components/common/export-data-panel'
import ImportDataPanel from '../components/common/import-data-panel'
import type { UseAuthResult } from '../hooks/use-auth'
import {
  getSupabaseSession,
  isSupabaseConfigured,
  onSupabaseAuthStateChange,
  signOutSupabase,
} from '../services/supabase'
import type { Session } from '@supabase/supabase-js'

interface SettingsPageProps {
  auth: UseAuthResult
  headerAuthEntry?: AppHeaderAuthEntry
}

export default function SettingsPage({ auth, headerAuthEntry }: SettingsPageProps) {
  const currentYear = useMemo(() => new Date().getFullYear(), [])
  const [session, setSession] = useState<Session | null>(null)
  const [cloudNotice, setCloudNotice] = useState<string | null>(null)
  const [cloudError, setCloudError] = useState<string | null>(null)
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
      <AppHeader currentPage="settings" yearlyHref={`/yearly/${currentYear}`} authEntry={headerAuthEntry} />

      <section className="mt-4 space-y-4 td-fade-in" aria-label="settings-page">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-2xl text-td-text">设置</h2>
        </header>

        <article className="td-card-muted td-panel space-y-3" aria-label="cloud-auth-panel">
          <header>
            <h2 className="td-settings-section-title">账号（可选）</h2>
            <p className="td-settings-section-desc">
              登录入口已移动到首屏弹窗；本区仅展示账号状态与恢复/退出操作。
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
            <p className="text-sm text-td-muted">
              当前未登录。请返回首屏弹窗输入邮箱与 6 位验证码完成登录；登录后可在此恢复云端配置。
            </p>
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
