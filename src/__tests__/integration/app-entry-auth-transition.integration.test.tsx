import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../App'
import type { CloudConfigConflictMeta } from '../../types/cloud-config'

const mockAuthState = vi.hoisted(() => ({
  stage: 'needs-setup',
  config: null as Record<string, unknown> | null,
}))

const mockSessionState = vi.hoisted(() => ({
  userId: null as string | null,
}))

const getSupabaseSessionMock = vi.hoisted(() =>
  vi.fn(async () => {
    if (!mockSessionState.userId) {
      return null
    }
    return {
      user: {
        id: mockSessionState.userId,
        email: `${mockSessionState.userId}@example.com`,
      },
    }
  }),
)

const loadCloudConfigConflictMetaForCurrentUserMock = vi.hoisted(() =>
  vi.fn<() => Promise<CloudConfigConflictMeta>>(async () => ({
    exists: true,
    fingerprint: 'fp-2026-02-25-000000',
  })),
)

const mockAuth = vi.hoisted(() => ({
  state: mockAuthState as unknown as {
    stage: 'checking' | 'needs-setup' | 'needs-unlock' | 'needs-token-refresh' | 'ready'
    config: Record<string, unknown> | null
  },
  restoreConfigFromCloud: vi.fn(async () => {}),
}))

vi.mock('../../hooks/use-auth', () => ({
  useAuth: () => mockAuth,
}))

vi.mock('../../services/cloud-config', () => ({
  loadCloudConfigConflictMetaForCurrentUser: loadCloudConfigConflictMetaForCurrentUserMock,
}))

vi.mock('../../pages/diary', () => ({
  default: () => <div data-testid="mock-diary-page" />,
}))

vi.mock('../../pages/insights', () => ({
  default: () => <div data-testid="mock-insights-page" />,
}))

vi.mock('../../pages/settings', () => ({
  default: () => <div data-testid="mock-settings-page" />,
}))

vi.mock('../../pages/yearly-summary', () => ({
  default: () => <div data-testid="mock-yearly-summary-page" />,
}))

vi.mock('../../pages/auth-reset-password', () => ({
  default: () => <div data-testid="mock-auth-reset-password-page" />,
}))

vi.mock('../../services/supabase', async () => {
  const actual = await vi.importActual<typeof import('../../services/supabase')>('../../services/supabase')
  return {
    ...actual,
    isSupabaseConfigured: () => true,
    getSupabaseSession: getSupabaseSessionMock,
    onSupabaseAuthStateChange: vi.fn(() => () => {}),
    signOutSupabase: vi.fn(async () => {}),
  }
})

vi.mock('../../components/auth/entry-auth-modal', () => ({
  default: (props: {
    open: boolean
    onLockOpenForAuthTransition?: () => void
    onClose?: () => void
  }) =>
    (
      <div data-testid="mock-entry-auth-modal" data-open={props.open ? '1' : '0'}>
        <button
          type="button"
          data-testid="mock-lock-open-btn"
          onClick={() => props.onLockOpenForAuthTransition?.()}
        >
          lock-open
        </button>
        <button type="button" data-testid="mock-entry-close-btn" onClick={() => props.onClose?.()}>
          close
        </button>
        {props.open ? <span data-testid="mock-entry-open" /> : null}
      </div>
    ),
}))

describe('App 首屏弹窗过渡态', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/diary')
    mockAuthState.stage = 'needs-setup'
    mockAuthState.config = null
    mockSessionState.userId = null
    loadCloudConfigConflictMetaForCurrentUserMock.mockResolvedValue({
      exists: true,
      fingerprint: 'fp-2026-02-25-000000',
    })
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  afterEach(() => {
    vi.clearAllMocks()
    window.history.replaceState({}, '', '/')
  })

  it('认证从 needs-setup 切到 checking 时，应保留手动锁定打开的首屏弹窗', () => {
    const { rerender } = render(<App />)

    expect(screen.getByTestId('mock-entry-auth-modal')).toBeTruthy()
    fireEvent.click(screen.getByTestId('mock-lock-open-btn'))

    mockAuthState.stage = 'checking'
    rerender(<App />)

    expect(screen.getByTestId('mock-entry-auth-modal')).toBeTruthy()
  })

  it('首屏认证弹窗打开时应延后“本地已有配置”覆盖确认，关闭后再出现', async () => {
    mockSessionState.userId = 'entry-modal-user'
    mockAuthState.stage = 'checking'
    mockAuthState.config = { giteeRepo: 'lane/diary' }
    const { rerender } = render(<App />)

    fireEvent.click(screen.getByTestId('mock-lock-open-btn'))
    mockAuthState.stage = 'needs-unlock'
    rerender(<App />)

    await waitFor(() => {
      expect(screen.getByTestId('mock-entry-open')).toBeTruthy()
    })
    expect(screen.queryByTestId('cloud-config-overwrite-modal')).toBeNull()

    fireEvent.click(screen.getByTestId('mock-entry-close-btn'))
    await waitFor(() => {
      expect(screen.getByTestId('cloud-config-overwrite-modal')).toBeTruthy()
    })
  })

  it('Token 刷新阶段应延后“本地已有配置”覆盖确认，回到 ready 后再出现', async () => {
    mockSessionState.userId = 'token-refresh-user'
    mockAuthState.stage = 'needs-token-refresh'
    mockAuthState.config = { giteeRepo: 'lane/diary' }
    const { rerender } = render(<App />)

    await waitFor(() => {
      expect(getSupabaseSessionMock).toHaveBeenCalled()
    })
    expect(screen.queryByTestId('cloud-config-overwrite-modal')).toBeNull()

    mockAuthState.stage = 'ready'
    rerender(<App />)
    await waitFor(() => {
      expect(screen.getByTestId('cloud-config-overwrite-modal')).toBeTruthy()
    })
  })

  it('选择保留本地后，重新打开页面且云端版本未变化时不应再次出现覆盖确认', async () => {
    mockSessionState.userId = 'remember-choice-user'
    mockAuthState.stage = 'ready'
    mockAuthState.config = { giteeRepo: 'lane/diary' }
    loadCloudConfigConflictMetaForCurrentUserMock.mockResolvedValue({
      exists: true,
      fingerprint: 'fp-same-config',
    })

    const firstRender = render(<App />)
    await waitFor(() => {
      expect(screen.getByTestId('cloud-config-overwrite-modal')).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId('cloud-config-keep-local-btn'))
    await waitFor(() => {
      expect(screen.queryByTestId('cloud-config-overwrite-modal')).toBeNull()
    })

    firstRender.unmount()

    render(<App />)
    await waitFor(() => {
      expect(loadCloudConfigConflictMetaForCurrentUserMock).toHaveBeenCalledTimes(2)
    })
    expect(screen.queryByTestId('cloud-config-overwrite-modal')).toBeNull()
  })

  it('云端关键配置指纹变化后，应重新出现覆盖确认弹窗', async () => {
    mockSessionState.userId = 'cloud-version-changed-user'
    mockAuthState.stage = 'ready'
    mockAuthState.config = { giteeRepo: 'lane/diary' }
    loadCloudConfigConflictMetaForCurrentUserMock
      .mockResolvedValueOnce({
        exists: true,
        fingerprint: 'fp-config-v1',
      })
      .mockResolvedValueOnce({
        exists: true,
        fingerprint: 'fp-config-v2',
      })

    const firstRender = render(<App />)
    await waitFor(() => {
      expect(screen.getByTestId('cloud-config-overwrite-modal')).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId('cloud-config-keep-local-btn'))
    await waitFor(() => {
      expect(screen.queryByTestId('cloud-config-overwrite-modal')).toBeNull()
    })

    firstRender.unmount()

    render(<App />)
    await waitFor(() => {
      expect(screen.getByTestId('cloud-config-overwrite-modal')).toBeTruthy()
    })
  })

  it('云端无配置时不应出现覆盖确认弹窗', async () => {
    mockSessionState.userId = 'no-cloud-config-user'
    mockAuthState.stage = 'ready'
    mockAuthState.config = { giteeRepo: 'lane/diary' }
    loadCloudConfigConflictMetaForCurrentUserMock.mockResolvedValue({
      exists: false,
      fingerprint: null,
    })

    render(<App />)
    await waitFor(() => {
      expect(loadCloudConfigConflictMetaForCurrentUserMock).toHaveBeenCalledTimes(1)
    })
    expect(screen.queryByTestId('cloud-config-overwrite-modal')).toBeNull()
  })

  it('仅旧版 updatedAt 决策记录时，应再提示一次并在确认后写入新指纹记录', async () => {
    mockSessionState.userId = 'legacy-record-user'
    mockAuthState.stage = 'ready'
    mockAuthState.config = { giteeRepo: 'lane/diary' }
    loadCloudConfigConflictMetaForCurrentUserMock.mockResolvedValue({
      exists: true,
      fingerprint: 'fp-migrate-v1',
    })
    window.localStorage.setItem(
      'trace-diary:cloud-overwrite-decision:v1:legacy-record-user',
      JSON.stringify({
        decision: 'keep_local',
        cloudUpdatedAtAtDecision: '2026-02-25T00:00:00.000Z',
        decidedAt: '2026-02-25T00:00:00.000Z',
      }),
    )

    const firstRender = render(<App />)
    await waitFor(() => {
      expect(screen.getByTestId('cloud-config-overwrite-modal')).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId('cloud-config-keep-local-btn'))
    await waitFor(() => {
      expect(screen.queryByTestId('cloud-config-overwrite-modal')).toBeNull()
    })
    firstRender.unmount()

    render(<App />)
    await waitFor(() => {
      expect(loadCloudConfigConflictMetaForCurrentUserMock).toHaveBeenCalledTimes(2)
    })
    expect(screen.queryByTestId('cloud-config-overwrite-modal')).toBeNull()
  })
})
