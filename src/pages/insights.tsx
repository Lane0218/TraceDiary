import { useMemo, useState } from 'react'
import AuthModal from '../components/auth/auth-modal'
import AppHeader from '../components/common/app-header'
import MonthlyTrendChart from '../components/stats/monthly-trend-chart'
import StatsOverviewCard from '../components/stats/stats-overview-card'
import YearlyComparisonChart from '../components/stats/yearly-comparison-chart'
import YearlyStatsTable from '../components/stats/yearly-stats-table'
import type { UseAuthResult } from '../hooks/use-auth'
import { useStats } from '../hooks/use-stats'
import { buildStatsChartModel } from '../utils/stats'

interface InsightsPageProps {
  auth: UseAuthResult
}

const numberFormatter = new Intl.NumberFormat('zh-CN')
const percentFormatter = new Intl.NumberFormat('zh-CN', {
  style: 'percent',
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
})

function formatNumber(value: number): string {
  return numberFormatter.format(value)
}

function formatDeltaRatio(value: number | null): string {
  if (value === null) {
    return '—'
  }
  const sign = value > 0 ? '+' : ''
  return `${sign}${percentFormatter.format(value)}`
}

export default function InsightsPage({ auth }: InsightsPageProps) {
  const [reloadSignal, setReloadSignal] = useState(0)
  const stats = useStats({ reloadSignal })

  const currentYear = useMemo(() => new Date().getFullYear(), [])
  const forceOpenAuthModal = auth.state.stage !== 'ready'
  const authModalOpen = forceOpenAuthModal

  const chartModel = useMemo(() => buildStatsChartModel(stats.summary), [stats.summary])
  const latestMonth = chartModel.monthly.length > 0 ? chartModel.monthly[chartModel.monthly.length - 1] : null
  const trailingQuarterAverage =
    chartModel.monthly.length >= 3
      ? Math.round(
          chartModel.monthly.slice(-3).reduce((sum, item) => sum + item.totalWordCount, 0) /
            Math.min(3, chartModel.monthly.length),
        )
      : 0

  return (
    <>
      <main className="mx-auto min-h-screen w-full max-w-7xl px-4 pb-8 sm:px-6">
        <AppHeader currentPage="insights" yearlyHref={`/yearly/${currentYear}`} />

        <section className="mt-4 space-y-4 td-fade-in" aria-label="insights-page">
          <article className="td-card-primary td-panel space-y-3">
            <header className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-2xl text-td-text">写作统计</h2>
                <p className="mt-1 text-xs text-td-muted">先看趋势，再看明细。字数与活跃度同屏呈现。</p>
              </div>
              <button
                type="button"
                className="td-btn"
                onClick={() => setReloadSignal((prev) => prev + 1)}
                aria-label="刷新统计"
              >
                刷新统计
              </button>
            </header>

            <StatsOverviewCard summary={stats.summary} isLoading={stats.isLoading} error={stats.error} />
          </article>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
            <article className="td-card-muted td-panel space-y-3">
              <header className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-display text-xl text-td-text">近 12 个月趋势</h3>
                <span className="text-xs text-td-muted">双轴：柱=字数，线=篇数</span>
              </header>

              <div className="grid gap-2 sm:grid-cols-3">
                <article className="rounded-[10px] border border-td-line bg-td-surface px-3 py-2">
                  <p className="text-xs text-td-muted">最近月份字数</p>
                  <p className="mt-1 text-sm text-td-text">{formatNumber(latestMonth?.totalWordCount ?? 0)}</p>
                </article>
                <article className="rounded-[10px] border border-td-line bg-td-surface px-3 py-2">
                  <p className="text-xs text-td-muted">最近月份环比</p>
                  <p className="mt-1 text-sm text-td-text">{formatDeltaRatio(latestMonth?.momWordDeltaRatio ?? null)}</p>
                </article>
                <article className="rounded-[10px] border border-td-line bg-td-surface px-3 py-2">
                  <p className="text-xs text-td-muted">近 3 月平均字数</p>
                  <p className="mt-1 text-sm text-td-text">{formatNumber(trailingQuarterAverage)}</p>
                </article>
              </div>

              <MonthlyTrendChart items={chartModel.monthly} isLoading={stats.isLoading} />
            </article>

            <article className="td-card-muted td-panel space-y-3">
              <header className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-display text-xl text-td-text">年度对比</h3>
                <span className="text-xs text-td-muted">字数规模与活跃天数</span>
              </header>

              <YearlyComparisonChart items={chartModel.yearly} isLoading={stats.isLoading} />
            </article>
          </div>

          <article className="td-card-muted td-panel space-y-3">
            <header className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-xl text-td-text">年度汇总</h3>
              <span className="text-xs text-td-muted">可排序明细</span>
            </header>

            <YearlyStatsTable items={stats.summary.yearlyItems} isLoading={stats.isLoading} />
          </article>
        </section>
      </main>

      <AuthModal auth={auth} open={authModalOpen} canClose={!forceOpenAuthModal} onClose={() => undefined} />
    </>
  )
}
