import { useMemo } from 'react'
import AuthPanel from '../components/auth/auth-panel'
import AppHeader from '../components/common/app-header'
import ExportDataPanel from '../components/common/export-data-panel'
import ImportDataPanel from '../components/common/import-data-panel'
import type { UseAuthResult } from '../hooks/use-auth'

interface SettingsPageProps {
  auth: UseAuthResult
}

export default function SettingsPage({ auth }: SettingsPageProps) {
  const currentYear = useMemo(() => new Date().getFullYear(), [])

  return (
    <main className="mx-auto w-full max-w-7xl px-4 pb-4 sm:px-6">
      <AppHeader currentPage="settings" yearlyHref={`/yearly/${currentYear}`} />

      <section className="mt-4 space-y-4 td-fade-in" aria-label="settings-page">
        <article className="td-card-muted td-panel space-y-3">
          <header>
            <h2 className="font-display text-2xl text-td-text">设置</h2>
          </header>
          <AuthPanel auth={auth} variant="embedded" />
        </article>
        <section className="grid gap-4 xl:grid-cols-2" aria-label="settings-data-panels">
          <ImportDataPanel auth={auth} />
          <ExportDataPanel auth={auth} />
        </section>
      </section>
    </main>
  )
}
