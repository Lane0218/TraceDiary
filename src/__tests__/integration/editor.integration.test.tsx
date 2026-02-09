import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import YearlySummaryPage from '../../pages/yearly-summary'
import type { UseAuthResult } from '../../hooks/use-auth'
import { useDiary, type UseDiaryResult } from '../../hooks/use-diary'

vi.mock('../../hooks/use-diary', () => ({
  useDiary: vi.fn(),
}))

vi.mock('../../components/editor/markdown-editor', () => ({
  default: ({
    initialValue,
    onChange,
    placeholder,
    docKey,
  }: {
    initialValue: string
    onChange: (value: string) => void
    placeholder?: string
    docKey?: string
  }) => (
    <textarea
      data-doc-key={docKey}
      aria-label={placeholder ?? 'mock-editor'}
      defaultValue={initialValue}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}))

const useDiaryMock = vi.mocked(useDiary)

function renderYearlyPage(path = '/yearly/2026', auth?: UseAuthResult) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/yearly/:year" element={<YearlySummaryPage auth={auth ?? buildAuthResult()} />} />
      </Routes>
    </MemoryRouter>,
  )
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

function buildAuthResult(): UseAuthResult {
  return {
    state: {
      stage: 'ready',
      config: null,
      tokenInMemory: 'mock-token',
      isLocked: false,
      passwordExpired: false,
      needsMasterPasswordForTokenRefresh: false,
      tokenRefreshReason: null,
      errorMessage: null,
    },
    getMasterPasswordError: vi.fn(() => null),
    initializeFirstTime: vi.fn(async () => {}),
    unlockWithMasterPassword: vi.fn(async () => {}),
    updateTokenCiphertext: vi.fn(async () => {}),
    lockNow: vi.fn(),
    clearError: vi.fn(),
  }
}

describe('年度总结页面', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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

    renderYearlyPage('/yearly/2026')

    expect(screen.getByRole('heading', { name: '2026 年度总结' })).toBeTruthy()
    expect(screen.getByText('保存中')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('跳转年份'), { target: { value: '2025' } })

    expect(useDiaryMock).toHaveBeenLastCalledWith({ type: 'yearly_summary', year: 2025 })
  })

  it('年度总结页错误时应展示错误提示', () => {
    useDiaryMock.mockReturnValue(
      buildUseDiaryResult({
        entryId: 'summary:2026',
        error: '保存失败：磁盘写入异常',
      }),
    )

    renderYearlyPage('/yearly/2026')

    expect(screen.getByText('本地保存异常')).toBeTruthy()
  })

  it('云端未就绪时点击手动上传应展示明确提示', () => {
    useDiaryMock.mockReturnValue(
      buildUseDiaryResult({
        entryId: 'summary:2026',
      }),
    )

    renderYearlyPage('/yearly/2026')
    fireEvent.click(screen.getByRole('button', { name: '手动保存并立即上传' }))

    expect(screen.getByText('云端同步未就绪：请先配置 Gitee 仓库。')).toBeTruthy()
  })
})
