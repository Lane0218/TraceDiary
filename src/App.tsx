import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import EntryAuthModal from './components/auth/entry-auth-modal'
import type { AppHeaderAuthEntry } from './components/common/app-header'
import { useAuth } from './hooks/use-auth'
import { ToastProvider, useToast } from './hooks/use-toast'
import InsightsPage from './pages/insights'
import DiaryPage from './pages/diary'
import SettingsPage from './pages/settings'
import YearlySummaryPage from './pages/yearly-summary'
import AuthResetPasswordPage from './pages/auth-reset-password'
import ToastCenter from './components/common/toast-center'
import {
  getSupabaseSession,
  isSupabaseConfigured,
  onSupabaseAuthStateChange,
  signOutSupabase,
} from './services/supabase'

const GUEST_ENTRY_PREFERENCE_KEY = 'trace-diary:entry-preference'
const CLOUD_RESTORE_HANDLED_KEY_PREFIX = 'trace-diary:cloud-restore-handled:'

function readGuestEntryPreference(): boolean {
  if (typeof window === 'undefined') {
    return false
  }
  return localStorage.getItem(GUEST_ENTRY_PREFERENCE_KEY) === 'guest'
}

function saveGuestEntryPreference(value: boolean): void {
  if (typeof window === 'undefined') {
    return
  }
  if (value) {
    localStorage.setItem(GUEST_ENTRY_PREFERENCE_KEY, 'guest')
    return
  }
  localStorage.removeItem(GUEST_ENTRY_PREFERENCE_KEY)
}

function buildCloudRestoreHandledKey(userId: string): string {
  return `${CLOUD_RESTORE_HANDLED_KEY_PREFIX}${userId}`
}

function hasHandledCloudRestore(userId: string): boolean {
  if (typeof window === 'undefined') {
    return false
  }
  return window.sessionStorage.getItem(buildCloudRestoreHandledKey(userId)) === '1'
}

function markCloudRestoreHandled(userId: string, handled: boolean): void {
  if (typeof window === 'undefined') {
    return
  }
  const key = buildCloudRestoreHandledKey(userId)
  if (handled) {
    window.sessionStorage.setItem(key, '1')
    return
  }
  window.sessionStorage.removeItem(key)
}

function YearlySummaryRedirect() {
  const location = useLocation()
  const query = new URLSearchParams(location.search)
  const parsedYear = Number.parseInt(query.get('year') ?? '', 10)
  const currentYear = new Date().getFullYear()
  const targetYear =
    Number.isFinite(parsedYear) && parsedYear >= 1970 && parsedYear <= 9999
      ? parsedYear
      : currentYear

  return <Navigate to={`/yearly/${targetYear}`} replace />
}

function AppRoutes() {
  const auth = useAuth()
  const { push: pushToast } = useToast()
  const location = useLocation()
  const [guestEntrySelected, setGuestEntrySelected] = useState<boolean>(readGuestEntryPreference)
  const [manualEntryModalOpen, setManualEntryModalOpen] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [pendingCloudRestoreUserId, setPendingCloudRestoreUserId] = useState<string | null>(null)
  const [cloudOverwritePromptUserId, setCloudOverwritePromptUserId] = useState<string | null>(null)
  const [isApplyingCloudConfig, setIsApplyingCloudConfig] = useState(false)
  const lastSessionUserIdRef = useRef<string | null>(null)
  const cloudAuthEnabled = isSupabaseConfigured()
  const sessionUserId = session?.user.id ?? null
  const blocksAutoEntryModal = location.pathname.startsWith('/settings') || location.pathname.startsWith('/auth/reset-password')
  const autoEntryModalOpen =
    !blocksAutoEntryModal && auth.state.stage === 'needs-setup' && !guestEntrySelected && !sessionUserId
  const entryModalOpen = manualEntryModalOpen || autoEntryModalOpen
  const canCloseEntryModal = manualEntryModalOpen && !autoEntryModalOpen

  useEffect(() => {
    if (manualEntryModalOpen) {
      return
    }
    if (auth.state.stage === 'needs-setup' || auth.state.stage === 'checking') {
      return
    }
    setGuestEntrySelected(false)
    saveGuestEntryPreference(false)
    setManualEntryModalOpen(false)
  }, [auth.state.stage, manualEntryModalOpen])

  useEffect(() => {
    if (!cloudAuthEnabled) {
      setSession(null)
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

  useEffect(() => {
    if (!sessionUserId) {
      lastSessionUserIdRef.current = null
      setPendingCloudRestoreUserId(null)
      setCloudOverwritePromptUserId(null)
      return
    }

    if (lastSessionUserIdRef.current === sessionUserId) {
      return
    }
    lastSessionUserIdRef.current = sessionUserId

    if (hasHandledCloudRestore(sessionUserId)) {
      return
    }
    setPendingCloudRestoreUserId(sessionUserId)
  }, [sessionUserId])

  useEffect(() => {
    if (!cloudAuthEnabled || !sessionUserId || pendingCloudRestoreUserId !== sessionUserId) {
      return
    }
    if (auth.state.stage === 'checking') {
      return
    }
    // 登录/注册流程进行中（含首登设置密码）时，延后本地覆盖确认，避免弹窗互相遮挡。
    if (entryModalOpen) {
      return
    }
    // Token 刷新阶段优先完成认证流程，避免与本地覆盖确认弹窗并发。
    if (auth.state.stage === 'needs-token-refresh') {
      return
    }

    if (auth.state.stage === 'needs-setup') {
      setIsApplyingCloudConfig(true)
      void auth
        .restoreConfigFromCloud()
        .then(() => {
          pushToast({
            kind: 'system',
            level: 'success',
            message: '已自动应用云端配置，请输入主密码完成解锁。',
          })
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : '云端配置自动恢复失败'
          if (!message.includes('云端尚无可恢复的配置')) {
            pushToast({
              kind: 'system',
              level: 'warning',
              message: `云端配置自动恢复失败：${message}`,
            })
          }
        })
        .finally(() => {
          markCloudRestoreHandled(sessionUserId, true)
          setPendingCloudRestoreUserId(null)
          setIsApplyingCloudConfig(false)
        })
      return
    }

    setCloudOverwritePromptUserId(sessionUserId)
    setPendingCloudRestoreUserId(null)
  }, [auth, auth.state.stage, cloudAuthEnabled, entryModalOpen, pendingCloudRestoreUserId, pushToast, sessionUserId])

  const openEntryModal = useCallback(() => {
    setManualEntryModalOpen(true)
  }, [])

  const closeEntryModal = useCallback(() => {
    setManualEntryModalOpen(false)
  }, [])

  const signOutCurrentSession = useCallback(async (): Promise<boolean> => {
    if (!cloudAuthEnabled) {
      return true
    }
    setIsSigningOut(true)
    try {
      await signOutSupabase()
      if (sessionUserId) {
        markCloudRestoreHandled(sessionUserId, false)
      }
      return true
    } catch (error) {
      console.error('Supabase 退出登录失败', error)
      return false
    } finally {
      setIsSigningOut(false)
    }
  }, [cloudAuthEnabled, sessionUserId])

  const handleSignOut = useCallback(() => {
    void signOutCurrentSession()
  }, [signOutCurrentSession])

  const handleKeepLocalConfig = useCallback(() => {
    if (!cloudOverwritePromptUserId) {
      return
    }
    markCloudRestoreHandled(cloudOverwritePromptUserId, true)
    setCloudOverwritePromptUserId(null)
    pushToast({
      kind: 'system',
      level: 'info',
      message: '已保留当前设备本地配置。',
    })
  }, [cloudOverwritePromptUserId, pushToast])

  const handleUseCloudConfig = useCallback(() => {
    if (!cloudOverwritePromptUserId) {
      return
    }
    const targetUserId = cloudOverwritePromptUserId
    setCloudOverwritePromptUserId(null)
    setIsApplyingCloudConfig(true)
    void auth
      .restoreConfigFromCloud()
      .then(() => {
        pushToast({
          kind: 'system',
          level: 'success',
          message: '已切换为云端配置，请输入主密码完成解锁。',
        })
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : '云端配置应用失败'
        pushToast({
          kind: 'system',
          level: 'warning',
          message: `云端配置应用失败：${message}`,
        })
      })
      .finally(() => {
        markCloudRestoreHandled(targetUserId, true)
        setIsApplyingCloudConfig(false)
      })
  }, [auth, cloudOverwritePromptUserId, pushToast])

  const headerAuthEntry = useMemo<AppHeaderAuthEntry>(
    () => ({
      sessionEmail: session?.user.email ?? null,
      isSigningOut,
      onOpenAuthModal: openEntryModal,
      onSignOut: handleSignOut,
    }),
    [handleSignOut, isSigningOut, openEntryModal, session?.user.email],
  )

  return (
    <>
      <Routes>
        <Route index element={<Navigate to="/diary" replace />} />
        <Route path="/diary" element={<DiaryPage auth={auth} headerAuthEntry={headerAuthEntry} />} />
        <Route
          path="/yearly/:year?"
          element={<YearlySummaryPage auth={auth} headerAuthEntry={headerAuthEntry} />}
        />
        <Route path="/insights" element={<InsightsPage auth={auth} headerAuthEntry={headerAuthEntry} />} />
        <Route path="/settings" element={<SettingsPage auth={auth} headerAuthEntry={headerAuthEntry} />} />
        <Route path="/auth/reset-password" element={<AuthResetPasswordPage />} />
        <Route path="/welcome" element={<Navigate to="/diary" replace />} />
        <Route path="/yearly-summary" element={<YearlySummaryRedirect />} />
        <Route path="*" element={<Navigate to="/diary" replace />} />
      </Routes>
      <EntryAuthModal
        open={entryModalOpen}
        canClose={canCloseEntryModal}
        cloudAuthEnabled={cloudAuthEnabled}
        onClose={closeEntryModal}
        onLockOpenForAuthTransition={() => {
          setManualEntryModalOpen(true)
        }}
        onEnterGuest={() => {
          setGuestEntrySelected(true)
          saveGuestEntryPreference(true)
          setManualEntryModalOpen(false)
        }}
        onChooseAuthFlow={() => {
          setGuestEntrySelected(false)
          saveGuestEntryPreference(false)
          setManualEntryModalOpen(false)
        }}
      />
      {cloudOverwritePromptUserId ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-[#151311]/55 px-4 py-6 backdrop-blur-[2px]"
          aria-label="cloud-config-overwrite-modal"
          data-testid="cloud-config-overwrite-modal"
        >
          <article className="w-full max-w-md rounded-[16px] border border-[#d9d2c6] bg-[#fffdfa] p-5 shadow-[0_20px_60px_rgba(22,18,14,0.28)]">
            <h3 className="text-lg text-td-text">检测到本地已有配置</h3>
            <p className="mt-2 text-sm text-td-muted">
              当前设备已存在本地同步配置。是否改用云端配置并覆盖本地？
            </p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="td-btn"
                onClick={handleKeepLocalConfig}
                data-testid="cloud-config-keep-local-btn"
              >
                保留本地配置
              </button>
              <button
                type="button"
                className="td-btn td-btn-primary-ink"
                onClick={handleUseCloudConfig}
                disabled={isApplyingCloudConfig}
                data-testid="cloud-config-use-cloud-btn"
              >
                {isApplyingCloudConfig ? '应用中...' : '使用云端配置'}
              </button>
            </div>
          </article>
        </div>
      ) : null}
    </>
  )
}

function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
      <ToastCenter />
    </ToastProvider>
  )
}

export default App
