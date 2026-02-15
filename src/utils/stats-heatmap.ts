import type { DiaryRecord } from '../services/indexeddb'
import type { YearlyStatsItem } from '../types/stats'
import { formatDateKey } from './date'

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export interface YearlyHeatmapCell {
  dateKey: string
  weekIndex: number
  dayOfWeek: number
  wordCount: number
  intensity: 0 | 1 | 2 | 3 | 4
}

export interface YearlyHeatmapWeek {
  index: number
  days: Array<YearlyHeatmapCell | null>
}

export interface YearlyHeatmapMonthTick {
  month: number
  label: string
  weekIndex: number
}

export interface YearlyHeatmapModel {
  year: number
  weeks: YearlyHeatmapWeek[]
  weekCount: number
  monthTicks: YearlyHeatmapMonthTick[]
  totalWordCount: number
  activeDayCount: number
  maxWordCount: number
  intensityThresholds: [number, number, number]
}

function countWords(content: string): number {
  const normalized = content.trim()
  if (!normalized) {
    return 0
  }
  return normalized.split(/\s+/u).length
}

function resolveDailyWordCount(record: DiaryRecord): number {
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

function shiftDays(base: Date, offset: number): Date {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + offset, 12)
}

function diffDays(left: Date, right: Date): number {
  const leftAtNoon = new Date(left.getFullYear(), left.getMonth(), left.getDate(), 12)
  const rightAtNoon = new Date(right.getFullYear(), right.getMonth(), right.getDate(), 12)
  return Math.round((leftAtNoon.getTime() - rightAtNoon.getTime()) / 86_400_000)
}

function percentile(sortedValues: number[], ratio: number): number {
  if (sortedValues.length === 0) {
    return 0
  }
  if (sortedValues.length === 1) {
    return sortedValues[0]
  }

  const position = (sortedValues.length - 1) * ratio
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  if (lower === upper) {
    return sortedValues[lower]
  }

  const weight = position - lower
  return Math.round(sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight)
}

function buildIntensityThresholds(nonZeroWordCounts: number[]): [number, number, number] {
  if (nonZeroWordCounts.length === 0) {
    return [0, 0, 0]
  }

  return [
    percentile(nonZeroWordCounts, 0.25),
    percentile(nonZeroWordCounts, 0.5),
    percentile(nonZeroWordCounts, 0.75),
  ]
}

function resolveIntensity(
  wordCount: number,
  maxWordCount: number,
  thresholds: [number, number, number],
): 0 | 1 | 2 | 3 | 4 {
  if (wordCount <= 0 || maxWordCount <= 0) {
    return 0
  }

  const [q1, q2, q3] = thresholds
  if (q1 === q3) {
    return Math.max(1, Math.min(4, Math.ceil((wordCount / maxWordCount) * 4))) as 1 | 2 | 3 | 4
  }

  if (wordCount <= q1) {
    return 1
  }
  if (wordCount <= q2) {
    return 2
  }
  if (wordCount <= q3) {
    return 3
  }
  return 4
}

export function buildHeatmapAvailableYears(
  records: DiaryRecord[],
  yearlyItems: YearlyStatsItem[] = [],
  now = new Date(),
): number[] {
  const yearSet = new Set<number>()

  for (const record of records) {
    if (record.type !== 'daily') {
      continue
    }
    const parsed = parseDateKey(record.date)
    if (!parsed) {
      continue
    }
    yearSet.add(parsed.getFullYear())
  }

  for (const item of yearlyItems) {
    if (item.activeDayCount > 0) {
      yearSet.add(item.year)
    }
  }

  if (yearSet.size === 0) {
    yearSet.add(now.getFullYear())
  }

  return [...yearSet].sort((left, right) => right - left)
}

export function buildYearlyHeatmapModel(records: DiaryRecord[], year: number): YearlyHeatmapModel {
  const dayWordMap = new Map<string, number>()

  for (const record of records) {
    if (record.type !== 'daily') {
      continue
    }

    const parsed = parseDateKey(record.date)
    if (!parsed || parsed.getFullYear() !== year) {
      continue
    }

    const dateKey = formatDateKey(parsed)
    const nextWordCount = resolveDailyWordCount(record)
    const prevWordCount = dayWordMap.get(dateKey) ?? 0
    dayWordMap.set(dateKey, Math.max(prevWordCount, nextWordCount))
  }

  const nonZeroWordCounts = [...dayWordMap.values()].filter((value) => value > 0).sort((left, right) => left - right)
  const totalWordCount = [...dayWordMap.values()].reduce((sum, value) => sum + value, 0)
  const maxWordCount = nonZeroWordCounts[nonZeroWordCounts.length - 1] ?? 0
  const intensityThresholds = buildIntensityThresholds(nonZeroWordCounts)

  const firstDay = new Date(year, 0, 1, 12)
  const lastDay = new Date(year, 11, 31, 12)
  const firstGridDay = shiftDays(firstDay, -firstDay.getDay())
  const lastGridDay = shiftDays(lastDay, 6 - lastDay.getDay())
  const totalGridDays = diffDays(lastGridDay, firstGridDay) + 1
  const weekCount = Math.ceil(totalGridDays / 7)

  const weeks: YearlyHeatmapWeek[] = []
  for (let weekIndex = 0; weekIndex < weekCount; weekIndex += 1) {
    const days: Array<YearlyHeatmapCell | null> = []
    for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek += 1) {
      const cursor = shiftDays(firstGridDay, weekIndex * 7 + dayOfWeek)
      if (cursor.getFullYear() !== year) {
        days.push(null)
        continue
      }

      const dateKey = formatDateKey(cursor)
      const wordCount = dayWordMap.get(dateKey) ?? 0
      days.push({
        dateKey,
        weekIndex,
        dayOfWeek,
        wordCount,
        intensity: resolveIntensity(wordCount, maxWordCount, intensityThresholds),
      })
    }

    weeks.push({
      index: weekIndex,
      days,
    })
  }

  const monthTicks: YearlyHeatmapMonthTick[] = []
  for (let month = 0; month < 12; month += 1) {
    const monthFirstDay = new Date(year, month, 1, 12)
    const weekIndex = Math.floor(diffDays(monthFirstDay, firstGridDay) / 7)
    monthTicks.push({
      month: month + 1,
      label: `${month + 1}月`,
      weekIndex,
    })
  }

  return {
    year,
    weeks,
    weekCount,
    monthTicks,
    totalWordCount,
    activeDayCount: dayWordMap.size,
    maxWordCount,
    intensityThresholds,
  }
}
