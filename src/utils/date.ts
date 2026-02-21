export const DIARY_DAY_START_HOUR = 2

export function formatDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

export function getDiaryDateKey(now: Date = new Date(), dayStartHour: number = DIARY_DAY_START_HOUR): string {
  const baseDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (now.getHours() < dayStartHour) {
    baseDate.setDate(baseDate.getDate() - 1)
  }
  return formatDateKey(baseDate)
}
