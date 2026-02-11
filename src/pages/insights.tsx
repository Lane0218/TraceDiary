import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AuthModal from '../components/auth/auth-modal'
import StatsOverviewCard from '../components/stats/stats-overview-card'
import type { UseAuthResult } from '../hooks/use-auth'
import { useStats } from '../hooks/use-stats'
import { getSessionLabel } from '../utils/sync-presentation'

interface InsightsPageProps {
  auth: UseAuthResult
}

const numberFormatter = new Intl.NumberFormat('zh-CN')

function formatNumber(value: number): string {
  return numberFormatter.format(value)
}

export default function InsightsPage({ auth }: InsightsPageProps) {
  const navigate = useNavigate()
  const [manualAuthModalOpen, setManualAuthModalOpen] = useState(false)
  const [reloadSignal, setReloadSignal] = useState(0)
  const stats = useStats({ reloadSignal })

  const forceOpenAuthModal = auth.state.stage !== 'ready'
  const authModalOpen = forceOpenAuthModal || manualAuthModalOpen
  const sessionLabel = useMemo(() => getSessionLabel(auth.state.stage), [auth.state.stage])
  const monthlyMaxWordCount = useMemo(
    () => Math.max(1, ...stats.summary.recentMonthItems.map((item) => item.totalWordCount)),
    [stats.summary.recentMonthItems],
  )

  return (
    <>
      <main className="mx-auto min-h-screen w-full max-w-7xl px-4 pb-8 sm:px-6">
        <header className="sticky top-0 z-10 flex min-h-[68px] flex-wrap items-center justify-between gap-3 border-b border-td-line bg-td-bg/95 py-3 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl text-td-text">TraceDiary</h1>
            <span className="rounded-full border border-td-line bg-td-surface px-3 py-1 text-xs text-td-muted">{sessionLabel}</span>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="td-btn" onClick={() => navigate('/workspace')}>
              返回日记工作台
            </button>
            <button type="button" className="td-btn" onClick={() => navigate(`/yearly/${new Date().getFullYear()}`)}>
              年度总结
            </button>
            <button type="button" className="td-btn" onClick={() => setReloadSignal((prev) => prev + 1)}>
              刷新统计
            </button>
            <button type="button" className="td-btn" onClick={() => setManualAuthModalOpen(true)}>
              解锁/配置
            </button>
            {auth.state.stage === 'ready' ? (
              <button
                type="button"
                className="td-btn"
                onClick={() => {
                  auth.lockNow()
                }}
              >
                锁定
              </button>
            ) : null}
          </div>
        </header>

        <section className="mt-4 space-y-4 td-fade-in" aria-label="insights-page">
          <article className="td-card-primary td-panel space-y-3">
            <header className="flex items-center justify-between gap-2">
              <h2 className="font-display text-2xl text-td-text">写作统计</h2>
              <span className="text-xs text-td-muted">累计与连续性总览</span>
            </header>
            <StatsOverviewCard summary={stats.summary} isLoading={stats.isLoading} error={stats.error} />
          </article>

          <article className="td-card-muted td-panel space-y-3">
            <header className="flex items-center justify-between gap-2">
              <h3 className="font-display text-xl text-td-text">年度汇总</h3>
              <span className="text-xs text-td-muted">按自然年聚合</span>
            </header>

            {!stats.isLoading && stats.summary.yearlyItems.length === 0 ? (
              <p className="rounded-[10px] border border-dashed border-td-line bg-td-surface p-4 text-sm text-td-muted">
                暂无可展示的年度统计。
              </p>
            ) : (
              <div className="overflow-x-auto rounded-[10px] border border-td-line bg-td-surface">
                <table className="min-w-full text-sm">
                  <thead className="border-b border-td-line bg-td-soft text-xs text-td-muted">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">年份</th>
                      <th className="px-3 py-2 text-left font-medium">日记篇数</th>
                      <th className="px-3 py-2 text-left font-medium">年度总结篇数</th>
                      <th className="px-3 py-2 text-left font-medium">活跃天数</th>
                      <th className="px-3 py-2 text-left font-medium">总字数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.summary.yearlyItems.map((item) => (
                      <tr key={item.year} className="border-b border-td-line last:border-b-0">
                        <td className="px-3 py-2 text-td-text">{item.year}</td>
                        <td className="px-3 py-2 text-td-text">{formatNumber(item.dailyCount)}</td>
                        <td className="px-3 py-2 text-td-text">{formatNumber(item.yearlySummaryCount)}</td>
                        <td className="px-3 py-2 text-td-text">{formatNumber(item.activeDayCount)}</td>
                        <td className="px-3 py-2 text-td-text">{formatNumber(item.totalWordCount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>

          <article className="td-card-muted td-panel space-y-3">
            <header className="flex items-center justify-between gap-2">
              <h3 className="font-display text-xl text-td-text">近 12 个月趋势</h3>
              <span className="text-xs text-td-muted">字数与篇数</span>
            </header>

            {!stats.isLoading && stats.summary.recentMonthItems.every((item) => item.totalWordCount === 0) ? (
              <p className="rounded-[10px] border border-dashed border-td-line bg-td-surface p-4 text-sm text-td-muted">
                最近 12 个月暂无写作数据。
              </p>
            ) : (
              <div className="space-y-2">
                {stats.summary.recentMonthItems.map((item) => (
                  <div
                    key={item.label}
                    className="rounded-[10px] border border-td-line bg-td-surface p-3"
                    data-testid={`insights-month-row-${item.label}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-td-muted">
                      <span>{item.label}</span>
                      <span>
                        篇数 {formatNumber(item.dailyCount + item.yearlySummaryCount)} / 字数 {formatNumber(item.totalWordCount)}
                      </span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-td-soft">
                      <div
                        className="h-2 rounded-full bg-td-accent"
                        style={{ width: `${Math.round((item.totalWordCount / monthlyMaxWordCount) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
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
