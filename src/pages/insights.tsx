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

function formatMonthLabel(value: string): string {
  const [, month] = value.split('-')
  return month ? `${month}月` : value
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
  const monthlyWordPeak = useMemo(() => {
    if (chartModel.monthly.length === 0) {
      return null
    }
    return chartModel.monthly.reduce((peak, item) => {
      if (item.totalWordCount > peak.totalWordCount) {
        return item
      }
      return peak
    }, chartModel.monthly[0])
  }, [chartModel.monthly])
  const monthlyInterpretation = useMemo(() => {
    if (!latestMonth) {
      return ['最近 12 个月暂无可计算数据。', '继续记录后将自动生成趋势解读。']
    }

    const summary: string[] = [
      `${formatMonthLabel(latestMonth.label)}共记录 ${formatNumber(latestMonth.totalWordCount)} 字，完成 ${formatNumber(latestMonth.entryCount)} 篇。`,
    ]

    if (latestMonth.momWordDeltaRatio === null) {
      summary.push('缺少可对比的上月数据，环比暂不可用。')
    } else if (latestMonth.momWordDeltaRatio > 0) {
      summary.push(`较上月增长 ${percentFormatter.format(Math.abs(latestMonth.momWordDeltaRatio))}，写作热度上行。`)
    } else if (latestMonth.momWordDeltaRatio < 0) {
      summary.push(`较上月回落 ${percentFormatter.format(Math.abs(latestMonth.momWordDeltaRatio))}，可关注节奏恢复。`)
    } else {
      summary.push('与上月基本持平，写作节奏稳定。')
    }

    if (monthlyWordPeak) {
      if (monthlyWordPeak.label === latestMonth.label) {
        summary.push('当前月份达到近 12 个月字数峰值。')
      } else {
        summary.push(
          `近 12 个月峰值在 ${formatMonthLabel(monthlyWordPeak.label)}，单月 ${formatNumber(monthlyWordPeak.totalWordCount)} 字。`,
        )
      }
    }

    if (trailingQuarterAverage > 0) {
      const deltaToAvg = latestMonth.totalWordCount - trailingQuarterAverage
      if (deltaToAvg > 0) {
        summary.push(`当前高于近 3 月均值 ${formatNumber(deltaToAvg)} 字。`)
      } else if (deltaToAvg < 0) {
        summary.push(`当前低于近 3 月均值 ${formatNumber(Math.abs(deltaToAvg))} 字。`)
      } else {
        summary.push('当前与近 3 月均值持平。')
      }
    }

    return summary
  }, [latestMonth, monthlyWordPeak, trailingQuarterAverage])

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

              <aside className="grid gap-2 xl:h-full xl:grid-rows-[repeat(3,auto)_minmax(0,1fr)]" data-testid="insights-monthly-metrics">
                <article className="rounded-[10px] border border-td-line bg-td-surface px-3 py-2" data-testid="insights-monthly-metric-latest">
                  <p className="text-xs text-td-muted">最近月份字数</p>
                  <p className="mt-1 text-lg font-semibold text-td-text">{formatNumber(latestMonth?.totalWordCount ?? 0)}</p>
                </article>
                <article className="rounded-[10px] border border-td-line bg-td-surface px-3 py-2">
                  <p className="text-xs text-td-muted">最近月份环比</p>
                  <p className="mt-1 text-lg font-semibold text-td-text">
                    {formatDeltaRatio(latestMonth?.momWordDeltaRatio ?? null)}
                  </p>
                </article>
                <article className="rounded-[10px] border border-td-line bg-td-surface px-3 py-2">
                  <p className="text-xs text-td-muted">近 3 月平均字数</p>
                  <p className="mt-1 text-lg font-semibold text-td-text">{formatNumber(trailingQuarterAverage)}</p>
                </article>

                <article
                  className="rounded-[10px] border border-td-line bg-[linear-gradient(160deg,rgba(79,70,229,0.08)_0%,rgba(15,118,110,0.06)_56%,rgba(255,255,255,0.88)_100%)] px-3 py-3"
                  data-testid="insights-monthly-interpretation"
                >
                  <p className="text-xs font-semibold tracking-[0.02em] text-td-muted">趋势解读</p>
                  <ul className="mt-2 space-y-1.5 text-sm leading-6 text-td-text">
                    {monthlyInterpretation.map((line) => (
                      <li key={line} className="border-l-2 border-[#0f766e]/35 pl-2">
                        {line}
                      </li>
                    ))}
                  </ul>
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
