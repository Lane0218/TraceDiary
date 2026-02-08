import { describe, expect, it } from 'vitest'
import { formatDateKey } from '../../utils/date'

describe('formatDateKey', () => {
  it('应输出 YYYY-MM-DD 格式', () => {
    const date = new Date(2026, 1, 8)

    expect(formatDateKey(date)).toBe('2026-02-08')
  })
})
