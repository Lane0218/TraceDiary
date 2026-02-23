import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BulkSyncPanel from '../../components/common/bulk-sync-panel'
import ToastCenter from '../../components/common/toast-center'
import { ToastProvider } from '../../hooks/use-toast'
import type { AppConfig, UseAuthResult } from '../../hooks/use-auth'
import { getSyncBaseline, listDiariesByIndex, saveSyncBaseline } from '../../services/indexeddb'
import { createDiaryUploadExecutor, pullRemoteDiariesToIndexedDb } from '../../services/sync'

const createDiaryUploadExecutorMock = vi.hoisted(() => vi.fn())
const pullRemoteDiariesToIndexedDbMock = vi.hoisted(() => vi.fn())
const listDiariesByIndexMock = vi.hoisted(() => vi.fn())
const getSyncBaselineMock = vi.hoisted(() => vi.fn())
const saveSyncBaselineMock = vi.hoisted(() => vi.fn())

vi.mock('../../services/sync', async () => {
  const actual = await vi.importActual<typeof import('../../services/sync')>('../../services/sync')
  return {
    ...actual,
    createDiaryUploadExecutor: createDiaryUploadExecutorMock,
    pullRemoteDiariesToIndexedDb: pullRemoteDiariesToIndexedDbMock,
  }
})

vi.mock('../../services/indexeddb', async () => {
  const actual = await vi.importActual<typeof import('../../services/indexeddb')>('../../services/indexeddb')
  return {
    ...actual,
    listDiariesByIndex: listDiariesByIndexMock,
    getSyncBaseline: getSyncBaselineMock,
    saveSyncBaseline: saveSyncBaselineMock,
  }
})

const createDiaryUploadExecutorTypedMock = vi.mocked(createDiaryUploadExecutor)
const pullRemoteDiariesToIndexedDbTypedMock = vi.mocked(pullRemoteDiariesToIndexedDb)
const listDiariesByIndexTypedMock = vi.mocked(listDiariesByIndex)
const getSyncBaselineTypedMock = vi.mocked(getSyncBaseline)
const saveSyncBaselineTypedMock = vi.mocked(saveSyncBaseline)

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

function renderPanel(auth: UseAuthResult): void {
  render(
    <ToastProvider>
      <MemoryRouter>
        <BulkSyncPanel auth={auth} />
      </MemoryRouter>
      <ToastCenter />
    </ToastProvider>,
  )
}

describe('设置页高级同步面板', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    pullRemoteDiariesToIndexedDbTypedMock.mockResolvedValue({
      total: 1,
      inserted: 1,
      updated: 0,
      skipped: 0,
      conflicted: 0,
      failed: 0,
      downloaded: 1,
      conflicts: [],
      failedItems: [],
      metadataMissing: false,
    })
    createDiaryUploadExecutorTypedMock.mockImplementation(
      () => async () => ({ ok: true, conflict: false, remoteSha: 'sha-1', syncedAt: '2026-02-23T00:00:00.000Z' }),
    )
    listDiariesByIndexTypedMock.mockResolvedValue([])
    getSyncBaselineTypedMock.mockResolvedValue(null)
    saveSyncBaselineTypedMock.mockResolvedValue(undefined)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('点击 pull 全部后应触发全量拉取并展示结果弹窗', async () => {
    renderPanel(buildAuthResult('ready'))

    fireEvent.click(screen.getByTestId('settings-bulk-pull-button'))

    await waitFor(() => {
      expect(pullRemoteDiariesToIndexedDbTypedMock).toHaveBeenCalledTimes(1)
    })
    expect(await screen.findByTestId('pull-result-dialog')).toBeTruthy()
    expect(screen.getByText('全量拉取汇总')).toBeTruthy()

    fireEvent.click(screen.getByTestId('pull-result-close'))
    await waitFor(() => {
      expect(screen.queryByTestId('pull-result-dialog')).toBeNull()
    })
  })

  it('点击 push 全部后应展示批量汇总，并记录冲突与成功条目', async () => {
    listDiariesByIndexTypedMock.mockResolvedValue([
      {
        id: 'daily:2026-02-22',
        type: 'daily',
        date: '2026-02-22',
        content: '第一条内容',
        wordCount: 5,
        createdAt: '2026-02-22T00:00:00.000Z',
        modifiedAt: '2026-02-22T00:00:00.000Z',
      },
      {
        id: 'summary:2026',
        type: 'yearly_summary',
        date: '2026-12-31',
        year: 2026,
        content: '第二条内容',
        wordCount: 5,
        createdAt: '2026-02-22T00:00:00.000Z',
        modifiedAt: '2026-02-22T00:00:00.000Z',
      },
    ])

    const uploadDiary = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, conflict: false, remoteSha: 'sha-daily', syncedAt: '2026-02-23T00:00:00.000Z' })
      .mockResolvedValueOnce({ ok: false, conflict: true, reason: 'sha_mismatch' as const })
    createDiaryUploadExecutorTypedMock.mockImplementation(() => uploadDiary)

    renderPanel(buildAuthResult('ready'))
    fireEvent.click(screen.getByTestId('settings-bulk-push-button'))

    await waitFor(() => {
      expect(uploadDiary).toHaveBeenCalledTimes(2)
    })
    expect(await screen.findByTestId('settings-bulk-push-result')).toHaveTextContent('成功 1/2，跳过 0，冲突 1，失败 0')
    expect(screen.getByTestId('settings-bulk-push-conflict-list')).toHaveTextContent('summary:2026')
    expect(saveSyncBaselineTypedMock).toHaveBeenCalledTimes(1)
  })
})
