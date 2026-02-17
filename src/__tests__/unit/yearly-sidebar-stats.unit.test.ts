import { describe, expect, it } from 'vitest'
import type { DiaryRecord } from '../../services/indexeddb'
import { buildYearlySidebarStats, createEmptyYearlySidebarStats } from '../../utils/yearly-sidebar-stats'

function buildDailyRecord(
  id: string,
  date: string,
  options: {
    content?: string
    wordCount?: number
  } = {},
): DiaryRecord {
  return {
    id,
    type: 'daily',
    date,
    content: options.content ?? '',
    wordCount: options.wordCount,
    createdAt: '2026-01-01T00:00:00.000Z',
    modifiedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('yearly-sidebar-stats', () => {
  it('空数据应返回默认统计结果', () => {
    expect(buildYearlySidebarStats([], 2026)).toEqual(createEmptyYearlySidebarStats())
  })

  it('应统计指定年份的字数、记录天数与最活跃月份', () => {
    const records: DiaryRecord[] = [
      buildDailyRecord('d1', '2026-02-01', { wordCount: 100 }),
      buildDailyRecord('d2', '2026-02-02', { wordCount: 30 }),
      buildDailyRecord('d3', '2026-02-02', { wordCount: 10 }),
      buildDailyRecord('d4', '2026-03-05', { wordCount: 40 }),
      buildDailyRecord('d5', '2025-03-05', { wordCount: 999 }),
    ]

    expect(buildYearlySidebarStats(records, 2026)).toEqual({
      yearWordCount: 180,
      activeDayCount: 3,
      mostActiveMonth: 2,
    })
  })

  it('最活跃月份并列时应取最早月份', () => {
    const records: DiaryRecord[] = [
      buildDailyRecord('d1', '2026-01-01', { wordCount: 10 }),
      buildDailyRecord('d2', '2026-02-01', { wordCount: 20 }),
    ]

    expect(buildYearlySidebarStats(records, 2026).mostActiveMonth).toBe(1)
  })

  it('当 wordCount 缺失时应回退到可见字符统计', () => {
    const records: DiaryRecord[] = [buildDailyRecord('d1', '2026-01-01', { content: 'ab c\n d' })]
    expect(buildYearlySidebarStats(records, 2026).yearWordCount).toBe(4)
  })

  it('应跳过无效日期与非日记记录', () => {
    const yearlySummary: DiaryRecord = {
      id: 'summary:2026',
      type: 'yearly_summary',
      date: '2026-12-31',
      year: 2026,
      content: 'summary',
      createdAt: '2026-12-31T00:00:00.000Z',
      modifiedAt: '2026-12-31T00:00:00.000Z',
    }
    const records: DiaryRecord[] = [
      buildDailyRecord('d1', '2026-02-30', { wordCount: 10 }),
      buildDailyRecord('d2', 'not-a-date', { wordCount: 20 }),
      yearlySummary,
    ]

    expect(buildYearlySidebarStats(records, 2026)).toEqual(createEmptyYearlySidebarStats())
  })
})
