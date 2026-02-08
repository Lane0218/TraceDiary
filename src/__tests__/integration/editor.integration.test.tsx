import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import EditorPage from '../../pages/editor'
import YearlySummaryPage from '../../pages/yearly-summary'
import { useDiary, type UseDiaryResult } from '../../hooks/use-diary'

vi.mock('../../hooks/use-diary', () => ({
  useDiary: vi.fn(),
}))

vi.mock('../../components/editor/markdown-editor', () => ({
  default: ({
    initialValue,
    onChange,
    placeholder,
  }: {
    initialValue: string
    onChange: (value: string) => void
    placeholder?: string
  }) => (
    <textarea
      aria-label={placeholder ?? 'mock-editor'}
      defaultValue={initialValue}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}))

const useDiaryMock = vi.mocked(useDiary)

function renderWithRouter(node: ReactElement) {
  return render(<MemoryRouter>{node}</MemoryRouter>)
}

function buildUseDiaryResult(overrides?: Partial<UseDiaryResult>): UseDiaryResult {
  return {
    entryId: 'daily:2026-02-08',
    content: '',
    entry: null,
    isLoading: false,
    isSaving: false,
    error: null,
    setContent: vi.fn(),
    ...overrides,
  }
}

describe('编辑与年度总结页面', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('编辑页应展示加载状态', () => {
    useDiaryMock.mockReturnValue(
      buildUseDiaryResult({
        isLoading: true,
      }),
    )

    renderWithRouter(<EditorPage />)

    expect(screen.getByRole('heading', { name: '编辑页面' })).toBeTruthy()
    expect(screen.getByRole('status', { name: '' }).textContent).toContain('加载中')
  })

  it('编辑页切换日期时应按新日期读取', () => {
    useDiaryMock.mockImplementation((target) => {
      if (target.type === 'daily') {
        return buildUseDiaryResult({
          entryId: `daily:${target.date}`,
        })
      }
      return buildUseDiaryResult()
    })

    renderWithRouter(<EditorPage />)

    fireEvent.change(screen.getByLabelText('选择日期'), { target: { value: '2026-02-20' } })

    expect(useDiaryMock).toHaveBeenLastCalledWith({ type: 'daily', date: '2026-02-20' })
  })

  it('年度总结页应展示保存中状态并响应年份切换', () => {
    useDiaryMock.mockImplementation((target) => {
      if (target.type === 'yearly_summary') {
        return buildUseDiaryResult({
          entryId: `summary:${target.year}`,
          isSaving: true,
        })
      }
      return buildUseDiaryResult()
    })

    renderWithRouter(<YearlySummaryPage />)

    expect(screen.getByRole('heading', { name: '年度总结页面' })).toBeTruthy()
    expect(screen.getByRole('status', { name: '' }).textContent).toContain('保存中')

    fireEvent.change(screen.getByLabelText('选择年份'), { target: { value: '2025' } })

    expect(useDiaryMock).toHaveBeenLastCalledWith({ type: 'yearly_summary', year: 2025 })
  })

  it('年度总结页错误时应展示错误提示', () => {
    useDiaryMock.mockReturnValue(
      buildUseDiaryResult({
        entryId: 'summary:2026',
        error: '保存失败：磁盘写入异常',
      }),
    )

    renderWithRouter(<YearlySummaryPage />)

    expect(screen.getByRole('alert').textContent).toContain('保存失败')
  })
})
