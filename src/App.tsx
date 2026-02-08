import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './hooks/use-auth'
import WorkspacePage from './pages/workspace'

function EditorRedirect() {
  const location = useLocation()
  const query = new URLSearchParams(location.search)
  const date = query.get('date')
  const next = new URLSearchParams()
  next.set('mode', 'daily')
  if (date) {
    next.set('date', date)
  }

  return <Navigate to={`/workspace?${next.toString()}`} replace />
}

function YearlyRedirect() {
  const location = useLocation()
  const query = new URLSearchParams(location.search)
  const year = query.get('year')
  const next = new URLSearchParams()
  next.set('mode', 'yearly')
  if (year) {
    next.set('year', year)
  }

  return <Navigate to={`/workspace?${next.toString()}`} replace />
}

function AppRoutes() {
  const auth = useAuth()

  return (
    <Routes>
      <Route index element={<Navigate to="/workspace" replace />} />
      <Route path="/workspace" element={<WorkspacePage auth={auth} />} />
      <Route path="/welcome" element={<Navigate to="/workspace" replace />} />
      <Route path="/calendar" element={<Navigate to="/workspace" replace />} />
      <Route path="/editor" element={<EditorRedirect />} />
      <Route path="/yearly-summary" element={<YearlyRedirect />} />
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
