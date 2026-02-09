import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CalendarPage from '../../pages/calendar'
import type { DiaryRecord } from '../../services/indexeddb'
import * as indexedDbService from '../../services/indexeddb'

const navigateMock = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => navigateMock,
  }
})

function buildDiaryRecord(date: string, content: string): DiaryRecord {
  return {
    id: `daily:${date}`,
    type: 'daily',
    date,
    content,
    wordCount: content.length,
    createdAt: `${date}T10:00:00.000Z`,
    modifiedAt: `${date}T11:00:00.000Z`,
  }
}

describe('Calendar 页面集成', () => {
  beforeEach(() => {
    navigateMock.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('应支持月份切换并在点击日期时跳转工作台', async () => {
    vi.spyOn(indexedDbService, 'listDiariesByIndex').mockResolvedValue([
      buildDiaryRecord('2026-02-08', '今天写了集成测试'),
      buildDiaryRecord('2026-03-15', '三月记录'),
    ])

    render(
      <MemoryRouter>
        <CalendarPage />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: '日历页面' })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('查询日期'), { target: { value: '2026-02-08' } })
    expect(screen.getByText(/2026年2月/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '下个月' }))
    expect(screen.getByText(/2026年3月/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '选择 2026-03-15' }))
    expect(navigateMock).toHaveBeenCalledWith('/workspace?date=2026-03-15')
  })

  it('应展示往年今日记录并截断为前三行预览', async () => {
    vi.spyOn(indexedDbService, 'listDiariesByIndex').mockResolvedValue([
      buildDiaryRecord('2026-02-08', '当前年份内容不应展示'),
      buildDiaryRecord('2025-02-08', '第一行\n第二行\n第三行\n第四行'),
      buildDiaryRecord('2024-02-08', '甲\n乙\n丙\n丁'),
      buildDiaryRecord('2025-03-08', '不同日期不应展示'),
    ])

    render(
      <MemoryRouter>
        <CalendarPage />
      </MemoryRouter>,
    )

    fireEvent.change(await screen.findByLabelText('查询日期'), { target: { value: '2026-02-08' } })
    expect(await screen.findByText('2025-02-08')).toBeTruthy()
    expect(screen.getByText('2024-02-08')).toBeTruthy()
    expect(screen.queryByText('第四行')).toBeNull()
    expect(screen.queryByText('丁')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '打开 2025-02-08' }))
    expect(navigateMock).toHaveBeenCalledWith('/workspace?date=2025-02-08')
  })

  it('往年今日应使用虚拟滚动，仅渲染可视区域附近卡片', async () => {
    const diaries = Array.from({ length: 40 }, (_, index) => {
      const year = 1980 + index
      return buildDiaryRecord(`${year}-02-08`, `第 ${year} 年记录`)
    })

    vi.spyOn(indexedDbService, 'listDiariesByIndex').mockResolvedValue(diaries)

    render(
      <MemoryRouter>
        <CalendarPage />
      </MemoryRouter>,
    )

    fireEvent.change(await screen.findByLabelText('查询日期'), { target: { value: '2026-02-08' } })
    await waitFor(() => expect(screen.getByTestId('on-this-day-virtual-list')).toBeTruthy())
    expect(screen.getByText('2019-02-08')).toBeTruthy()
    expect(screen.queryByText('1980-02-08')).toBeNull()
  })
})
