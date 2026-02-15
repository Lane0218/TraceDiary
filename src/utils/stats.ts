import type { DiaryRecord } from '../services/indexeddb'
import type {
  MonthlyStatsItem,
  MonthlyTrendPoint,
  StatsChartModel,
  StatsSummary,
  YearlyStatsItem,
  YearlyTrendPoint,
} from '../types/stats'
import { formatDateKey } from './date'

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

interface YearlyAccumulator {
  year: number
  dailyCount: number
  yearlySummaryCount: number
  totalWordCount: number
  activeDateSet: Set<string>
}

function countWords(content: string): number {
  const normalized = content.trim()
  if (!normalized) {
    return 0
  }
  return normalized.split(/\s+/u).length
}

function resolveWordCount(record: DiaryRecord): number {
  if (typeof record.wordCount === 'number' && Number.isFinite(record.wordCount) && record.wordCount >= 0) {
    return Math.floor(record.wordCount)
  }
  return typeof record.content === 'string' ? countWords(record.content) : 0
}

function parseDateKey(dateKey: string): Date | null {
  if (!DATE_KEY_PATTERN.test(dateKey)) {
    return null
  }
  const [yearText, monthText, dayText] = dateKey.split('-')
  const year = Number.parseInt(yearText, 10)
  const month = Number.parseInt(monthText, 10)
  const day = Number.parseInt(dayText, 10)
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

function diffDays(left: Date, right: Date): number {
  const leftAtNoon = new Date(left.getFullYear(), left.getMonth(), left.getDate(), 12)
  const rightAtNoon = new Date(right.getFullYear(), right.getMonth(), right.getDate(), 12)
  const msDiff = leftAtNoon.getTime() - rightAtNoon.getTime()
  return Math.round(msDiff / 86_400_000)
}

function shiftDateByDays(base: Date, days: number): Date {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + days, 12)
}

function normalizeDateKey(date: string): string | null {
  return parseDateKey(date) ? date : null
}

function getRecordYear(record: DiaryRecord): number | null {
  if (record.type === 'yearly_summary' && typeof record.year === 'number' && Number.isFinite(record.year)) {
    return record.year
  }
  if (typeof record.date === 'string') {
    const parsed = parseDateKey(record.date)
    if (parsed) {
      return parsed.getFullYear()
    }
  }
  return null
}

function getRecordMonth(record: DiaryRecord): { year: number; month: number } | null {
  if (typeof record.date === 'string') {
    const parsed = parseDateKey(record.date)
    if (parsed) {
      return {
        year: parsed.getFullYear(),
        month: parsed.getMonth() + 1,
      }
    }
  }
  if (record.type === 'yearly_summary') {
    const year = getRecordYear(record)
    if (year !== null) {
      return {
        year,
        month: 12,
      }
    }
  }
  return null
}

function buildYearlyItems(records: DiaryRecord[]): YearlyStatsItem[] {
  const yearlyMap = new Map<number, YearlyAccumulator>()

  for (const record of records) {
    if (record.type !== 'daily' && record.type !== 'yearly_summary') {
      continue
    }
    const year = getRecordYear(record)
    if (year === null) {
      continue
    }

    const existed = yearlyMap.get(year)
    const accumulator: YearlyAccumulator =
      existed ??
      {
        year,
        dailyCount: 0,
        yearlySummaryCount: 0,
        totalWordCount: 0,
        activeDateSet: new Set<string>(),
      }

    const wordCount = resolveWordCount(record)
    accumulator.totalWordCount += wordCount

    if (record.type === 'daily') {
      accumulator.dailyCount += 1
      const dateKey = normalizeDateKey(record.date)
      if (dateKey) {
        accumulator.activeDateSet.add(dateKey)
      }
    } else {
      accumulator.yearlySummaryCount += 1
    }

    yearlyMap.set(year, accumulator)
  }

  return [...yearlyMap.values()]
    .map((item) => ({
      year: item.year,
      dailyCount: item.dailyCount,
      yearlySummaryCount: item.yearlySummaryCount,
      totalWordCount: item.totalWordCount,
      activeDayCount: item.activeDateSet.size,
    }))
    .sort((left, right) => right.year - left.year)
}

function buildRecentMonthItems(records: DiaryRecord[], now: Date): MonthlyStatsItem[] {
  const monthWindow: Array<{ year: number; month: number; key: string; label: string }> = []
  const monthMap = new Map<string, MonthlyStatsItem>()

  for (let offset = 11; offset >= 0; offset -= 1) {
    const anchor = new Date(now.getFullYear(), now.getMonth() - offset, 1, 12)
    const year = anchor.getFullYear()
    const month = anchor.getMonth() + 1
    const key = `${year}-${String(month).padStart(2, '0')}`
    monthWindow.push({
      year,
      month,
      key,
      label: key,
    })
    monthMap.set(key, {
      year,
      month,
      label: key,
      dailyCount: 0,
      yearlySummaryCount: 0,
      totalWordCount: 0,
    })
  }

  for (const record of records) {
    if (record.type !== 'daily' && record.type !== 'yearly_summary') {
      continue
    }
    const monthInfo = getRecordMonth(record)
    if (!monthInfo) {
      continue
    }
    const key = `${monthInfo.year}-${String(monthInfo.month).padStart(2, '0')}`
    const bucket = monthMap.get(key)
    if (!bucket) {
      continue
    }

    bucket.totalWordCount += resolveWordCount(record)
    if (record.type === 'daily') {
      bucket.dailyCount += 1
    } else {
      bucket.yearlySummaryCount += 1
    }
  }

  return monthWindow.map((month) => monthMap.get(month.key) as MonthlyStatsItem)
}

function computeLongestStreak(dailyDateKeys: string[]): number {
  if (dailyDateKeys.length === 0) {
    return 0
  }

  const ascending = [...dailyDateKeys].sort((left, right) => left.localeCompare(right))
  let longest = 1
  let current = 1

  for (let index = 1; index < ascending.length; index += 1) {
    const prev = parseDateKey(ascending[index - 1])
    const next = parseDateKey(ascending[index])
    if (!prev || !next) {
      current = 1
      continue
    }

    if (diffDays(next, prev) === 1) {
      current += 1
      longest = Math.max(longest, current)
      continue
    }

    current = 1
  }

  return longest
}

function computeAnchorStreak(anchorDate: Date, dailyDateSet: Set<string>): number {
  let cursor = anchorDate
  let count = 0

  while (dailyDateSet.has(formatDateKey(cursor))) {
    count += 1
    cursor = shiftDateByDays(cursor, -1)
  }

  return count
}

function collectDailyDateKeys(records: DiaryRecord[]): string[] {
  const dateSet = new Set<string>()

  for (const record of records) {
    if (record.type !== 'daily') {
      continue
    }
    const normalized = normalizeDateKey(record.date)
    if (normalized) {
      dateSet.add(normalized)
    }
  }

  return [...dateSet]
}

export function buildStatsSummary(records: DiaryRecord[], now = new Date()): StatsSummary {
  const filteredRecords = records.filter((record) => record.type === 'daily' || record.type === 'yearly_summary')
  const yearlyItems = buildYearlyItems(filteredRecords)
  const recentMonthItems = buildRecentMonthItems(filteredRecords, now)
  const totalWordCount = filteredRecords.reduce((sum, record) => sum + resolveWordCount(record), 0)
  const totalYearlySummaryCount = filteredRecords.filter((record) => record.type === 'yearly_summary').length
  const dailyDateKeys = collectDailyDateKeys(filteredRecords)
  const dailyDateSet = new Set(dailyDateKeys)
  const totalDailyCount = dailyDateKeys.length

  const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12)
  const todayKey = formatDateKey(todayDate)
  const latestDateKey = [...dailyDateKeys].sort((left, right) => right.localeCompare(left))[0] ?? null
  const hasTodayRecord = dailyDateSet.has(todayKey)
  const streakAnchorKey = hasTodayRecord ? todayKey : latestDateKey
  const streakAnchorDate = streakAnchorKey ? parseDateKey(streakAnchorKey) : null

  let currentStreakDays = 0
  let streakStatus: StatsSummary['streakStatus'] = 'none'
  let streakGapDays: number | null = null

  if (streakAnchorDate && streakAnchorKey) {
    currentStreakDays = computeAnchorStreak(streakAnchorDate, dailyDateSet)
    if (hasTodayRecord) {
      streakStatus = 'active'
      streakGapDays = 0
    } else {
      streakStatus = 'broken'
      const gap = diffDays(todayDate, streakAnchorDate)
      streakGapDays = gap > 0 ? gap : 1
    }
  }

  const longestStreakDays = computeLongestStreak(dailyDateKeys)
  const currentYear = now.getFullYear()
  const currentYearItem = yearlyItems.find((item) => item.year === currentYear)

  return {
    totalDailyCount,
    totalYearlySummaryCount,
    totalWordCount,
    currentStreakDays,
    longestStreakDays,
    currentYearWordCount: currentYearItem?.totalWordCount ?? 0,
    currentYearDailyCount: currentYearItem?.dailyCount ?? 0,
    currentYearSummaryCount: currentYearItem?.yearlySummaryCount ?? 0,
    streakStatus,
    streakLastDate: streakAnchorKey,
    streakGapDays,
    yearlyItems,
    recentMonthItems,
  }
}

export function buildStatsChartModel(summary: StatsSummary): StatsChartModel {
  const monthly: MonthlyTrendPoint[] = summary.recentMonthItems.map((item, index, array) => {
    const entryCount = item.dailyCount + item.yearlySummaryCount
    const prev = index > 0 ? array[index - 1] : null
    const momWordDelta = prev ? item.totalWordCount - prev.totalWordCount : null
    const momWordDeltaRatio =
      prev && prev.totalWordCount > 0 && momWordDelta !== null ? momWordDelta / prev.totalWordCount : null

    return {
      label: item.label,
      totalWordCount: item.totalWordCount,
      entryCount,
      momWordDelta,
      momWordDeltaRatio,
    }
  })

  const yearly: YearlyTrendPoint[] = [...summary.yearlyItems]
    .sort((left, right) => left.year - right.year)
    .map((item) => ({
      year: item.year,
      totalWordCount: item.totalWordCount,
      activeDayCount: item.activeDayCount,
      entryCount: item.dailyCount + item.yearlySummaryCount,
    }))

  const monthlyWordMax = Math.max(1, ...monthly.map((item) => item.totalWordCount))
  const monthlyEntryMax = Math.max(1, ...monthly.map((item) => item.entryCount))
  const yearlyWordMax = Math.max(1, ...yearly.map((item) => item.totalWordCount))
  const yearlyActiveDayMax = Math.max(1, ...yearly.map((item) => item.activeDayCount))

  return {
    monthly,
    yearly,
    monthlyWordMax,
    monthlyEntryMax,
    yearlyWordMax,
    yearlyActiveDayMax,
  }
}
