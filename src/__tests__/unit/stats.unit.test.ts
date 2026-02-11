import { describe, expect, it } from 'vitest'
import type { DiaryRecord } from '../../services/indexeddb'
import { buildStatsSummary } from '../../utils/stats'

function buildDailyRecord(date: string, wordCount: number): DiaryRecord {
  return {
    id: `daily:${date}`,
    type: 'daily',
    date,
    content: '',
    wordCount,
    createdAt: '2026-02-11T00:00:00.000Z',
    modifiedAt: '2026-02-11T00:00:00.000Z',
  }
}

function buildYearlyRecord(year: number, wordCount?: number, content = ''): DiaryRecord {
  return {
    id: `summary:${year}`,
    type: 'yearly_summary',
    date: `${year}-12-31`,
    year,
    content,
    wordCount,
    createdAt: '2026-02-11T00:00:00.000Z',
    modifiedAt: '2026-02-11T00:00:00.000Z',
  }
}

describe('buildStatsSummary', () => {
  it('空数据时应返回全零统计与 none 状态', () => {
    const summary = buildStatsSummary([], new Date(2026, 1, 11, 12))

    expect(summary.totalDailyCount).toBe(0)
    expect(summary.totalYearlySummaryCount).toBe(0)
    expect(summary.totalWordCount).toBe(0)
    expect(summary.currentStreakDays).toBe(0)
    expect(summary.longestStreakDays).toBe(0)
    expect(summary.streakStatus).toBe('none')
    expect(summary.yearlyItems).toEqual([])
    expect(summary.recentMonthItems).toHaveLength(12)
  })

  it('当天有记录时应计算 active 连续天数', () => {
    const records: DiaryRecord[] = [
      buildDailyRecord('2026-02-11', 20),
      buildDailyRecord('2026-02-10', 10),
      buildDailyRecord('2026-02-08', 5),
      buildYearlyRecord(2026, 30),
    ]

    const summary = buildStatsSummary(records, new Date(2026, 1, 11, 12))

    expect(summary.totalDailyCount).toBe(3)
    expect(summary.totalYearlySummaryCount).toBe(1)
    expect(summary.totalWordCount).toBe(65)
    expect(summary.currentStreakDays).toBe(2)
    expect(summary.longestStreakDays).toBe(2)
    expect(summary.streakStatus).toBe('active')
    expect(summary.streakGapDays).toBe(0)
    expect(summary.streakLastDate).toBe('2026-02-11')
  })

  it('当天缺失记录时应标记为 broken 并给出最近连续段', () => {
    const records: DiaryRecord[] = [
      buildDailyRecord('2026-02-09', 1),
      buildDailyRecord('2026-02-08', 1),
      buildDailyRecord('2026-02-07', 1),
      buildDailyRecord('2026-02-04', 1),
      buildDailyRecord('2026-02-03', 1),
    ]

    const summary = buildStatsSummary(records, new Date(2026, 1, 11, 12))

    expect(summary.streakStatus).toBe('broken')
    expect(summary.streakLastDate).toBe('2026-02-09')
    expect(summary.streakGapDays).toBe(2)
    expect(summary.currentStreakDays).toBe(3)
    expect(summary.longestStreakDays).toBe(3)
  })

  it('应按年和近12个月聚合统计，并在 wordCount 缺失时回退 content 计算', () => {
    const records: DiaryRecord[] = [
      buildDailyRecord('2026-02-01', 20),
      buildDailyRecord('2026-01-31', 10),
      buildDailyRecord('2025-12-15', 5),
      buildYearlyRecord(2025, 50),
      buildYearlyRecord(2024, undefined, 'a b c'),
    ]

    const summary = buildStatsSummary(records, new Date(2026, 1, 11, 12))

    expect(summary.totalWordCount).toBe(88)
    expect(summary.currentYearWordCount).toBe(30)
    expect(summary.currentYearDailyCount).toBe(2)
    expect(summary.currentYearSummaryCount).toBe(0)

    expect(summary.yearlyItems[0]).toMatchObject({
      year: 2026,
      dailyCount: 2,
      yearlySummaryCount: 0,
      totalWordCount: 30,
      activeDayCount: 2,
    })
    expect(summary.yearlyItems[1]).toMatchObject({
      year: 2025,
      dailyCount: 1,
      yearlySummaryCount: 1,
      totalWordCount: 55,
      activeDayCount: 1,
    })
    expect(summary.yearlyItems[2]).toMatchObject({
      year: 2024,
      dailyCount: 0,
      yearlySummaryCount: 1,
      totalWordCount: 3,
      activeDayCount: 0,
    })

    const month202602 = summary.recentMonthItems.find((item) => item.label === '2026-02')
    const month202601 = summary.recentMonthItems.find((item) => item.label === '2026-01')
    const month202512 = summary.recentMonthItems.find((item) => item.label === '2025-12')

    expect(month202602).toMatchObject({
      dailyCount: 1,
      yearlySummaryCount: 0,
      totalWordCount: 20,
    })
    expect(month202601).toMatchObject({
      dailyCount: 1,
      yearlySummaryCount: 0,
      totalWordCount: 10,
    })
    expect(month202512).toMatchObject({
      dailyCount: 1,
      yearlySummaryCount: 1,
      totalWordCount: 55,
    })
  })
})
