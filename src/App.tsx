import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './hooks/use-auth'
import WorkspacePage from './pages/workspace'
import YearlySummaryPage from './pages/yearly-summary'

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
      <Route index element={<Navigate to="/workspace" replace />} />
      <Route path="/workspace" element={<WorkspacePage auth={auth} />} />
      <Route path="/yearly/:year?" element={<YearlySummaryPage auth={auth} />} />
      <Route path="/welcome" element={<Navigate to="/workspace" replace />} />
      <Route path="/yearly-summary" element={<YearlySummaryRedirect />} />
      <Route path="*" element={<Navigate to="/workspace" replace />} />
    </Routes>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}

export default App
