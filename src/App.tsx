import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './hooks/use-auth'
import { ToastProvider } from './hooks/use-toast'
import InsightsPage from './pages/insights'
import DiaryPage from './pages/diary'
import YearlySummaryPage from './pages/yearly-summary'
import ToastCenter from './components/common/toast-center'

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

  return (
    <Routes>
      <Route index element={<Navigate to="/diary" replace />} />
      <Route path="/diary" element={<DiaryPage auth={auth} />} />
      <Route path="/yearly/:year?" element={<YearlySummaryPage auth={auth} />} />
      <Route path="/insights" element={<InsightsPage auth={auth} />} />
      <Route path="/welcome" element={<Navigate to="/diary" replace />} />
      <Route path="/yearly-summary" element={<YearlySummaryRedirect />} />
      <Route path="*" element={<Navigate to="/diary" replace />} />
    </Routes>
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
