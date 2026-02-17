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
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-2xl text-td-text">设置</h2>
        </header>

        <article className="td-card-muted td-panel space-y-4">
          <header>
            <h2 className="td-settings-section-title">连接设置</h2>
            <p className="td-settings-section-desc">更新仓库连接与凭证，保存后会立即校验。</p>
          </header>
          <AuthPanel auth={auth} variant="embedded" />
        </article>

        <article className="td-card-muted td-panel td-settings-data-card" aria-label="settings-data-panels">
          <header>
            <h2 className="td-settings-section-title">数据管理</h2>
            <p className="td-settings-section-desc">导入 Markdown 文本或导出明文备份。</p>
          </header>
          <div className="td-settings-data-stack">
            <ImportDataPanel auth={auth} variant="row" />
            <ExportDataPanel auth={auth} variant="row" />
          </div>
        </article>
      </section>
    </main>
  )
}
