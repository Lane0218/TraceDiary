import { describe, expect, it } from 'vitest'
import { formatDateKey, getDiaryDateKey } from '../../utils/date'

describe('formatDateKey', () => {
  it('应输出 YYYY-MM-DD 格式', () => {
    const date = new Date(2026, 1, 8)

    expect(formatDateKey(date)).toBe('2026-02-08')
  })
})

describe('getDiaryDateKey', () => {
  it('凌晨 2 点前应归属前一天', () => {
    const now = new Date(2026, 1, 20, 1, 59, 59)

    expect(getDiaryDateKey(now)).toBe('2026-02-19')
  })

  it('凌晨 2 点整后应归属当天', () => {
    const now = new Date(2026, 1, 20, 2, 0, 0)

    expect(getDiaryDateKey(now)).toBe('2026-02-20')
  })

  it('跨年凌晨 2 点前应正确回退到上一年最后一天', () => {
    const now = new Date(2026, 0, 1, 1, 30, 0)

    expect(getDiaryDateKey(now)).toBe('2025-12-31')
  })
})
