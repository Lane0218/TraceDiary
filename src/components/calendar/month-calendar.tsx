import { useMemo, useState } from 'react'
import { buildMonthGrid } from './month-calendar-utils'

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']
const MONTH_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: 'long',
})

const MONTH_BUTTONS = Array.from({ length: 12 }, (_, index) => index)

export interface MonthCalendarProps {
  month: Date
  activeDateKey: string
  diaryDateSet: Set<string>
  onPreviousMonth: () => void
  onNextMonth: () => void
  onSelectDate: (dateKey: string) => void
  onPickMonth: (year: number, monthIndex: number) => void
}

export function MonthCalendar({
  month,
  activeDateKey,
  diaryDateSet,
  onPreviousMonth,
  onNextMonth,
  onSelectDate,
  onPickMonth,
}: MonthCalendarProps) {
  const monthTitle = MONTH_FORMATTER.format(month)
  const grid = useMemo(() => buildMonthGrid(month, diaryDateSet), [month, diaryDateSet])
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const [draftYear, setDraftYear] = useState(month.getFullYear())
  const [draftMonth, setDraftMonth] = useState(month.getMonth())

  const applyPickerSelection = () => {
    onPickMonth(draftYear, draftMonth)
    setIsPickerOpen(false)
  }

  const resetToCurrentMonth = () => {
    const now = new Date()
    setDraftYear(now.getFullYear())
    setDraftMonth(now.getMonth())
  }

  return (
    <section className="space-y-3" aria-label="month-calendar">
      <header className="relative flex items-center justify-between gap-2 border-b border-td-line pb-3">
        <button type="button" onClick={onPreviousMonth} aria-label="上个月" className="td-btn px-3 py-1 text-xs">
          ◀
        </button>

        <button
          type="button"
          className="rounded-[10px] border border-transparent px-3 py-1 font-display text-lg text-td-text transition hover:border-td-line sm:text-xl"
          onClick={() => {
            setIsPickerOpen((prev) => {
              if (prev) {
                return false
              }
              setDraftYear(month.getFullYear())
              setDraftMonth(month.getMonth())
              return true
            })
          }}
          aria-label="选择年月"
        >
          {monthTitle}
        </button>

        <button type="button" onClick={onNextMonth} aria-label="下个月" className="td-btn px-3 py-1 text-xs">
          ▶
        </button>

        {isPickerOpen ? (
          <div className="absolute left-1/2 top-12 z-20 w-[290px] -translate-x-1/2 rounded-[10px] border border-td-line bg-td-surface p-3 shadow-card td-fade-in">
            <div className="mb-2 flex items-center gap-2">
              <label htmlFor="month-picker-year" className="text-xs text-td-muted">
                年份
              </label>
              <input
                id="month-picker-year"
                type="number"
                min={1970}
                max={9999}
                value={draftYear}
                onChange={(event) => {
                  const parsed = Number.parseInt(event.target.value, 10)
                  if (Number.isFinite(parsed) && parsed >= 1970 && parsed <= 9999) {
                    setDraftYear(parsed)
                  }
                }}
                className="td-input w-28"
              />
              <button type="button" className="td-btn ml-auto px-2 py-1 text-xs" onClick={resetToCurrentMonth}>
                回到本月
              </button>
            </div>

            <div className="grid grid-cols-4 gap-1.5">
              {MONTH_BUTTONS.map((monthIndex) => {
                const active = monthIndex === draftMonth
                return (
                  <button
                    key={monthIndex}
                    type="button"
                    className={`rounded-[8px] border px-2 py-1.5 text-xs transition ${
                      active
                        ? 'border-brand-500 bg-brand-50 text-brand-600'
                        : 'border-td-line bg-td-surface text-td-muted hover:border-[#cccccc]'
                    }`}
                    onClick={() => {
                      setDraftMonth(monthIndex)
                    }}
                  >
                    {monthIndex + 1}月
                  </button>
                )
              })}
            </div>

            <div className="mt-3 flex items-center justify-end gap-2">
              <button type="button" className="td-btn px-2 py-1 text-xs" onClick={() => setIsPickerOpen(false)}>
                取消
              </button>
              <button type="button" className="td-btn td-btn-primary px-2 py-1 text-xs" onClick={applyPickerSelection}>
                确定
              </button>
            </div>
          </div>
        ) : null}
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
                <span className="absolute bottom-1 h-1.5 w-1.5 rounded-full bg-td-text" aria-label={`${cell.dateKey} 已记录`} />
              ) : null}
            </button>
          )
        })}
      </div>
    </section>
  )
}

export default MonthCalendar
