import { useMemo, type CSSProperties } from 'react'
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
  viewportHeight?: number
}

const previewFadeMaskStyle: CSSProperties = {
  WebkitMaskImage: 'linear-gradient(to bottom, #000 68%, transparent 100%)',
  maskImage: 'linear-gradient(to bottom, #000 68%, transparent 100%)',
  WebkitMaskRepeat: 'no-repeat',
  maskRepeat: 'no-repeat',
  WebkitMaskSize: '100% 100%',
  maskSize: '100% 100%',
}

function OnThisDayRow({ index, style, entries, onSelectDate }: RowComponentProps<HistoryRowProps>) {
  const entry = entries[index]

  return (
    <div style={style} className="px-1 py-1.5">
      <button
        type="button"
        onClick={() => onSelectDate(entry.date)}
        className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[10px] border border-td-line bg-td-surface p-3 text-left transition hover:border-[#cccccc] hover:bg-[#fcfcfc]"
        aria-label={`打开 ${entry.date}`}
        data-testid="history-card"
      >
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-full border border-td-line bg-td-soft px-2 py-0.5 text-[11px] text-td-muted">
            {entry.year}
          </span>
          <p className="text-xs text-td-muted">{entry.date}</p>
        </div>
        <p
          className="mt-2 min-h-0 flex-1 overflow-hidden whitespace-pre-line break-words text-sm leading-6 text-td-text"
          style={previewFadeMaskStyle}
        >
          {entry.preview}
        </p>
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
  viewportHeight = 360,
}: OnThisDayListProps) {
  const entries = useMemo(() => buildOnThisDayEntries(targetDate, diaries), [targetDate, diaries])
  const panelStyle: CSSProperties = { height: viewportHeight, width: '100%' }

  if (loadError) {
    return (
      <div className="rounded-[10px] border border-red-200 bg-red-50 p-4 text-sm text-red-700" style={panelStyle}>
        往年今日读取失败：{loadError}
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="rounded-[10px] border border-td-line bg-td-soft p-4 text-sm text-td-muted" style={panelStyle}>
        正在加载往年今日...
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div
        className="rounded-[10px] border border-dashed border-td-line bg-td-soft p-4 text-sm text-td-muted"
        style={panelStyle}
      >
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
      defaultHeight={viewportHeight}
      overscanCount={4}
      className="rounded-[10px] bg-transparent"
      style={panelStyle}
      aria-label="往年今日列表"
      data-testid="on-this-day-virtual-list"
    />
  )
}

export default OnThisDayList
