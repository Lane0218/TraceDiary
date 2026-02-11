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
      <div className="rounded-[12px] border border-red-200 bg-red-50/90 p-4 text-sm text-red-700" role="alert">
        统计读取失败：{error}
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="rounded-[12px] border border-[#ddd4bf] bg-[#f5f0e4] p-4 text-sm text-[#6f6859]">
        正在汇总统计数据...
      </div>
    )
  }

  return (
    <div className="space-y-3" aria-label="stats-overview-card">
      <div className="grid grid-cols-2 gap-2.5">
        <article className="rounded-[12px] border border-[#e2d4b9] bg-[linear-gradient(155deg,#fff8e9_0%,#fffdf7_100%)] p-3 shadow-[0_1px_0_rgba(255,255,255,0.9),0_6px_14px_rgba(42,32,14,0.05)]">
          <p className="text-[11px] font-medium tracking-[0.01em] text-[#786f5b]">总日记篇数</p>
          <p className="mt-1.5 font-display text-[1.72rem] leading-none text-[#2b261d]" data-testid="stats-total-daily-count">
            {formatNumber(summary.totalDailyCount)}
          </p>
        </article>

        <article className="rounded-[12px] border border-[#d7dcbe] bg-[linear-gradient(155deg,#f4f9ea_0%,#fcfef8_100%)] p-3 shadow-[0_1px_0_rgba(255,255,255,0.9),0_6px_14px_rgba(42,32,14,0.05)]">
          <p className="text-[11px] font-medium tracking-[0.01em] text-[#6d735d]">总年度总结篇数</p>
          <p className="mt-1.5 font-display text-[1.72rem] leading-none text-[#25301f]" data-testid="stats-total-yearly-count">
            {formatNumber(summary.totalYearlySummaryCount)}
          </p>
        </article>

        <article className="rounded-[12px] border border-[#d9d1e5] bg-[linear-gradient(155deg,#f5f2fb_0%,#fdfcff_100%)] p-3 shadow-[0_1px_0_rgba(255,255,255,0.9),0_6px_14px_rgba(42,32,14,0.05)]">
          <p className="text-[11px] font-medium tracking-[0.01em] text-[#6f677f]">累计字数</p>
          <p className="mt-1.5 font-display text-[1.72rem] leading-none text-[#2f2a3b]" data-testid="stats-total-word-count">
            {formatNumber(summary.totalWordCount)}
          </p>
        </article>

        <article className="rounded-[12px] border border-[#bdd9dd] bg-[linear-gradient(155deg,#ebf8fa_0%,#f9fdfe_100%)] p-3 shadow-[0_1px_0_rgba(255,255,255,0.9),0_6px_14px_rgba(42,32,14,0.05)]">
          <p className="text-[11px] font-medium tracking-[0.01em] text-[#5e767c]">本年字数</p>
          <p className="mt-1.5 font-display text-[1.72rem] leading-none text-[#213238]" data-testid="stats-current-year-word-count">
            {formatNumber(summary.currentYearWordCount)}
          </p>
        </article>

        <article className="rounded-[12px] border border-[#edc7bc] bg-[linear-gradient(155deg,#fff2ee_0%,#fffaf8_100%)] p-3 shadow-[0_1px_0_rgba(255,255,255,0.9),0_6px_14px_rgba(42,32,14,0.05)]">
          <p className="text-[11px] font-medium tracking-[0.01em] text-[#8a625b]">当前连续天数</p>
          <p className="mt-1.5 font-display text-[1.72rem] leading-none text-[#3f2421]" data-testid="stats-current-streak-days">
            {formatNumber(summary.currentStreakDays)}
          </p>
        </article>

        <article className="rounded-[12px] border border-[#e8d2bb] bg-[linear-gradient(155deg,#fff4e6_0%,#fffcf8_100%)] p-3 shadow-[0_1px_0_rgba(255,255,255,0.9),0_6px_14px_rgba(42,32,14,0.05)]">
          <p className="text-[11px] font-medium tracking-[0.01em] text-[#7c6b54]">最长连续天数</p>
          <p className="mt-1.5 font-display text-[1.72rem] leading-none text-[#352b1f]" data-testid="stats-longest-streak-days">
            {formatNumber(summary.longestStreakDays)}
          </p>
        </article>
      </div>
    </div>
  )
}
