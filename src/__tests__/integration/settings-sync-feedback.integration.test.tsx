import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import ToastCenter from '../../components/common/toast-center'
import { ToastProvider } from '../../hooks/use-toast'
import type {
  AppConfig,
  UpdateConnectionSettingsResult,
  UseAuthResult,
} from '../../hooks/use-auth'
import SettingsPage from '../../pages/settings'

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve
  })
  return { promise, resolve }
}

function buildAuthResult(
  stage: UseAuthResult['state']['stage'] = 'ready',
  updateConnectionSettings?: UseAuthResult['updateConnectionSettings'],
): UseAuthResult {
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
      config: stage === 'needs-setup' ? null : config,
      tokenInMemory: stage === 'ready' ? 'token' : null,
      dataEncryptionKey: stage === 'ready' ? ({ type: 'secret' } as CryptoKey) : null,
      isLocked: stage !== 'ready',
      passwordExpired: false,
      needsMasterPasswordForTokenRefresh: false,
      tokenRefreshReason: null,
      errorMessage: null,
      initialPullStatus: 'idle',
      initialPullError: null,
    },
    getMasterPasswordError: vi.fn(() => null),
    initializeFirstTime: vi.fn(async () => {}),
    restoreConfigFromCloud: vi.fn(async () => {}),
    unlockWithMasterPassword: vi.fn(async () => {}),
    updateTokenCiphertext: vi.fn(async () => {}),
    updateConnectionSettings:
      updateConnectionSettings ??
      vi.fn(async (): Promise<UpdateConnectionSettingsResult> => ({
        ok: true,
        message: '同步配置校验通过，本地保存成功。',
        checkedAt: '2026-02-22T08:00:00.000Z',
        cloudSaveStatus: 'not_applicable',
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

describe('设置页同步配置反馈', () => {
  it('未配置状态应展示“未完成配置”状态卡', async () => {
    renderSettings(buildAuthResult('needs-setup'))

    await waitFor(() => {
      expect(screen.getByTestId('settings-sync-check-status')).toHaveAttribute('data-status', 'unconfigured')
    })
    expect(screen.getByTestId('settings-sync-check-status')).toHaveTextContent('未完成配置')
  })

  it('提交同步设置时应显示“校验中”并在完成后展示本地成功 toast', async () => {
    const deferred = createDeferred<UpdateConnectionSettingsResult>()
    const updateConnectionSettings = vi.fn(async () => deferred.promise)
    renderSettings(buildAuthResult('ready', updateConnectionSettings))

    fireEvent.click(screen.getByTestId('auth-ready-submit'))

    await waitFor(() => {
      expect(screen.getByTestId('settings-sync-check-status')).toHaveAttribute('data-status', 'checking')
    })
    expect(screen.getByTestId('toast-system')).toHaveTextContent('正在校验同步配置，请稍候...')

    deferred.resolve({
      ok: true,
      message: '同步配置校验通过，本地保存成功。',
      checkedAt: '2026-02-22T08:00:00.000Z',
      cloudSaveStatus: 'not_applicable',
      cloudSaveMessage: '当前未登录云端账号，配置仅保存在本地。',
    })

    await waitFor(() => {
      expect(screen.getByTestId('settings-sync-check-status')).toHaveAttribute('data-status', 'success')
    })
    expect(screen.getByTestId('settings-sync-check-status')).toHaveTextContent('校验成功（仅本地）')
    expect(screen.getByTestId('toast-system')).toHaveTextContent(
      '同步配置校验通过，当前仅保存到本地（未登录云端账号）。',
    )
  })

  it('校验失败时应展示失败状态与错误 toast', async () => {
    const updateConnectionSettings = vi.fn(async (): Promise<UpdateConnectionSettingsResult> => ({
      ok: false,
      message: '仓库地址需为 gitee.com/<owner>/<repo>',
      checkedAt: '2026-02-22T08:05:00.000Z',
      cloudSaveStatus: 'not_applicable',
      cloudSaveMessage: null,
    }))
    renderSettings(buildAuthResult('ready', updateConnectionSettings))

    fireEvent.click(screen.getByTestId('auth-ready-submit'))

    await waitFor(() => {
      expect(screen.getByTestId('settings-sync-check-status')).toHaveAttribute('data-status', 'error')
    })
    expect(screen.getByTestId('settings-sync-check-status')).toHaveTextContent('校验失败')
    expect(screen.getByTestId('toast-system')).toHaveTextContent(
      '同步配置校验失败：仓库地址需为 gitee.com/<owner>/<repo>',
    )
  })
})
