import { describe, expect, it } from 'vitest'
import type { DiaryRecord } from '../../services/indexeddb'
import { buildHeatmapAvailableYears, buildYearlyHeatmapModel } from '../../utils/stats-heatmap'

function buildDailyRecord(date: string, wordCount: number): DiaryRecord {
  return {
    id: `daily:${date}`,
    type: 'daily',
    date,
    content: '',
    wordCount,
    createdAt: '2026-02-15T00:00:00.000Z',
    modifiedAt: '2026-02-15T00:00:00.000Z',
  }
}

function buildYearlySummaryRecord(year: number, wordCount: number): DiaryRecord {
  return {
    id: `summary:${year}`,
    type: 'yearly_summary',
    year,
    date: `${year}-12-31`,
    content: '',
    wordCount,
    createdAt: '2026-02-15T00:00:00.000Z',
    modifiedAt: '2026-02-15T00:00:00.000Z',
  }
}

function findCell(model: ReturnType<typeof buildYearlyHeatmapModel>, dateKey: string) {
  for (const week of model.weeks) {
    for (const day of week.days) {
      if (day?.dateKey === dateKey) {
        return day
      }
    }
  }
  return null
}

describe('buildHeatmapAvailableYears', () => {
  it('应只根据 daily.date 聚合年份并按降序返回', () => {
    const records: DiaryRecord[] = [
      buildDailyRecord('2024-02-11', 3),
      buildDailyRecord('2026-02-12', 7),
      buildYearlySummaryRecord(2025, 18),
    ]

    const years = buildHeatmapAvailableYears(records)

    expect(years).toEqual([2026, 2024])
  })

  it('无日记记录时应回退为当前年份', () => {
    const years = buildHeatmapAvailableYears([], [], new Date(2026, 1, 15, 12))

    expect(years).toEqual([2026])
  })
})

describe('buildYearlyHeatmapModel', () => {
  it('应按指定年份构建热力图并按当天字数计算色阶', () => {
    const records: DiaryRecord[] = [
      buildDailyRecord('2026-02-11', 9),
      buildDailyRecord('2026-02-12', 18),
      buildDailyRecord('2025-02-11', 99),
      buildYearlySummaryRecord(2026, 20),
    ]

    const model = buildYearlyHeatmapModel(records, 2026)

    expect(model.year).toBe(2026)
    expect(model.activeDayCount).toBe(2)
    expect(model.totalWordCount).toBe(27)
    expect(model.maxWordCount).toBe(18)
    expect(model.weekCount).toBeGreaterThanOrEqual(53)
    expect(model.weekCount).toBeLessThanOrEqual(54)

    const day1 = findCell(model, '2026-02-11')
    const day2 = findCell(model, '2026-02-12')
    const otherYearDay = findCell(model, '2025-02-11')

    expect(day1?.wordCount).toBe(9)
    expect(day2?.wordCount).toBe(18)
    expect(day1?.intensity).toBeGreaterThan(0)
    expect(day2?.intensity).toBeGreaterThanOrEqual(day1?.intensity ?? 0)
    expect(otherYearDay).toBeNull()
  })

  it('当所有日记字数为 0 时应保持 0 强度', () => {
    const records: DiaryRecord[] = [buildDailyRecord('2026-01-01', 0)]

    const model = buildYearlyHeatmapModel(records, 2026)
    const day = findCell(model, '2026-01-01')

    expect(model.activeDayCount).toBe(1)
    expect(model.maxWordCount).toBe(0)
    expect(day?.intensity).toBe(0)
  })

  it('应按周一作为每周起始构建网格', () => {
    const model = buildYearlyHeatmapModel([], 2026)
    const firstWeek = model.weeks[0]
    const firstDayOfYear = findCell(model, '2026-01-01')

    expect(firstWeek.days[0]).toBeNull()
    expect(firstWeek.days[1]).toBeNull()
    expect(firstWeek.days[2]).toBeNull()
    expect(firstDayOfYear?.dayOfWeek).toBe(3)
  })
})
