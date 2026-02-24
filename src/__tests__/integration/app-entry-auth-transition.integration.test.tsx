import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../App'

const mockAuthState = vi.hoisted(() => ({
  stage: 'needs-setup',
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

const mockAuth = vi.hoisted(() => ({
  state: mockAuthState as unknown as {
    stage: 'checking' | 'needs-setup' | 'needs-unlock' | 'needs-token-refresh' | 'ready'
  },
  restoreConfigFromCloud: vi.fn(async () => {}),
}))

vi.mock('../../hooks/use-auth', () => ({
  useAuth: () => mockAuth,
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
    mockSessionState.userId = null
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
})
