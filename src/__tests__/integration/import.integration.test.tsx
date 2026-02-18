import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ToastCenter from '../../components/common/toast-center'
import { ToastProvider } from '../../hooks/use-toast'
import type { AppConfig, UseAuthResult } from '../../hooks/use-auth'
import SettingsPage from '../../pages/settings'

const buildImportSourceFileMock = vi.hoisted(() => vi.fn())
const prepareImportPreviewMock = vi.hoisted(() => vi.fn())
const applyImportCandidatesMock = vi.hoisted(() => vi.fn())
const autoUploadImportedEntriesMock = vi.hoisted(() => vi.fn())
const createDiaryUploadExecutorMock = vi.hoisted(() => vi.fn())

vi.mock('../../components/common/app-header', () => ({
  default: () => <h1>TraceDiary</h1>,
}))

vi.mock('../../components/auth/auth-panel', () => ({
  default: () => <div aria-label="settings-auth-panel" />,
}))

vi.mock('../../services/indexeddb', () => ({
  getDiary: vi.fn(async () => null),
  saveDiary: vi.fn(async () => {}),
  getSyncBaseline: vi.fn(async () => null),
  saveSyncBaseline: vi.fn(async () => {}),
}))

vi.mock('../../services/import', async () => {
  const actual = await vi.importActual<typeof import('../../services/import')>('../../services/import')
  return {
    ...actual,
    buildImportSourceFile: buildImportSourceFileMock,
    prepareImportPreview: prepareImportPreviewMock,
    applyImportCandidates: applyImportCandidatesMock,
  }
})

vi.mock('../../services/import-sync', () => ({
  autoUploadImportedEntries: autoUploadImportedEntriesMock,
}))

vi.mock('../../services/sync', async () => {
  const actual = await vi.importActual<typeof import('../../services/sync')>('../../services/sync')
  return {
    ...actual,
    createDiaryUploadExecutor: createDiaryUploadExecutorMock,
  }
})

function buildAuthResult(): UseAuthResult {
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
      stage: 'ready',
      config,
      tokenInMemory: 'token',
      dataEncryptionKey: { type: 'secret' } as CryptoKey,
      isLocked: false,
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
    updateConnectionSettings: vi.fn(async () => {}),
    lockNow: vi.fn(),
    clearError: vi.fn(),
  }
}

function renderSettings() {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <SettingsPage auth={buildAuthResult()} />
      </MemoryRouter>
      <ToastCenter />
    </ToastProvider>,
  )
}

describe('设置页导入入口', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createDiaryUploadExecutorMock.mockImplementation(
      () => async () => ({ ok: true, conflict: false, syncedAt: '2026-02-09T00:00:00.000Z' }),
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('无冲突时应完成导入并自动上传', async () => {
    const candidate = {
      sourceName: '2026-02-08.md',
      entry: {
        type: 'daily' as const,
        id: 'daily:2026-02-08',
        date: '2026-02-08',
        filename: '2026-02-08.md.enc',
        content: 'hello',
        wordCount: 5,
        createdAt: '2026-02-08T00:00:00.000Z',
        modifiedAt: '2026-02-08T00:00:00.000Z',
      },
    }

    buildImportSourceFileMock.mockResolvedValue({
      name: '2026-02-08.md',
      mimeType: 'text/markdown',
      size: 5,
      content: 'hello',
    })
    prepareImportPreviewMock.mockResolvedValue({
      ready: [candidate],
      conflicts: [],
      invalid: [],
      failed: [],
    })
    applyImportCandidatesMock.mockResolvedValue({
      persisted: [candidate],
      failed: [],
    })
    autoUploadImportedEntriesMock.mockResolvedValue({
      success: ['daily:2026-02-08'],
      failed: [],
    })

    renderSettings()

    const input = screen.getByTestId('import-file-input') as HTMLInputElement
    fireEvent.change(input, {
      target: {
        files: [new File(['hello'], '2026-02-08.md', { type: 'text/markdown' })],
      },
    })

    await waitFor(() => {
      expect(applyImportCandidatesMock).toHaveBeenCalledTimes(1)
      expect(autoUploadImportedEntriesMock).toHaveBeenCalledTimes(1)
      expect(screen.getByTestId('import-result-dialog')).toBeTruthy()
    })
  })

  it('冲突时应弹出逐条确认并支持覆盖', async () => {
    const conflict = {
      entryId: 'daily:2026-02-08',
      sourceName: '2026-02-08.md',
      localModifiedAt: '2026-01-01T00:00:00.000Z',
      incomingModifiedAt: '2026-02-08T00:00:00.000Z',
      incoming: {
        type: 'daily' as const,
        id: 'daily:2026-02-08',
        date: '2026-02-08',
        filename: '2026-02-08.md.enc',
        content: 'override',
        wordCount: 8,
        createdAt: '2026-02-08T00:00:00.000Z',
        modifiedAt: '2026-02-08T00:00:00.000Z',
      },
    }

    buildImportSourceFileMock.mockResolvedValue({
      name: '2026-02-08.md',
      mimeType: 'text/markdown',
      size: 8,
      content: 'override',
    })
    prepareImportPreviewMock.mockResolvedValue({
      ready: [],
      conflicts: [conflict],
      invalid: [],
      failed: [],
    })
    applyImportCandidatesMock.mockResolvedValue({
      persisted: [
        {
          sourceName: conflict.sourceName,
          entry: conflict.incoming,
        },
      ],
      failed: [],
    })
    autoUploadImportedEntriesMock.mockResolvedValue({
      success: ['daily:2026-02-08'],
      failed: [],
    })

    renderSettings()

    const input = screen.getByTestId('import-file-input') as HTMLInputElement
    fireEvent.change(input, {
      target: {
        files: [new File(['override'], '2026-02-08.md', { type: 'text/markdown' })],
      },
    })

    await waitFor(() => {
      expect(screen.getByTestId('import-conflict-dialog')).toBeTruthy()
    })

    fireEvent.click(screen.getByTestId('import-conflict-overwrite'))

    await waitFor(() => {
      expect(applyImportCandidatesMock).toHaveBeenCalledTimes(1)
      expect(autoUploadImportedEntriesMock).toHaveBeenCalledTimes(1)
    })
  })
})
