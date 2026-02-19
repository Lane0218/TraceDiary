import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import EntryAuthModal from './components/auth/entry-auth-modal'
import type { AppHeaderAuthEntry } from './components/common/app-header'
import { useAuth } from './hooks/use-auth'
import { ToastProvider } from './hooks/use-toast'
import InsightsPage from './pages/insights'
import DiaryPage from './pages/diary'
import SettingsPage from './pages/settings'
import YearlySummaryPage from './pages/yearly-summary'
import ToastCenter from './components/common/toast-center'
import {
  getSupabaseSession,
  isSupabaseConfigured,
  onSupabaseAuthStateChange,
  signOutSupabase,
} from './services/supabase'

const GUEST_ENTRY_PREFERENCE_KEY = 'trace-diary:entry-preference'

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
  const location = useLocation()
  const [guestEntrySelected, setGuestEntrySelected] = useState<boolean>(readGuestEntryPreference)
  const [manualEntryModalOpen, setManualEntryModalOpen] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const cloudAuthEnabled = isSupabaseConfigured()
  const blocksAutoEntryModal = location.pathname.startsWith('/settings')
  const autoEntryModalOpen = !blocksAutoEntryModal && auth.state.stage === 'needs-setup' && !guestEntrySelected
  const entryModalOpen = manualEntryModalOpen || autoEntryModalOpen
  const canCloseEntryModal = manualEntryModalOpen && !autoEntryModalOpen

  useEffect(() => {
    if (auth.state.stage === 'needs-setup') {
      return
    }
    setGuestEntrySelected(false)
    saveGuestEntryPreference(false)
    setManualEntryModalOpen(false)
  }, [auth.state.stage])

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

  const handleSwitchAccount = useCallback(() => {
    setGuestEntrySelected(false)
    saveGuestEntryPreference(false)

    if (!cloudAuthEnabled) {
      setManualEntryModalOpen(true)
      return
    }

    void (async () => {
      const signedOut = await signOutCurrentSession()
      if (!signedOut) {
        return
      }
      setManualEntryModalOpen(true)
    })()
  }, [cloudAuthEnabled, signOutCurrentSession])

  const headerAuthEntry = useMemo<AppHeaderAuthEntry>(
    () => ({
      sessionEmail: session?.user.email ?? null,
      isSigningOut,
      onOpenAuthModal: openEntryModal,
      onSignOut: handleSignOut,
      onSwitchAccount: handleSwitchAccount,
    }),
    [handleSignOut, handleSwitchAccount, isSigningOut, openEntryModal, session?.user.email],
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
        <Route path="/welcome" element={<Navigate to="/diary" replace />} />
        <Route path="/yearly-summary" element={<YearlySummaryRedirect />} />
        <Route path="*" element={<Navigate to="/diary" replace />} />
      </Routes>
      <EntryAuthModal
        open={entryModalOpen}
        canClose={canCloseEntryModal}
        auth={auth}
        session={session}
        cloudAuthEnabled={cloudAuthEnabled}
        onClose={closeEntryModal}
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
