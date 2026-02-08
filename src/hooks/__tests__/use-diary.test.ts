import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DiaryRecord } from '../../services/indexeddb'
import type { DateString } from '../../types/diary'
import { useDiary, type DiaryDependencies } from '../use-diary'

function buildDependencies(seed: DiaryRecord[] = []): {
  dependencies: DiaryDependencies
  store: Map<string, DiaryRecord>
} {
  const store = new Map<string, DiaryRecord>()
  for (const record of seed) {
    store.set(record.id, { ...record })
  }

  const dependencies: DiaryDependencies = {
    getDiary: vi.fn(async (id: string) => store.get(id) ?? null),
    saveDiary: vi.fn(async (record: DiaryRecord) => {
      store.set(record.id, { ...record })
    }),
    now: vi.fn(() => '2026-02-08T10:00:00.000Z'),
  }

  return {
    dependencies,
    store,
  }
}

describe('useDiary', () => {
  it('按日期应可读取并回显已有日记', async () => {
    const date = '2026-02-08' as DateString
    const { dependencies } = buildDependencies([
      {
        id: 'daily:2026-02-08',
        type: 'daily',
        date,
        filename: '2026-02-08.md.enc',
        content: '# 旧内容',
        wordCount: 2,
        createdAt: '2026-02-08T01:00:00.000Z',
        modifiedAt: '2026-02-08T02:00:00.000Z',
      },
    ])

    const { result } = renderHook(() => useDiary({ type: 'daily', date }, dependencies))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.entryId).toBe('daily:2026-02-08')
    expect(result.current.content).toBe('# 旧内容')
    expect(result.current.entry?.filename).toBe('2026-02-08.md.enc')
  })

  it('输入变化后应即时写入 IndexedDB', async () => {
    const date = '2026-02-09' as DateString
    const { dependencies, store } = buildDependencies()

    const { result } = renderHook(() => useDiary({ type: 'daily', date }, dependencies))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      result.current.setContent('## 今天\\n- [ ] 写测试')
    })

    await waitFor(() => expect(dependencies.saveDiary).toHaveBeenCalledTimes(1))

    const stored = store.get('daily:2026-02-09')
    expect(stored).toBeTruthy()
    expect(stored?.filename).toBe('2026-02-09.md.enc')
    expect(stored?.content).toBe('## 今天\\n- [ ] 写测试')
  })

  it('年度总结应使用 summary:YYYY 与 YYYY-summary.md.enc', async () => {
    const { dependencies, store } = buildDependencies()

    const { result } = renderHook(() =>
      useDiary({ type: 'yearly_summary', year: 2025 }, dependencies),
    )
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      result.current.setContent('# 2025 总结')
    })

    await waitFor(() => expect(dependencies.saveDiary).toHaveBeenCalledTimes(1))

    const stored = store.get('summary:2025')
    expect(stored).toBeTruthy()
    expect(stored?.type).toBe('yearly_summary')
    expect(stored?.filename).toBe('2025-summary.md.enc')
    expect(stored?.date).toBe('2025-12-31')
    expect(stored?.year).toBe(2025)
  })

  it('切换日期后应读取对应条目', async () => {
    const { dependencies } = buildDependencies([
      {
        id: 'daily:2026-02-10',
        type: 'daily',
        date: '2026-02-10',
        filename: '2026-02-10.md.enc',
        content: '# A',
        wordCount: 1,
        createdAt: '2026-02-10T01:00:00.000Z',
        modifiedAt: '2026-02-10T02:00:00.000Z',
      },
      {
        id: 'daily:2026-02-11',
        type: 'daily',
        date: '2026-02-11',
        filename: '2026-02-11.md.enc',
        content: '# B',
        wordCount: 1,
        createdAt: '2026-02-11T01:00:00.000Z',
        modifiedAt: '2026-02-11T02:00:00.000Z',
      },
    ])

    const { result, rerender } = renderHook(
      ({ date }) => useDiary({ type: 'daily', date }, dependencies),
      {
        initialProps: {
          date: '2026-02-10' as DateString,
        },
      },
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.content).toBe('# A')

    rerender({ date: '2026-02-11' as DateString })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.entryId).toBe('daily:2026-02-11')
    expect(result.current.content).toBe('# B')
  })
})
