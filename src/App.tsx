import { BrowserRouter, Link, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import CalendarPage from './pages/calendar'
import EditorPage from './pages/editor'
import WelcomePage from './pages/welcome'
import YearlySummaryPage from './pages/yearly-summary'

const navItems = [
  { path: '/welcome', label: '欢迎' },
  { path: '/calendar', label: '日历' },
  { path: '/editor', label: '编辑' },
  { path: '/yearly-summary', label: '年度总结' },
]

function AppLayout() {
  const location = useLocation()

  return (
    <main className="grid min-h-screen place-items-center px-6 py-8">
      <section className="relative w-full max-w-4xl overflow-hidden rounded-3xl border border-slate-200/80 bg-white/80 px-7 py-8 shadow-soft backdrop-blur-sm sm:px-10">
        <div className="pointer-events-none absolute -left-16 -top-16 h-44 w-44 rounded-full bg-brand-100/70 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-20 -right-14 h-52 w-52 rounded-full bg-cyan-100/70 blur-2xl" />

        <header className="relative flex flex-wrap items-center gap-2 border-b border-slate-200 pb-4">
          <h1 className="mr-auto text-xl font-semibold tracking-[0.02em] text-ink-900">TraceDiary</h1>
          {navItems.map((item) => {
            const active = location.pathname === item.path

            return (
              <Link
                key={item.path}
                to={item.path}
                className={`rounded-full px-4 py-1.5 text-sm transition ${
                  active ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </header>

        <section className="relative mt-6">
          <Outlet />
        </section>
      </section>
    </main>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/welcome" replace />} />
          <Route path="/welcome" element={<WelcomePage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/editor" element={<EditorPage />} />
          <Route path="/yearly-summary" element={<YearlySummaryPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/welcome" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
