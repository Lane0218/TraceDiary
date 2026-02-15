import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ToastCenter from '../../components/common/toast-center'
import { ToastProvider } from '../../hooks/use-toast'
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
    <ToastProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/yearly/:year" element={<YearlySummaryPage auth={auth ?? buildAuthResult()} />} />
        </Routes>
      </MemoryRouter>
      <ToastCenter />
    </ToastProvider>,
  )
}

function buildUseDiaryResult(overrides?: Partial<UseDiaryResult>): UseDiaryResult {
  const base: UseDiaryResult = {
    entryId: 'daily:2026-02-08',
    content: '',
    entry: null,
    loadRevision: 0,
    isLoading: false,
    isSaving: false,
    error: null,
    setContent: vi.fn(),
    waitForPersisted: vi.fn(async () => null),
  }
  return {
    ...base,
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
      dataEncryptionKey: { type: 'secret' } as CryptoKey,
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
    updateConnectionSettings: vi.fn(async () => {}),
    lockNow: vi.fn(),
    clearError: vi.fn(),
  }
}

describe('年度总结页面', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    createDiaryUploadExecutorMock.mockReset()
    createDiaryUploadExecutorMock.mockImplementation(
      () => async () => ({ ok: true, conflict: false, syncedAt: '2026-02-09T00:00:00.000Z' }),
    )
  })

  it('年度总结页应在慢保存时展示保存中状态并响应年份切换', async () => {
    vi.useFakeTimers()
    try {
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
      expect(screen.queryByText('保存中')).toBeNull()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(400)
      })
      expect(screen.getByText('保存中')).toBeTruthy()

      fireEvent.change(screen.getByLabelText('跳转年份'), { target: { value: '2025' } })

      expect(useDiaryMock).toHaveBeenLastCalledWith({ type: 'yearly_summary', year: 2025 })
    } finally {
      vi.useRealTimers()
    }
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

  it('应仅展示云端状态胶囊，不展示未提交改动与分支标签', async () => {
    useDiaryMock.mockReturnValue(
      buildUseDiaryResult({
        entryId: 'summary:2026',
      }),
    )

    renderYearlyPage('/yearly/2026')
    expect(screen.getByText(/Pull：未执行/)).toBeTruthy()
    expect(screen.getByText(/Push：未执行/)).toBeTruthy()
    expect(screen.queryByText(/未提交改动：/)).toBeNull()
    expect(screen.queryByText(/分支：/)).toBeNull()

    fireEvent.change(screen.getByLabelText('写下本年度总结（长文写作场景，支持 Markdown）'), {
      target: { value: '新的年度总结内容' },
    })

    await waitFor(() => {
      expect(screen.getByText(/Pull：未执行/)).toBeTruthy()
      expect(screen.getByText(/Push：未执行/)).toBeTruthy()
      expect(screen.queryByText(/未提交改动：/)).toBeNull()
      expect(screen.queryByText(/分支：/)).toBeNull()
    })
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
    fireEvent.click(screen.getByRole('button', { name: 'push' }))

    expect(screen.getByTestId('toast-push')).toHaveTextContent('云端同步未就绪：请先配置 Gitee 仓库。')
  })

  it('手动上传失败时应通过 toast 展示失败原因', async () => {
    createDiaryUploadExecutorMock.mockImplementation(
      () => async () => ({ ok: false, conflict: false, reason: 'auth' as const }),
    )
    useDiaryMock.mockReturnValue(
      buildUseDiaryResult({
        entryId: 'summary:2026',
        content: '已有内容',
      }),
    )

    renderYearlyPage('/yearly/2026')
    fireEvent.click(screen.getByRole('button', { name: 'push' }))

    await waitFor(() => {
      expect(screen.getByTestId('toast-push')).toHaveTextContent('鉴权失败，请重新解锁或更新 Token 配置')
    })
  })

  it('手动上传进行中应禁用 pull/push 按钮，避免重复触发', async () => {
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
        content: '已有内容',
      }),
    )

    renderYearlyPage('/yearly/2026')
    fireEvent.click(screen.getByRole('button', { name: 'push' }))

    await waitFor(() => {
      expect(screen.getByTestId('toast-push')).toHaveTextContent('手动上传已触发，正在等待结果...')
      const uploadingButton = screen.getByRole('button', { name: 'push' }) as HTMLButtonElement
      const pullButton = screen.getByRole('button', { name: 'pull' }) as HTMLButtonElement
      expect(uploadingButton.disabled).toBe(true)
      expect(uploadingButton.getAttribute('aria-busy')).toBe('true')
      expect(uploadingButton.querySelector('.td-sync-control-running-dot')).toBeTruthy()
      expect(pullButton.disabled).toBe(true)
    })

    resolveUpload({ ok: true, conflict: false, syncedAt: '2026-02-09T01:00:00.000Z' })

    await waitFor(() => {
      const pushButton = screen.getByRole('button', { name: 'push' }) as HTMLButtonElement
      const pullButton = screen.getByRole('button', { name: 'pull' }) as HTMLButtonElement
      expect(pushButton.disabled).toBe(false)
      expect(pullButton.disabled).toBe(false)
      expect(screen.getByTestId('toast-push')).toHaveTextContent('push 已完成，同步成功')
    })
  })

  it('手动上传超时后应退出同步中并展示可重试错误', async () => {
    vi.useFakeTimers()
    try {
      const uploadExecutor = vi.fn(
        () =>
          new Promise(() => {
            // 模拟手动上传请求悬挂
          }),
      )
      createDiaryUploadExecutorMock.mockImplementation(() => uploadExecutor)
      useDiaryMock.mockReturnValue(
        buildUseDiaryResult({
          entryId: 'summary:2026',
          content: '初始内容',
        }),
      )

      renderYearlyPage('/yearly/2026')

      fireEvent.change(screen.getByLabelText('写下本年度总结（长文写作场景，支持 Markdown）'), {
        target: { value: '手动上传超时场景' },
      })
      expect(uploadExecutor).toHaveBeenCalledTimes(0)

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'push' }))
        await Promise.resolve()
      })
      expect(screen.getByTestId('toast-push')).toHaveTextContent('手动上传已触发，正在等待结果...')
      expect(uploadExecutor).toHaveBeenCalledTimes(1)

      await act(async () => {
        await vi.advanceTimersByTimeAsync(26_000)
      })

      expect(screen.getByText(/Push：失败/)).toBeTruthy()
      expect(screen.getByTestId('toast-push')).toHaveTextContent('同步超时，请检查网络后重试')
    } finally {
      vi.useRealTimers()
    }
  })

  it('空内容点击 push 时应拦截上传并提示无需 push', async () => {
    const uploadExecutor = vi.fn(async () => ({ ok: true, conflict: false, syncedAt: '2026-02-09T00:00:00.000Z' }))
    createDiaryUploadExecutorMock.mockImplementation(() => uploadExecutor)
    useDiaryMock.mockReturnValue(
      buildUseDiaryResult({
        entryId: 'summary:2026',
        content: '',
      }),
    )

    renderYearlyPage('/yearly/2026')
    fireEvent.click(screen.getByRole('button', { name: 'push' }))

    await waitFor(() => {
      expect(screen.getByTestId('toast-push')).toHaveTextContent('当前内容为空，无需 push')
    })
    expect(uploadExecutor).toHaveBeenCalledTimes(0)
    expect(screen.getByText(/Push：未执行/)).toBeTruthy()
  })
})
