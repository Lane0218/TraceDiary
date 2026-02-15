import { useMemo } from 'react'
import type { YearlyStatsItem } from '../../types/stats'

interface YearlySummaryCardsProps {
  items: YearlyStatsItem[]
  isLoading?: boolean
}

interface SummaryCard {
  label: string
  value: string
  hint: string
}

const numberFormatter = new Intl.NumberFormat('zh-CN')

function formatNumber(value: number): string {
  return numberFormatter.format(value)
}

export default function YearlySummaryCards({ items, isLoading = false }: YearlySummaryCardsProps) {
  const cards = useMemo<SummaryCard[]>(() => {
    if (items.length === 0) {
      return [
        { label: '年度总数', value: '0', hint: '暂无记录年份' },
        { label: '最高产年份', value: '—', hint: '暂无数据' },
        { label: '最活跃年份', value: '—', hint: '暂无数据' },
        { label: '近三年均值', value: '0', hint: '暂无数据' },
      ]
    }

    const sortedByYear = [...items].sort((left, right) => right.year - left.year)
    const mostWords = [...items].sort((left, right) => right.totalWordCount - left.totalWordCount)[0]
    const mostActive = [...items].sort((left, right) => right.activeDayCount - left.activeDayCount)[0]
    const latestThree = sortedByYear.slice(0, 3)
    const latestThreeAverage =
      latestThree.length > 0
        ? Math.round(latestThree.reduce((sum, item) => sum + item.totalWordCount, 0) / latestThree.length)
        : 0

    return [
      {
        label: '年度总数',
        value: formatNumber(sortedByYear.length),
        hint: '有记录年份',
      },
      {
        label: '最高产年份',
        value: mostWords ? String(mostWords.year) : '—',
        hint: mostWords ? `${formatNumber(mostWords.totalWordCount)} 字` : '暂无数据',
      },
      {
        label: '最活跃年份',
        value: mostActive ? String(mostActive.year) : '—',
        hint: mostActive ? `${formatNumber(mostActive.activeDayCount)} 天` : '暂无数据',
      },
      {
        label: '近三年均值',
        value: formatNumber(latestThreeAverage),
        hint: latestThree.length > 0 ? `基于近 ${latestThree.length} 年总字数` : '暂无数据',
      },
    ]
  }, [items])

  if (isLoading) {
    return (
      <div className="rounded-[12px] border border-dashed border-td-line bg-td-surface p-4 text-sm text-td-muted">
        正在加载年度摘要...
      </div>
    )
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4" data-testid="insights-yearly-summary-cards" aria-label="年度摘要卡片">
      {cards.map((card) => (
        <article key={card.label} className="rounded-[12px] border border-td-line bg-td-surface px-3 py-3">
          <p className="text-xs text-td-muted">{card.label}</p>
          <p className="mt-1 text-2xl font-semibold text-td-text">{card.value}</p>
          <p className="mt-1 text-xs text-td-muted">{card.hint}</p>
        </article>
      ))}
    </div>
  )
}
