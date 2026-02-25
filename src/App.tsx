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
import { loadCloudConfigConflictMetaForCurrentUser } from './services/cloud-config'
import {
  getSupabaseSession,
  isSupabaseConfigured,
  onSupabaseAuthStateChange,
  signOutSupabase,
} from './services/supabase'

type ExperienceMode = 'guest' | 'user'

const EXPERIENCE_MODE_STORAGE_KEY = 'trace-diary:experience-mode'
const GUEST_ENTRY_PREFERENCE_KEY = 'trace-diary:entry-preference'
const CLOUD_OVERWRITE_DECISION_STORAGE_KEY_PREFIX = 'trace-diary:cloud-overwrite-decision:v1:'

type CloudOverwriteDecision = 'keep_local' | 'use_cloud'

interface CloudOverwriteDecisionRecord {
  decision: CloudOverwriteDecision
  cloudFingerprintAtDecision: string | null
  decidedAt: string
}

interface CloudOverwritePromptState {
  userId: string
  cloudFingerprint: string | null
}

function readExperienceModePreference(): ExperienceMode {
  if (typeof window === 'undefined') {
    return 'user'
  }
  const persistedMode = localStorage.getItem(EXPERIENCE_MODE_STORAGE_KEY)
  if (persistedMode === 'guest' || persistedMode === 'user') {
    return persistedMode
  }
  return localStorage.getItem(GUEST_ENTRY_PREFERENCE_KEY) === 'guest' ? 'guest' : 'user'
}

function saveExperienceModePreference(mode: ExperienceMode): void {
  if (typeof window === 'undefined') {
    return
  }
  localStorage.setItem(EXPERIENCE_MODE_STORAGE_KEY, mode)
  if (mode === 'guest') {
    localStorage.setItem(GUEST_ENTRY_PREFERENCE_KEY, 'guest')
    return
  }
  localStorage.removeItem(GUEST_ENTRY_PREFERENCE_KEY)
}

function buildCloudOverwriteDecisionStorageKey(userId: string): string {
  return `${CLOUD_OVERWRITE_DECISION_STORAGE_KEY_PREFIX}${userId}`
}

function readCloudOverwriteDecisionRecord(userId: string): CloudOverwriteDecisionRecord | null {
  if (typeof window === 'undefined') {
    return null
  }

  const raw = window.localStorage.getItem(buildCloudOverwriteDecisionStorageKey(userId))
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as Partial<CloudOverwriteDecisionRecord & { cloudUpdatedAtAtDecision?: unknown }>
    if (parsed.decision !== 'keep_local' && parsed.decision !== 'use_cloud') {
      return null
    }
    if (parsed.cloudFingerprintAtDecision !== null && parsed.cloudFingerprintAtDecision !== undefined && typeof parsed.cloudFingerprintAtDecision !== 'string') {
      return null
    }
    if (typeof parsed.decidedAt !== 'string') {
      return null
    }
    return {
      decision: parsed.decision,
      cloudFingerprintAtDecision: parsed.cloudFingerprintAtDecision ?? null,
      decidedAt: parsed.decidedAt,
    }
  } catch {
    return null
  }
}

function persistCloudOverwriteDecisionRecord(
  userId: string,
  decision: CloudOverwriteDecision,
  cloudFingerprintAtDecision: string | null,
): void {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.setItem(
    buildCloudOverwriteDecisionStorageKey(userId),
    JSON.stringify({
      decision,
      cloudFingerprintAtDecision,
      decidedAt: new Date().toISOString(),
    } satisfies CloudOverwriteDecisionRecord),
  )
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
  const [experienceMode, setExperienceMode] = useState<ExperienceMode>(readExperienceModePreference)
  const [manualEntryModalOpen, setManualEntryModalOpen] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [pendingCloudRestoreUserId, setPendingCloudRestoreUserId] = useState<string | null>(null)
  const [cloudOverwritePrompt, setCloudOverwritePrompt] = useState<CloudOverwritePromptState | null>(null)
  const [isApplyingCloudConfig, setIsApplyingCloudConfig] = useState(false)
  const lastSessionUserIdRef = useRef<string | null>(null)
  const cloudAuthEnabled = isSupabaseConfigured()
  const sessionUserId = session?.user.id ?? null
  const isGuestMode = experienceMode === 'guest'
  const blocksAutoEntryModal = location.pathname.startsWith('/settings') || location.pathname.startsWith('/auth/reset-password')
  const autoEntryModalOpen =
    !blocksAutoEntryModal && auth.state.stage === 'needs-setup' && !isGuestMode && !sessionUserId
  const entryModalOpen = manualEntryModalOpen || autoEntryModalOpen
  const canCloseEntryModal = manualEntryModalOpen && !autoEntryModalOpen

  useEffect(() => {
    if (manualEntryModalOpen) {
      return
    }
    if (auth.state.stage === 'needs-setup' || auth.state.stage === 'checking') {
      return
    }
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
      setCloudOverwritePrompt(null)
      return
    }

    if (lastSessionUserIdRef.current === sessionUserId) {
      return
    }
    lastSessionUserIdRef.current = sessionUserId

    setPendingCloudRestoreUserId(sessionUserId)
  }, [sessionUserId])

  useEffect(() => {
    if (!cloudAuthEnabled || !sessionUserId || pendingCloudRestoreUserId !== sessionUserId) {
      return
    }
    if (isGuestMode) {
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

    const targetUserId = sessionUserId

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
          setPendingCloudRestoreUserId(null)
          setIsApplyingCloudConfig(false)
        })
      return
    }

    if (!auth.state.config) {
      setPendingCloudRestoreUserId(null)
      return
    }

    let cancelled = false
    void loadCloudConfigConflictMetaForCurrentUser()
      .then((cloudMeta) => {
        if (cancelled) {
          return
        }
        setPendingCloudRestoreUserId(null)
        if (!cloudMeta.exists) {
          return
        }
        const decisionRecord = readCloudOverwriteDecisionRecord(targetUserId)
        if (decisionRecord && decisionRecord.cloudFingerprintAtDecision === cloudMeta.fingerprint) {
          return
        }
        setCloudOverwritePrompt({
          userId: targetUserId,
          cloudFingerprint: cloudMeta.fingerprint,
        })
      })
      .catch((error) => {
        if (cancelled) {
          return
        }
        const message = error instanceof Error ? error.message : '云端配置状态检测失败'
        setPendingCloudRestoreUserId(null)
        pushToast({
          kind: 'system',
          level: 'warning',
          message,
        })
      })

    return () => {
      cancelled = true
    }
  }, [
    auth,
    auth.state.config,
    auth.state.stage,
    cloudAuthEnabled,
    entryModalOpen,
    isGuestMode,
    pendingCloudRestoreUserId,
    pushToast,
    sessionUserId,
  ])

  const enterGuestMode = useCallback(() => {
    setManualEntryModalOpen(false)
    setExperienceMode('guest')
    saveExperienceModePreference('guest')
  }, [])

  const enterUserMode = useCallback(() => {
    setManualEntryModalOpen(false)
    setExperienceMode('user')
    saveExperienceModePreference('user')
  }, [])

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
      return true
    } catch (error) {
      console.error('Supabase 退出登录失败', error)
      return false
    } finally {
      setIsSigningOut(false)
    }
  }, [cloudAuthEnabled])

  const handleSignOut = useCallback(() => {
    void signOutCurrentSession()
  }, [signOutCurrentSession])

  const handleKeepLocalConfig = useCallback(() => {
    if (!cloudOverwritePrompt) {
      return
    }
    persistCloudOverwriteDecisionRecord(cloudOverwritePrompt.userId, 'keep_local', cloudOverwritePrompt.cloudFingerprint)
    setCloudOverwritePrompt(null)
    pushToast({
      kind: 'system',
      level: 'info',
      message: '已保留当前设备本地配置。',
    })
  }, [cloudOverwritePrompt, pushToast])

  const handleUseCloudConfig = useCallback(() => {
    if (!cloudOverwritePrompt) {
      return
    }
    const targetPrompt = cloudOverwritePrompt
    setCloudOverwritePrompt(null)
    setIsApplyingCloudConfig(true)
    void auth
      .restoreConfigFromCloud()
      .then(() => {
        persistCloudOverwriteDecisionRecord(targetPrompt.userId, 'use_cloud', targetPrompt.cloudFingerprint)
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
        setIsApplyingCloudConfig(false)
      })
  }, [auth, cloudOverwritePrompt, pushToast])

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
        <Route
          path="/diary"
          element={(
            <DiaryPage
              auth={auth}
              headerAuthEntry={headerAuthEntry}
              isGuestMode={isGuestMode}
              onEnterUserMode={enterUserMode}
            />
          )}
        />
        <Route
          path="/yearly/:year?"
          element={(
            <YearlySummaryPage
              auth={auth}
              headerAuthEntry={headerAuthEntry}
              isGuestMode={isGuestMode}
              onEnterUserMode={enterUserMode}
            />
          )}
        />
        <Route
          path="/insights"
          element={(
            <InsightsPage
              auth={auth}
              headerAuthEntry={headerAuthEntry}
              isGuestMode={isGuestMode}
              onEnterUserMode={enterUserMode}
            />
          )}
        />
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
        onEnterGuest={enterGuestMode}
        onChooseAuthFlow={enterUserMode}
      />
      {!isGuestMode && cloudOverwritePrompt ? (
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
