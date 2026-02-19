import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import EntryAuthModal from './components/auth/entry-auth-modal'
import { useAuth } from './hooks/use-auth'
import { ToastProvider } from './hooks/use-toast'
import InsightsPage from './pages/insights'
import DiaryPage from './pages/diary'
import SettingsPage from './pages/settings'
import YearlySummaryPage from './pages/yearly-summary'
import ToastCenter from './components/common/toast-center'

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
  const isEntryModalPath = location.pathname.startsWith('/diary') || location.pathname.startsWith('/yearly')
  const entryModalOpen = isEntryModalPath && auth.state.stage === 'needs-setup' && !guestEntrySelected

  useEffect(() => {
    if (auth.state.stage === 'needs-setup') {
      return
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 认证从首次配置态切换后需要重置游客入口抑制状态
    setGuestEntrySelected(false)
    saveGuestEntryPreference(false)
  }, [auth.state.stage])

  return (
    <>
      <Routes>
        <Route index element={<Navigate to="/diary" replace />} />
        <Route path="/diary" element={<DiaryPage auth={auth} />} />
        <Route path="/yearly/:year?" element={<YearlySummaryPage auth={auth} />} />
        <Route path="/insights" element={<InsightsPage auth={auth} />} />
        <Route path="/settings" element={<SettingsPage auth={auth} />} />
        <Route path="/welcome" element={<Navigate to="/diary" replace />} />
        <Route path="/yearly-summary" element={<YearlySummaryRedirect />} />
        <Route path="*" element={<Navigate to="/diary" replace />} />
      </Routes>
      <EntryAuthModal
        open={entryModalOpen}
        auth={auth}
        onEnterGuest={() => {
          setGuestEntrySelected(true)
          saveGuestEntryPreference(true)
        }}
        onChooseAuthFlow={() => {
          setGuestEntrySelected(false)
          saveGuestEntryPreference(false)
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
