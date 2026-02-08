import { useMemo } from 'react'
import { List, type RowComponentProps } from 'react-window'
import type { DiaryRecord } from '../../services/indexeddb'
import { buildOnThisDayEntries, type OnThisDayEntry } from './on-this-day-utils'

interface HistoryRowProps {
  entries: OnThisDayEntry[]
  onSelectDate: (dateKey: string) => void
}

export interface OnThisDayListProps {
  targetDate: string
  diaries: DiaryRecord[]
  onSelectDate: (dateKey: string) => void
  isLoading?: boolean
  loadError?: string | null
}

function OnThisDayRow({ index, style, entries, onSelectDate }: RowComponentProps<HistoryRowProps>) {
  const entry = entries[index]

  return (
    <div style={style} className="px-2 py-1.5">
      <button
        type="button"
        onClick={() => onSelectDate(entry.date)}
        className="h-full w-full rounded-xl border border-slate-200 bg-white/90 p-3 text-left transition hover:border-brand-300 hover:shadow-sm"
        aria-label={`打开 ${entry.date}`}
        data-testid="history-card"
      >
        <p className="text-sm font-semibold text-ink-900">{entry.year} 年</p>
        <p className="text-xs text-slate-500">{entry.date}</p>
        <p
          className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700"
          style={{
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {entry.preview}
        </p>
        <p className="mt-2 text-xs text-slate-500">字数 {entry.wordCount}</p>
      </button>
    </div>
  )
}

export function OnThisDayList({
  targetDate,
  diaries,
  onSelectDate,
  isLoading = false,
  loadError = null,
}: OnThisDayListProps) {
  const entries = useMemo(() => buildOnThisDayEntries(targetDate, diaries), [targetDate, diaries])

  if (loadError) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50/80 p-4 text-sm text-rose-700">
        往年今日读取失败：{loadError}
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-500">
        正在加载往年今日...
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-4 text-sm text-slate-500">
        当前日期暂无往年记录。
      </div>
    )
  }

  return (
    <List
      rowCount={entries.length}
      rowHeight={138}
      rowComponent={OnThisDayRow}
      rowProps={{ entries, onSelectDate }}
      defaultHeight={360}
      overscanCount={4}
      className="rounded-2xl border border-slate-200 bg-slate-50/70"
      style={{ height: 360, width: '100%' }}
      aria-label="往年今日列表"
      data-testid="on-this-day-virtual-list"
    />
  )
}

export default OnThisDayList
