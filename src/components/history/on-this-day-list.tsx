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
    <div style={style} className="px-0.5 py-1.5">
      <button
        type="button"
        onClick={() => onSelectDate(entry.date)}
        className="group flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[12px] border border-[#ddd4bf] bg-[linear-gradient(180deg,#fffef8_0%,#fbf7ee_100%)] p-3.5 text-left shadow-[0_1px_0_rgba(255,255,255,0.88),0_6px_14px_rgba(42,32,14,0.06)] transition duration-200 hover:-translate-y-[1px] hover:border-[#ccbfa1] hover:shadow-[0_1px_0_rgba(255,255,255,0.94),0_10px_18px_rgba(42,32,14,0.11)]"
        aria-label={`打开 ${entry.date}`}
        data-testid="history-card"
      >
        <div className="flex shrink-0 items-center gap-2.5">
          <span className="rounded-full border border-[#dccfb1] bg-[#f4ecd8] px-2 py-0.5 text-[11px] font-medium text-[#6f6347]">
            {entry.year}
          </span>
          <p className="text-xs font-medium tracking-[0.01em] text-[#736c5e]">{entry.date}</p>
        </div>
        <p
          className="mt-2.5 min-h-0 flex-1 overflow-hidden whitespace-pre-line break-words text-sm leading-6 text-[#2d2a24]"
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
}: OnThisDayListProps) {
  const entries = useMemo(() => buildOnThisDayEntries(targetDate, diaries), [targetDate, diaries])

  if (loadError) {
    return (
      <div className="rounded-[12px] border border-red-200 bg-red-50/90 p-4 text-sm text-red-700">
        往年今日读取失败：{loadError}
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="rounded-[12px] border border-[#ddd4bf] bg-[#f5f0e4] p-4 text-sm text-[#6f6859]">
        正在加载往年今日...
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-[12px] border border-dashed border-[#d9cfba] bg-[#f7f2e8] p-4 text-sm text-[#6f6859]">
        当前日期暂无往年记录。
      </div>
    )
  }

  return (
    <List
      rowCount={entries.length}
      rowHeight={146}
      rowComponent={OnThisDayRow}
      rowProps={{ entries, onSelectDate }}
      defaultHeight={364}
      overscanCount={4}
      className="rounded-[12px] bg-transparent"
      style={{ height: 364, width: '100%' }}
      aria-label="往年今日列表"
      data-testid="on-this-day-virtual-list"
    />
  )
}

export default OnThisDayList
