import { useMemo, useState } from 'react'
import type { YearlyStatsItem } from '../../types/stats'

type SortKey = 'year' | 'dailyCount' | 'yearlySummaryCount' | 'activeDayCount' | 'totalWordCount'
type SortDirection = 'asc' | 'desc'

interface YearlyStatsTableProps {
  items: YearlyStatsItem[]
  isLoading?: boolean
}

interface HeaderCell {
  key: SortKey
  label: string
}

const numberFormatter = new Intl.NumberFormat('zh-CN')

const headers: HeaderCell[] = [
  { key: 'year', label: '年份' },
  { key: 'dailyCount', label: '日记篇数' },
  { key: 'yearlySummaryCount', label: '年度总结篇数' },
  { key: 'activeDayCount', label: '活跃天数' },
  { key: 'totalWordCount', label: '总字数' },
]

function formatNumber(value: number): string {
  return numberFormatter.format(value)
}

function sortItems(items: YearlyStatsItem[], key: SortKey, direction: SortDirection): YearlyStatsItem[] {
  const copy = [...items]
  copy.sort((left, right) => {
    const factor = direction === 'asc' ? 1 : -1
    return (left[key] - right[key]) * factor
  })
  return copy
}

function sortIndicator(currentKey: SortKey, key: SortKey, direction: SortDirection): string {
  if (currentKey !== key) {
    return '↕'
  }
  return direction === 'asc' ? '↑' : '↓'
}

export default function YearlyStatsTable({ items, isLoading = false }: YearlyStatsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('year')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  const sortedItems = useMemo(() => sortItems(items, sortKey, sortDirection), [items, sortDirection, sortKey])

  const handleSortChange = (nextKey: SortKey) => {
    if (nextKey === sortKey) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(nextKey)
    setSortDirection(nextKey === 'year' ? 'desc' : 'asc')
  }

  if (isLoading) {
    return (
      <div className="rounded-[10px] border border-dashed border-td-line bg-td-surface p-4 text-sm text-td-muted">
        正在加载年度明细...
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <p className="rounded-[10px] border border-dashed border-td-line bg-td-surface p-4 text-sm text-td-muted">
        暂无可展示的年度统计。
      </p>
    )
  }

  return (
    <div className="overflow-x-auto rounded-[10px] border border-td-line bg-td-surface" data-testid="insights-yearly-table">
      <table className="min-w-full text-sm">
        <thead className="border-b border-td-line bg-td-soft text-xs text-td-muted">
          <tr>
            {headers.map((header) => (
              <th key={header.key} className="px-3 py-2 text-left font-medium">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-white"
                  onClick={() => handleSortChange(header.key)}
                  aria-label={`按${header.label}排序`}
                >
                  <span>{header.label}</span>
                  <span aria-hidden="true">{sortIndicator(sortKey, header.key, sortDirection)}</span>
                </button>
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {sortedItems.map((item) => (
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
  )
}
