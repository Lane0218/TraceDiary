import { useMemo } from 'react'
import { buildMonthGrid } from './month-calendar-utils'

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']
const MONTH_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: 'long',
})

export interface MonthCalendarProps {
  month: Date
  activeDateKey: string
  diaryDateSet: Set<string>
  onPreviousMonth: () => void
  onNextMonth: () => void
  onSelectDate: (dateKey: string) => void
}

export function MonthCalendar({
  month,
  activeDateKey,
  diaryDateSet,
  onPreviousMonth,
  onNextMonth,
  onSelectDate,
}: MonthCalendarProps) {
  const monthTitle = MONTH_FORMATTER.format(month)
  const grid = useMemo(() => buildMonthGrid(month, diaryDateSet), [month, diaryDateSet])

  return (
    <section className="space-y-3" aria-label="month-calendar">
      <header className="flex items-center justify-between gap-2 border-b border-td-line pb-3">
        <button
          type="button"
          onClick={onPreviousMonth}
          aria-label="上个月"
          className="td-btn px-3 py-1 text-xs"
        >
          ◀
        </button>
        <h3 className="font-display text-lg text-td-text sm:text-xl">{monthTitle}</h3>
        <button
          type="button"
          onClick={onNextMonth}
          aria-label="下个月"
          className="td-btn px-3 py-1 text-xs"
        >
          ▶
        </button>
      </header>

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-td-muted sm:gap-2">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label} className="py-1">
            周{label}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {grid.map((cell) => {
          const isActive = cell.dateKey === activeDateKey
          const baseStyle =
            'relative flex h-10 w-full items-center justify-center rounded-[10px] border text-sm transition sm:h-12'
          const monthStyle = cell.inCurrentMonth
            ? 'border-transparent bg-td-surface text-td-text hover:border-td-line hover:bg-[#fcfcfc]'
            : 'border-transparent bg-[#fafafa] text-[#b7b7b7] hover:border-[#ececec]'
          const todayStyle = cell.isToday ? 'font-semibold ring-1 ring-brand-100' : ''
          const activeStyle = isActive ? 'border-brand-500 bg-brand-50 text-brand-600 shadow-thin' : ''

          return (
            <button
              key={cell.dateKey}
              type="button"
              onClick={() => onSelectDate(cell.dateKey)}
              className={`${baseStyle} ${monthStyle} ${todayStyle} ${activeStyle}`}
              aria-current={cell.isToday ? 'date' : undefined}
              aria-label={`选择 ${cell.dateKey}`}
            >
              <span>{cell.day}</span>
              {cell.hasDiary ? (
                <span
                  className="absolute bottom-1 h-1.5 w-1.5 rounded-full bg-td-text"
                  aria-label={`${cell.dateKey} 已记录`}
                />
              ) : null}
            </button>
          )
        })}
      </div>
    </section>
  )
}

export default MonthCalendar
