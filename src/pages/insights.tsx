import { useMemo, useState } from 'react'
import AuthModal from '../components/auth/auth-modal'
import AppHeader from '../components/common/app-header'
import MonthlyTrendChart from '../components/stats/monthly-trend-chart'
import YearlyActivityHeatmap from '../components/stats/yearly-activity-heatmap'
import YearlyComparisonChart from '../components/stats/yearly-comparison-chart'
import YearlySummaryCards from '../components/stats/yearly-summary-cards'
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
          <header className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-2xl text-td-text">数据统计</h2>
            <button
              type="button"
              className="td-btn"
              onClick={() => setReloadSignal((prev) => prev + 1)}
              aria-label="刷新统计"
            >
              刷新统计
            </button>
          </header>

          {stats.error ? (
            <p className="rounded-[10px] border border-[#f4d1d1] bg-[#fff4f4] px-3 py-2 text-sm text-[#a63f3f]">
              统计读取失败：{stats.error}
            </p>
          ) : null}

          <article className="td-card-muted td-panel space-y-3">
            <header className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-xl text-td-text">月度趋势</h3>
            </header>

            <div
              className="flex flex-wrap items-center gap-2 text-xs text-td-muted"
              aria-label="月度趋势图例"
              data-testid="insights-monthly-legend"
            >
              <span className="inline-flex items-center gap-1 rounded-full border border-td-line bg-td-surface px-2 py-1">
                <i className="inline-block h-2 w-2 rounded-[2px] bg-[#4f46e5]" aria-hidden="true" />
                字数柱
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-td-line bg-td-surface px-2 py-1">
                <i className="inline-block h-[2px] w-3 bg-[#0f766e]" aria-hidden="true" />
                篇数线
              </span>
            </div>

            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-stretch">
              <MonthlyTrendChart items={chartModel.monthly} isLoading={stats.isLoading} showLegend={false} />

              <aside className="grid gap-2 xl:h-full xl:grid-rows-4" data-testid="insights-monthly-metrics">
                <article
                  className="rounded-[10px] border border-td-line bg-td-surface px-3 py-2 xl:flex xl:h-full xl:flex-col xl:justify-center"
                  data-testid="insights-monthly-metric-latest"
                >
                  <p className="text-xs text-td-muted">最近月份字数</p>
                  <p className="mt-1 text-lg font-semibold text-td-text">{formatNumber(latestMonth?.totalWordCount ?? 0)}</p>
                </article>
                <article
                  className="rounded-[10px] border border-td-line bg-td-surface px-3 py-2 xl:flex xl:h-full xl:flex-col xl:justify-center"
                  data-testid="insights-monthly-metric-entry-count"
                >
                  <p className="text-xs text-td-muted">最近月份篇数</p>
                  <p className="mt-1 text-lg font-semibold text-td-text">{formatNumber(latestMonth?.entryCount ?? 0)}</p>
                </article>
                <article className="rounded-[10px] border border-td-line bg-td-surface px-3 py-2 xl:flex xl:h-full xl:flex-col xl:justify-center">
                  <p className="text-xs text-td-muted">最近月份环比</p>
                  <p className="mt-1 text-lg font-semibold text-td-text">
                    {formatDeltaRatio(latestMonth?.momWordDeltaRatio ?? null)}
                  </p>
                </article>
                <article
                  className="rounded-[10px] border border-td-line bg-td-surface px-3 py-2 xl:flex xl:h-full xl:flex-col xl:justify-center"
                  data-testid="insights-monthly-metric-quarter-avg"
                >
                  <p className="text-xs text-td-muted">近 3 月平均字数</p>
                  <p className="mt-1 text-lg font-semibold text-td-text">{formatNumber(trailingQuarterAverage)}</p>
                </article>
              </aside>
            </div>
          </article>

          <article className="td-card-muted td-panel space-y-4">
            <header className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-xl text-td-text">年度分析</h3>
            </header>

            <section className="space-y-2" aria-label="年度摘要">
              <h4 className="text-sm font-semibold text-td-muted">年度摘要</h4>
              <YearlySummaryCards items={stats.summary.yearlyItems} isLoading={stats.isLoading} />
            </section>

            <section className="space-y-2" aria-label="年度对比">
              <h4 className="text-sm font-semibold text-td-muted">年度对比</h4>
              <YearlyComparisonChart items={chartModel.yearly} isLoading={stats.isLoading} />
            </section>

            <YearlyActivityHeatmap
              records={stats.records}
              yearlyItems={stats.summary.yearlyItems}
              isLoading={stats.isLoading}
            />
          </article>
        </section>
      </main>

      <AuthModal auth={auth} open={authModalOpen} canClose={!forceOpenAuthModal} onClose={() => undefined} />
    </>
  )
}
