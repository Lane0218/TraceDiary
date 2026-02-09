import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import YearlySummaryPage from '../../pages/yearly-summary'
import type { AppConfig, UseAuthResult } from '../../hooks/use-auth'
import { useDiary, type UseDiaryResult } from '../../hooks/use-diary'

const createDiaryUploadExecutorMock = vi.hoisted(() => vi.fn())

vi.mock('../../hooks/use-diary', () => ({
  useDiary: vi.fn(),
}))

vi.mock('../../services/sync', async () => {
  const actual = await vi.importActual<typeof import('../../services/sync')>('../../services/sync')
  return {
    ...actual,
    createDiaryUploadExecutor: createDiaryUploadExecutorMock,
  }
})

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

function buildAuthResult(overrides?: Partial<UseAuthResult['state']>): UseAuthResult {
  const config: AppConfig = {
    giteeRepo: 'https://gitee.com/lane/diary',
    giteeOwner: 'lane',
    giteeRepoName: 'diary',
    giteeBranch: 'master',
    passwordHash: 'hash',
    passwordExpiry: '2026-02-20T00:00:00.000Z',
    kdfParams: {
      algorithm: 'PBKDF2',
      hash: 'SHA-256',
      iterations: 300_000,
      salt: 'salt',
    },
    encryptedToken: 'cipher',
    tokenCipherVersion: 'v1',
  }
  return {
    state: {
      stage: 'ready',
      config,
      tokenInMemory: 'mock-token',
      isLocked: false,
      passwordExpired: false,
      needsMasterPasswordForTokenRefresh: false,
      tokenRefreshReason: null,
      errorMessage: null,
      ...overrides,
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
    createDiaryUploadExecutorMock.mockReset()
    createDiaryUploadExecutorMock.mockImplementation(
      () => async () => ({ ok: true, conflict: false, syncedAt: '2026-02-09T00:00:00.000Z' }),
    )
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

    renderYearlyPage(
      '/yearly/2026',
      buildAuthResult({
        config: null,
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: '手动保存并立即上传' }))

    expect(screen.getByText('云端同步未就绪：请先配置 Gitee 仓库。')).toBeTruthy()
  })

  it('手动上传失败时应在按钮旁展示失败原因', async () => {
    createDiaryUploadExecutorMock.mockImplementation(
      () => async () => ({ ok: false, conflict: false, reason: 'auth' as const }),
    )
    useDiaryMock.mockReturnValue(
      buildUseDiaryResult({
        entryId: 'summary:2026',
      }),
    )

    renderYearlyPage('/yearly/2026')
    fireEvent.click(screen.getByRole('button', { name: '手动保存并立即上传' }))

    await waitFor(() =>
      expect(screen.getAllByText('鉴权失败，请重新解锁或更新 Token 配置').length).toBeGreaterThan(0),
    )
  })

  it('手动上传进行中再次点击应提示忙碌而非无响应', async () => {
    let resolveUpload!: (value: { ok: true; conflict: false; syncedAt: string }) => void
    createDiaryUploadExecutorMock.mockImplementation(
      () =>
        () =>
          new Promise((resolve) => {
            resolveUpload = resolve
          }),
    )
    useDiaryMock.mockReturnValue(
      buildUseDiaryResult({
        entryId: 'summary:2026',
      }),
    )

    renderYearlyPage('/yearly/2026')
    fireEvent.click(screen.getByRole('button', { name: '手动保存并立即上传' }))

    await waitFor(() => {
      expect(screen.getByText('手动上传已触发，正在等待结果...')).toBeTruthy()
      const uploadingButton = screen.getByRole('button', { name: '上传中...' }) as HTMLButtonElement
      expect(uploadingButton.disabled).toBe(false)
    })

    fireEvent.click(screen.getByRole('button', { name: '上传中...' }))
    await waitFor(() =>
      expect(screen.getByText('当前正在上传，请稍候重试')).toBeTruthy(),
    )

    resolveUpload({ ok: true, conflict: false, syncedAt: '2026-02-09T01:00:00.000Z' })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '手动保存并立即上传' })).toBeTruthy()
    })
  })
})
