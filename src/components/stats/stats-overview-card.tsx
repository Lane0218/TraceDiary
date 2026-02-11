import type { StatsSummary } from '../../types/stats'

export interface StatsOverviewCardProps {
  summary: StatsSummary
  isLoading?: boolean
  error?: string | null
}

const numberFormatter = new Intl.NumberFormat('zh-CN')

function formatNumber(value: number): string {
  return numberFormatter.format(value)
}

export default function StatsOverviewCard({
  summary,
  isLoading = false,
  error = null,
}: StatsOverviewCardProps) {
  if (error) {
    return (
      <div className="rounded-[10px] border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
        统计读取失败：{error}
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="rounded-[10px] border border-td-line bg-td-surface p-4 text-sm text-td-muted">
        正在汇总统计数据...
      </div>
    )
  }

  return (
    <div className="space-y-3" aria-label="stats-overview-card">
      <div className="grid grid-cols-2 gap-2">
        <article className="rounded-[10px] border border-td-line bg-td-surface p-3">
          <p className="text-xs text-td-muted">总日记篇数</p>
          <p className="mt-1 font-display text-2xl text-td-text" data-testid="stats-total-daily-count">
            {formatNumber(summary.totalDailyCount)}
          </p>
        </article>

        <article className="rounded-[10px] border border-td-line bg-td-surface p-3">
          <p className="text-xs text-td-muted">总年度总结篇数</p>
          <p className="mt-1 font-display text-2xl text-td-text" data-testid="stats-total-yearly-count">
            {formatNumber(summary.totalYearlySummaryCount)}
          </p>
        </article>

        <article className="rounded-[10px] border border-td-line bg-td-surface p-3">
          <p className="text-xs text-td-muted">累计字数</p>
          <p className="mt-1 font-display text-2xl text-td-text" data-testid="stats-total-word-count">
            {formatNumber(summary.totalWordCount)}
          </p>
        </article>

        <article className="rounded-[10px] border border-td-line bg-td-surface p-3">
          <p className="text-xs text-td-muted">本年字数</p>
          <p className="mt-1 font-display text-2xl text-td-text" data-testid="stats-current-year-word-count">
            {formatNumber(summary.currentYearWordCount)}
          </p>
        </article>

        <article className="rounded-[10px] border border-td-line bg-td-surface p-3">
          <p className="text-xs text-td-muted">当前连续天数</p>
          <p className="mt-1 font-display text-2xl text-td-text" data-testid="stats-current-streak-days">
            {formatNumber(summary.currentStreakDays)}
          </p>
        </article>

        <article className="rounded-[10px] border border-td-line bg-td-surface p-3">
          <p className="text-xs text-td-muted">最长连续天数</p>
          <p className="mt-1 font-display text-2xl text-td-text" data-testid="stats-longest-streak-days">
            {formatNumber(summary.longestStreakDays)}
          </p>
        </article>
      </div>
    </div>
  )
}
