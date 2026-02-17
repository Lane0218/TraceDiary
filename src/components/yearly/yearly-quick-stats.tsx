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
      <h2 className="mb-2 text-sm font-semibold text-td-text">年度概览</h2>
      <div className="space-y-2">
        {items.map((item) => (
          <article key={item.label} className="min-h-0 rounded-[10px] border border-td-line bg-td-surface p-2.5">
            <p className="text-xs text-td-muted">{item.label}</p>
            <p className="mt-0.5 font-display text-[1.72rem] leading-none text-td-text">{item.value}</p>
          </article>
        ))}
      </div>
    </div>
  )
}
