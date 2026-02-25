import { describe, expect, it } from 'vitest'
import type { DiaryRecord } from '../../services/indexeddb'
import { buildMatchSnippet, searchDiaryRecords } from '../../utils/diary-search'

function buildDailyRecord(date: string, content: string): DiaryRecord {
  return {
    id: `daily:${date}`,
    type: 'daily',
    date,
    content,
    createdAt: '2026-02-25T00:00:00.000Z',
    modifiedAt: '2026-02-25T00:00:00.000Z',
  }
}

function buildYearlyRecord(year: number, content: string): DiaryRecord {
  return {
    id: `summary:${year}`,
    type: 'yearly_summary',
    year,
    date: `${year}-12-31`,
    content,
    createdAt: '2026-02-25T00:00:00.000Z',
    modifiedAt: '2026-02-25T00:00:00.000Z',
  }
}

describe('searchDiaryRecords', () => {
  it('空关键词应返回空结果', () => {
    const result = searchDiaryRecords([buildDailyRecord('2026-02-25', 'hello')], '   ')

    expect(result.query.normalizedKeyword).toBe('')
    expect(result.totalMatched).toBe(0)
    expect(result.returnedCount).toBe(0)
    expect(result.items).toEqual([])
  })

  it('仅搜索 daily 条目并按日期倒序返回', () => {
    const result = searchDiaryRecords(
      [
        buildDailyRecord('2026-02-10', '今天学习 search 逻辑'),
        buildYearlyRecord(2026, 'search 不应命中年度总结'),
        buildDailyRecord('2026-02-12', 'search 关键字再次出现'),
        buildDailyRecord('2026-02-11', '无匹配'),
      ],
      'search',
    )

    expect(result.totalMatched).toBe(2)
    expect(result.items.map((item) => item.date)).toEqual(['2026-02-12', '2026-02-10'])
    expect(result.items[0]?.entryId).toBe('daily:2026-02-12')
    expect(result.items[1]?.entryId).toBe('daily:2026-02-10')
  })

  it('命中超过上限时应截断并标记 truncated', () => {
    const records: DiaryRecord[] = []
    for (let day = 1; day <= 5; day += 1) {
      const date = `2026-02-0${day}`
      records.push(buildDailyRecord(date, `search #${day}`))
    }

    const result = searchDiaryRecords(records, 'search', { limit: 3 })
    expect(result.totalMatched).toBe(5)
    expect(result.returnedCount).toBe(3)
    expect(result.truncated).toBe(true)
    expect(result.items.map((item) => item.date)).toEqual(['2026-02-05', '2026-02-04', '2026-02-03'])
  })

  it('应返回首个命中位置和片段', () => {
    const result = searchDiaryRecords(
      [buildDailyRecord('2026-02-25', 'prefix content search marker suffix')],
      'search',
      { snippetRadius: 8 },
    )

    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.matchIndex).toBe(15)
    expect(result.items[0]?.snippet).toBe('...content search marker...')
  })
})

describe('buildMatchSnippet', () => {
  it('命中位于中间时应追加前后省略号', () => {
    const content = '0123456789ABCDEFGHIJ'
    const snippet = buildMatchSnippet(content, 10, 3, 2)
    expect(snippet).toBe('...789ABCDE...')
  })

  it('命中位于开头或结尾时省略号应按边界处理', () => {
    const startSnippet = buildMatchSnippet('hello world', 0, 4, 5)
    const endSnippet = buildMatchSnippet('hello world', 10, 4, 1)
    expect(startSnippet).toBe('hello wor...')
    expect(endSnippet).toBe('...world')
  })
})
