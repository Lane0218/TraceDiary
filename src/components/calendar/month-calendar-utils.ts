import { formatDateKey } from '../../utils/date'

export interface CalendarDayCell {
  date: Date
  dateKey: string
  day: number
  inCurrentMonth: boolean
  isToday: boolean
  hasDiary: boolean
}

export function buildMonthGrid(
  month: Date,
  diaryDateSet: Set<string>,
  todayDateKey = formatDateKey(new Date()),
): CalendarDayCell[] {
  const year = month.getFullYear()
  const monthIndex = month.getMonth()
  const firstDay = new Date(year, monthIndex, 1)
  const gridStart = new Date(year, monthIndex, 1 - firstDay.getDay())

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index)
    const dateKey = formatDateKey(date)

    return {
      date,
      dateKey,
      day: date.getDate(),
      inCurrentMonth: date.getMonth() === monthIndex && date.getFullYear() === year,
      isToday: dateKey === todayDateKey,
      hasDiary: diaryDateSet.has(dateKey),
    }
  })
}
