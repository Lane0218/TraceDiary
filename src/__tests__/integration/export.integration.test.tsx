import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ToastCenter from '../../components/common/toast-center'
import { ToastProvider } from '../../hooks/use-toast'
import type { AppConfig, UseAuthResult } from '../../hooks/use-auth'
import SettingsPage from '../../pages/settings'
import { exportDiaryData } from '../../services/export'

vi.mock('../../services/export', () => ({
  exportDiaryData: vi.fn(),
}))

const exportDiaryDataMock = vi.mocked(exportDiaryData)

function buildAuthResult(stage: UseAuthResult['state']['stage'] = 'ready'): UseAuthResult {
  const config: AppConfig = {
    giteeRepo: 'https://gitee.com/lane/diary',
    giteeOwner: 'lane',
    giteeRepoName: 'diary',
    giteeBranch: 'master',
    passwordHash: 'hash',
    passwordExpiry: '2026-12-31T00:00:00.000Z',
    kdfParams: {
      algorithm: 'PBKDF2',
      hash: 'SHA-256',
      iterations: 300_000,
      salt: 'salt',
    },
    encryptedToken: 'cipher-token',
    tokenCipherVersion: 'v1',
  }

  return {
    state: {
      stage,
      config,
      tokenInMemory: stage === 'ready' ? 'token' : null,
      dataEncryptionKey: stage === 'ready' ? ({ type: 'secret' } as CryptoKey) : null,
      isLocked: stage !== 'ready',
      passwordExpired: false,
      needsMasterPasswordForTokenRefresh: false,
      tokenRefreshReason: null,
      errorMessage: null,
    },
    getMasterPasswordError: vi.fn(() => null),
    initializeFirstTime: vi.fn(async () => {}),
    restoreConfigFromCloud: vi.fn(async () => {}),
    unlockWithMasterPassword: vi.fn(async () => {}),
    updateTokenCiphertext: vi.fn(async () => {}),
    updateConnectionSettings: vi.fn(async () => ({
      ok: true,
      message: '同步配置校验通过，本地保存成功。',
      checkedAt: '2026-02-22T00:00:00.000Z',
      cloudSaveStatus: 'not_applicable' as const,
      cloudSaveMessage: '当前未登录云端账号，配置仅保存在本地。',
    })),
    lockNow: vi.fn(),
    clearError: vi.fn(),
  }
}

function renderSettings(auth: UseAuthResult): void {
  render(
    <ToastProvider>
      <MemoryRouter>
        <SettingsPage auth={auth} />
      </MemoryRouter>
      <ToastCenter />
    </ToastProvider>,
  )
}

describe('设置页导出入口', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    exportDiaryDataMock.mockReset()
  })

  it('未解锁时点击导出应阻止并提示', async () => {
    renderSettings(buildAuthResult('needs-unlock'))

    fireEvent.click(screen.getByTestId('settings-export-button'))

    expect(exportDiaryDataMock).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(screen.getByTestId('toast-system')).toHaveTextContent('会话未解锁，请先输入主密码')
    })
  })

  it('用户取消明文风险确认时不应执行导出', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderSettings(buildAuthResult('ready'))

    fireEvent.click(screen.getByTestId('settings-export-button'))

    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(exportDiaryDataMock).not.toHaveBeenCalled()
    expect(screen.queryByTestId('settings-export-result')).toBeNull()
  })

  it('导出成功后应展示结果摘要与文件名', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    exportDiaryDataMock.mockResolvedValue({
      outcome: 'success',
      archiveName: 'trace-diary-export-20260215-101500.zip',
      exportedAt: '2026-02-15T10:15:00.000Z',
      success: ['daily:2026-02-08', 'summary:2026'],
      failed: [],
      message: '导出完成，共 2 条',
    })

    renderSettings(buildAuthResult('ready'))
    fireEvent.click(screen.getByTestId('settings-export-button'))

    await waitFor(() => {
      expect(exportDiaryDataMock).toHaveBeenCalledTimes(1)
    })
    expect(await screen.findByTestId('settings-export-result')).toHaveTextContent('成功 2 条')
    expect(screen.getByTestId('settings-export-archive-name')).toHaveTextContent(
      'trace-diary-export-20260215-101500.zip',
    )
  })
})
