import { useMemo, useState } from 'react'
import { buildMonthGrid } from './month-calendar-utils'

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']
const MONTH_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: 'long',
})

const MONTH_BUTTONS = Array.from({ length: 12 }, (_, index) => index)

const MIN_YEAR = 1970
const MAX_YEAR = 9999

function parseValidYearInput(value: string): number | null {
  if (value.length === 0) {
    return null
  }
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < MIN_YEAR || parsed > MAX_YEAR) {
    return null
  }
  return parsed
}

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
  const [draftYearInput, setDraftYearInput] = useState(String(month.getFullYear()))
  const [draftMonth, setDraftMonth] = useState(month.getMonth())

  const applyDraftYear = (nextYear: number) => {
    if (!Number.isFinite(nextYear) || nextYear < MIN_YEAR || nextYear > MAX_YEAR) {
      return
    }
    setDraftYear(nextYear)
    setDraftYearInput(String(nextYear))
    onPickMonth(nextYear, draftMonth)
  }

  const applyPickerSelection = () => {
    onPickMonth(draftYear, draftMonth)
    setIsPickerOpen(false)
  }

  const resetToCurrentMonth = () => {
    const now = new Date()
    const year = now.getFullYear()
    setDraftYear(year)
    setDraftYearInput(String(year))
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
              const nextYear = month.getFullYear()
              setDraftYear(nextYear)
              setDraftYearInput(String(nextYear))
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
          <div className="absolute left-1/2 top-12 z-20 -translate-x-1/2">
            <div className="w-[244px] rounded-[10px] border border-td-line bg-[#f8f8f8] p-3 shadow-thin td-fade-in">
              <div className="mb-2.5 flex items-center gap-2">
                <div className="inline-flex h-9 items-center overflow-hidden rounded-[8px] border border-[#d6d6d6] bg-white">
                  <button
                    type="button"
                    aria-label="年份减一"
                    disabled={draftYear <= MIN_YEAR}
                    className="h-full w-8 text-sm text-td-muted transition hover:bg-[#f5f5f5] hover:text-td-text disabled:cursor-not-allowed disabled:text-[#c5c5c5] disabled:hover:bg-white"
                    onClick={() => applyDraftYear(draftYear - 1)}
                  >
                    &#8249;
                  </button>
                  <input
                    id="month-picker-year"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    aria-label="年份"
                    value={draftYearInput}
                    onChange={(event) => {
                      const sanitized = event.target.value.replace(/\D+/g, '').slice(0, 4)
                      setDraftYearInput(sanitized)
                      const parsed = parseValidYearInput(sanitized)
                      if (parsed !== null) {
                        applyDraftYear(parsed)
                      }
                    }}
                    onBlur={() => {
                      const parsed = parseValidYearInput(draftYearInput)
                      if (parsed === null) {
                        setDraftYearInput(String(draftYear))
                        return
                      }
                      setDraftYearInput(String(parsed))
                    }}
                    className="h-full w-[68px] border-x border-[#e1e1e1] bg-white px-1.5 text-center text-[15px] text-td-text outline-none"
                  />
                  <button
                    type="button"
                    aria-label="年份加一"
                    disabled={draftYear >= MAX_YEAR}
                    className="h-full w-8 text-sm text-td-muted transition hover:bg-[#f5f5f5] hover:text-td-text disabled:cursor-not-allowed disabled:text-[#c5c5c5] disabled:hover:bg-white"
                    onClick={() => applyDraftYear(draftYear + 1)}
                  >
                    &#8250;
                  </button>
                </div>
                <button
                  type="button"
                  aria-label="回到本月"
                  title="回到本月"
                  className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-[#d2d2d2] bg-white text-td-muted transition hover:border-[#bcbcbc] hover:bg-[#fafafa] hover:text-td-text"
                  onClick={resetToCurrentMonth}
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 16 16"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.35"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M6.2 4.6L3.2 7.6l3 3" />
                    <path d="M3.6 7.6h5.7A3.7 3.7 0 0 1 13 11.3v.9" />
                  </svg>
                </button>
              </div>

              <div className="grid grid-cols-4 justify-items-center gap-1.5">
                {MONTH_BUTTONS.map((monthIndex) => {
                  const active = monthIndex === draftMonth
                  return (
                    <button
                      key={monthIndex}
                      type="button"
                      className={`h-8 w-[46px] rounded-[8px] border px-1 py-1 text-[13px] font-medium transition ${
                        active
                          ? 'border-[#202020] bg-[#ececec] text-td-text shadow-thin'
                          : 'border-[#d4d4d4] bg-white text-td-muted hover:border-[#bcbcbc] hover:text-td-text'
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
                <button
                  type="button"
                  className="rounded-[8px] border border-[#d2d2d2] bg-white px-2.5 py-1 text-xs text-td-muted transition hover:border-[#bcbcbc] hover:text-td-text"
                  onClick={() => setIsPickerOpen(false)}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="rounded-[8px] border border-[#1f1f1f] bg-[#1f1f1f] px-2.5 py-1 text-xs text-white transition hover:border-black hover:bg-black"
                  onClick={applyPickerSelection}
                >
                  确定
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </header>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-td-muted sm:gap-1.5">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label} className="py-1">
            周{label}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {grid.map((cell) => {
          const isActive = cell.dateKey === activeDateKey
          const hasDiaryHighlight = cell.inCurrentMonth && cell.hasDiary
          const baseStyle =
            'relative flex h-[34px] w-full items-center justify-center rounded-[8px] border text-sm transition sm:h-[35px]'
          const monthStyle = cell.inCurrentMonth
            ? hasDiaryHighlight
              ? 'border-[#d7c9ab] bg-[#f4eee0] text-[#4a4335] hover:border-[#c8b894] hover:bg-[#eee4cf]'
              : 'border-transparent bg-td-surface text-td-text hover:border-td-line hover:bg-[#fcfcfc]'
            : 'border-transparent bg-[#fafafa] text-[#b7b7b7] hover:border-[#ececec]'
          const todayStyle = cell.isToday ? 'font-semibold ring-1 ring-brand-100' : ''
          const activeStyle = isActive
            ? 'border-[#3f4742] bg-[#e7ece9] text-[#2f3a43] shadow-thin hover:border-[#3f4742] hover:bg-[#e7ece9]'
            : ''
          const visualStyle = isActive ? activeStyle : monthStyle

          return (
            <button
              key={cell.dateKey}
              type="button"
              onClick={() => onSelectDate(cell.dateKey)}
              className={`${baseStyle} ${visualStyle} ${todayStyle}`}
              aria-current={cell.isToday ? 'date' : undefined}
              aria-label={`选择 ${cell.dateKey}`}
              data-date-key={cell.dateKey}
              data-has-diary={hasDiaryHighlight ? 'true' : 'false'}
            >
              <span>{cell.day}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

export default MonthCalendar
