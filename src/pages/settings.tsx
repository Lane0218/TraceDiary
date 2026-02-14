import { useMemo, useState } from 'react'
import AuthModal from '../components/auth/auth-modal'
import AppHeader from '../components/common/app-header'
import type { UseAuthResult } from '../hooks/use-auth'

interface SettingsPageProps {
  auth: UseAuthResult
}

export default function SettingsPage({ auth }: SettingsPageProps) {
  const [manualAuthModalOpen, setManualAuthModalOpen] = useState(false)
  const currentYear = useMemo(() => new Date().getFullYear(), [])
  const forceOpenAuthModal = auth.state.stage !== 'ready'
  const authModalOpen = forceOpenAuthModal || manualAuthModalOpen

  return (
    <>
      <main className="mx-auto min-h-screen w-full max-w-7xl px-4 pb-8 sm:px-6">
        <AppHeader currentPage="settings" yearlyHref={`/yearly/${currentYear}`} />

        <section className="mt-4 td-fade-in" aria-label="settings-page">
          <article className="td-card-primary td-panel space-y-4">
            <header className="space-y-1">
              <h2 className="font-display text-2xl text-td-text">设置</h2>
              <p className="text-sm text-td-muted">管理配置与会话状态。</p>
            </header>

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                className="td-btn"
                onClick={() => {
                  setManualAuthModalOpen(true)
                }}
              >
                配置
              </button>
              <button
                type="button"
                className="td-btn disabled:cursor-not-allowed disabled:opacity-60"
                disabled={auth.state.stage !== 'ready'}
                onClick={() => {
                  auth.lockNow()
                }}
              >
                锁定
              </button>
            </div>

            {auth.state.stage !== 'ready' ? (
              <p className="text-xs text-td-muted">当前会话未解锁，请先完成配置或输入主密码。</p>
            ) : null}
          </article>
        </section>
      </main>

      <AuthModal
        auth={auth}
        open={authModalOpen}
        canClose={!forceOpenAuthModal}
        onClose={() => {
          setManualAuthModalOpen(false)
        }}
      />
    </>
  )
}
