import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ToastCenter from '../../components/common/toast-center'
import { ToastProvider } from '../../hooks/use-toast'
import type { UseAuthResult } from '../../hooks/use-auth'
import { useDiary } from '../../hooks/use-diary'
import DiaryPage from '../../pages/diary'

const buildImportSourceFileMock = vi.hoisted(() => vi.fn())
const prepareImportPreviewMock = vi.hoisted(() => vi.fn())
const applyImportCandidatesMock = vi.hoisted(() => vi.fn())
const autoUploadImportedEntriesMock = vi.hoisted(() => vi.fn())
const createDiaryUploadExecutorMock = vi.hoisted(() => vi.fn())

vi.mock('../../hooks/use-diary', () => ({
  useDiary: vi.fn(),
}))

vi.mock('../../components/calendar/month-calendar', () => ({
  default: () => <div data-testid="mock-month-calendar" />,
}))

vi.mock('../../components/editor/markdown-editor', () => ({
  default: ({ initialValue, onChange }: { initialValue: string; onChange: (value: string) => void }) => (
    <textarea data-testid="mock-daily-editor" defaultValue={initialValue} onChange={(event) => onChange(event.target.value)} />
  ),
}))

vi.mock('../../components/history/on-this-day-list', () => ({
  default: () => <div data-testid="mock-on-this-day-list" />,
}))

vi.mock('../../components/stats/stats-overview-card', () => ({
  default: () => <div data-testid="mock-stats-overview" />,
}))

vi.mock('../../components/common/app-header', () => ({
  default: () => <h1>TraceDiary</h1>,
}))

vi.mock('../../components/common/auth-modal', () => ({
  default: () => null,
}))

vi.mock('../../components/common/conflict-dialog', () => ({
  default: () => null,
}))

vi.mock('../../services/indexeddb', () => ({
  DIARY_INDEX_TYPE: 'type',
  listDiariesByIndex: vi.fn(async () => []),
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
    pullDiaryFromGitee: vi.fn(async () => ({ ok: false, conflict: false, reason: 'not_found' as const })),
  }
})

const useDiaryMock = vi.mocked(useDiary)

function buildAuthResult(): UseAuthResult {
  return {
    state: {
      stage: 'ready',
      config: {
        giteeRepo: 'lane/repo',
        giteeOwner: 'lane',
        giteeRepoName: 'repo',
        giteeBranch: 'master',
        passwordHash: 'hash',
        passwordExpiry: '2026-12-30T00:00:00.000Z',
        kdfParams: {
          algorithm: 'PBKDF2',
          hash: 'SHA-256',
          iterations: 300_000,
          salt: 'salt',
        },
        encryptedToken: 'cipher',
        tokenCipherVersion: 'v1',
      },
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
    unlockWithMasterPassword: vi.fn(async () => {}),
    updateTokenCiphertext: vi.fn(async () => {}),
    updateConnectionSettings: vi.fn(async () => {}),
    lockNow: vi.fn(),
    clearError: vi.fn(),
  }
}

function renderDiary() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/diary?date=2026-02-08']}>
        <Routes>
          <Route path="/diary" element={<DiaryPage auth={buildAuthResult()} />} />
        </Routes>
      </MemoryRouter>
      <ToastCenter />
    </ToastProvider>,
  )
}

describe('导入流程集成', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createDiaryUploadExecutorMock.mockImplementation(
      () => async () => ({ ok: true, conflict: false, syncedAt: '2026-02-09T00:00:00.000Z' }),
    )
    useDiaryMock.mockReturnValue({
      entryId: 'daily:2026-02-08',
      content: '',
      entry: null,
      loadRevision: 0,
      isLoading: false,
      isSaving: false,
      error: null,
      setContent: vi.fn(),
      waitForPersisted: vi.fn(async () => null),
    })
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

    renderDiary()

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

    renderDiary()

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
