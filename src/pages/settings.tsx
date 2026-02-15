import { useMemo } from 'react'
import AuthPanel from '../components/auth/auth-panel'
import AppHeader from '../components/common/app-header'
import type { UseAuthResult } from '../hooks/use-auth'

interface SettingsPageProps {
  auth: UseAuthResult
}

export default function SettingsPage({ auth }: SettingsPageProps) {
  const currentYear = useMemo(() => new Date().getFullYear(), [])

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-4 pb-8 sm:px-6">
      <AppHeader currentPage="settings" yearlyHref={`/yearly/${currentYear}`} />

      <section className="mt-4 td-fade-in" aria-label="settings-page">
        <article className="td-card-primary td-panel space-y-4">
          <header className="space-y-1">
            <h2 className="font-display text-2xl text-td-text">设置</h2>
            <p className="text-sm text-td-muted">在此直接管理配置、解锁状态与 Token 凭据。</p>
          </header>
          <AuthPanel auth={auth} variant="embedded" />
        </article>
      </section>
    </main>
  )
}
