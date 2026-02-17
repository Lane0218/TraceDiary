import type { YearlySidebarStats } from '../../utils/yearly-sidebar-stats'

interface YearlyQuickStatsProps {
  stats: YearlySidebarStats
  isLoading?: boolean
}

const numberFormatter = new Intl.NumberFormat('zh-CN')

function formatNumber(value: number, isLoading: boolean): string {
  return isLoading ? '—' : numberFormatter.format(value)
}

function formatMonth(month: number | null, isLoading: boolean): string {
  if (isLoading || month === null || month < 1 || month > 12) {
    return '—'
  }
  return `${month}月`
}

export default function YearlyQuickStats({ stats, isLoading = false }: YearlyQuickStatsProps) {
  const items = [
    {
      label: '本年字数',
      value: formatNumber(stats.yearWordCount, isLoading),
    },
    {
      label: '记录天数',
      value: formatNumber(stats.activeDayCount, isLoading),
    },
    {
      label: '最活跃月份',
      value: formatMonth(stats.mostActiveMonth, isLoading),
    },
  ]

  return (
    <div data-testid="yearly-quick-stats">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-td-text">年度概览</h2>
        <p className="text-xs text-td-muted">仅统计日记</p>
      </div>
      <div className="space-y-2">
        {items.map((item) => (
          <article
            key={item.label}
            className="rounded-[10px] border border-[#d9d7d2] bg-[#f8f7f3] px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]"
          >
            <p className="text-[11px] uppercase tracking-[0.08em] text-td-muted">{item.label}</p>
            <p className="mt-1 text-base font-semibold text-td-text">{item.value}</p>
          </article>
        ))}
      </div>
    </div>
  )
}
