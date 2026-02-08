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
    <section className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm sm:p-5" aria-label="month-calendar">
      <header className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={onPreviousMonth}
          aria-label="上个月"
          className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-700 transition hover:border-brand-200 hover:text-brand-600"
        >
          ◀
        </button>
        <h3 className="text-lg font-semibold text-ink-900 sm:text-xl">{monthTitle}</h3>
        <button
          type="button"
          onClick={onNextMonth}
          aria-label="下个月"
          className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-700 transition hover:border-brand-200 hover:text-brand-600"
        >
          ▶
        </button>
      </header>

      <div className="mb-2 grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-500 sm:gap-2">
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
            'relative flex h-11 w-full items-center justify-center rounded-xl border text-sm transition sm:h-14 sm:text-base'
          const monthStyle = cell.inCurrentMonth
            ? 'border-slate-200 bg-white text-slate-800 hover:border-brand-300 hover:text-brand-600'
            : 'border-slate-100 bg-slate-50/80 text-slate-400 hover:border-slate-200'
          const todayStyle = cell.isToday ? 'font-semibold ring-1 ring-brand-300' : ''
          const activeStyle = isActive ? 'border-brand-500 bg-brand-50 text-brand-700' : ''

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
                  className="absolute bottom-1 h-1.5 w-1.5 rounded-full bg-brand-500"
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
