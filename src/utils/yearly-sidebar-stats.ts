import type { DiaryRecord } from '../services/indexeddb'
import { countVisibleChars } from './word-count'

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

export interface YearlySidebarStats {
  yearWordCount: number
  activeDayCount: number
  mostActiveMonth: number | null
}

function resolveWordCount(record: DiaryRecord): number {
  if (typeof record.wordCount === 'number' && Number.isFinite(record.wordCount) && record.wordCount >= 0) {
    return Math.floor(record.wordCount)
  }
  return typeof record.content === 'string' ? countVisibleChars(record.content) : 0
}

function parseDate(dateKey: string): Date | null {
  const match = DATE_KEY_PATTERN.exec(dateKey)
  if (!match) {
    return null
  }
  const year = Number.parseInt(match[1], 10)
  const month = Number.parseInt(match[2], 10)
  const day = Number.parseInt(match[3], 10)
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null
  }

  const candidate = new Date(year, month - 1, day, 12)
  if (
    candidate.getFullYear() !== year ||
    candidate.getMonth() !== month - 1 ||
    candidate.getDate() !== day
  ) {
    return null
  }

  return candidate
}

export function createEmptyYearlySidebarStats(): YearlySidebarStats {
  return {
    yearWordCount: 0,
    activeDayCount: 0,
    mostActiveMonth: null,
  }
}

export function buildYearlySidebarStats(records: DiaryRecord[], year: number): YearlySidebarStats {
  const activeDateSet = new Set<string>()
  const monthlyCount = new Array<number>(12).fill(0)
  let yearWordCount = 0

  for (const record of records) {
    if (record.type !== 'daily' || typeof record.date !== 'string') {
      continue
    }
    const parsedDate = parseDate(record.date)
    if (!parsedDate || parsedDate.getFullYear() !== year) {
      continue
    }

    yearWordCount += resolveWordCount(record)
    activeDateSet.add(record.date)
    monthlyCount[parsedDate.getMonth()] += 1
  }

  let mostActiveMonth: number | null = null
  let maxCount = 0
  for (let monthIndex = 0; monthIndex < monthlyCount.length; monthIndex += 1) {
    const count = monthlyCount[monthIndex]
    if (count > maxCount) {
      maxCount = count
      mostActiveMonth = monthIndex + 1
    }
  }

  return {
    yearWordCount,
    activeDayCount: activeDateSet.size,
    mostActiveMonth,
  }
}
