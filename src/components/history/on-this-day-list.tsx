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
        className="h-full w-full rounded-[10px] border border-td-line bg-td-surface p-3 text-left transition hover:border-[#cccccc]"
        aria-label={`打开 ${entry.date}`}
        data-testid="history-card"
      >
        <p className="font-display text-sm text-td-text">{entry.year} 年</p>
        <p className="text-xs text-td-muted">{entry.date}</p>
        <p
          className="mt-2 whitespace-pre-line text-sm leading-6 text-td-text"
          style={{
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {entry.preview}
        </p>
        <p className="mt-2 text-xs text-td-muted">字数 {entry.wordCount}</p>
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
      <div className="rounded-[10px] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        往年今日读取失败：{loadError}
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="rounded-[10px] border border-td-line bg-td-soft p-4 text-sm text-td-muted">
        正在加载往年今日...
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-[10px] border border-dashed border-td-line bg-td-soft p-4 text-sm text-td-muted">
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
      className="rounded-[10px] border border-td-line bg-td-soft"
      style={{ height: 360, width: '100%' }}
      aria-label="往年今日列表"
      data-testid="on-this-day-virtual-list"
    />
  )
}

export default OnThisDayList
