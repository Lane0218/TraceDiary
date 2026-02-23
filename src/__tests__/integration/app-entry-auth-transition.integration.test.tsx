import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../App'

const mockAuthState = vi.hoisted(() => ({
  stage: 'needs-setup',
}))

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
    getSupabaseSession: vi.fn(async () => null),
    onSupabaseAuthStateChange: vi.fn(() => () => {}),
    signOutSupabase: vi.fn(async () => {}),
  }
})

vi.mock('../../components/auth/entry-auth-modal', () => ({
  default: (props: {
    open: boolean
    onLockOpenForAuthTransition?: () => void
  }) =>
    props.open ? (
      <div data-testid="mock-entry-auth-modal">
        <button
          type="button"
          data-testid="mock-lock-open-btn"
          onClick={() => props.onLockOpenForAuthTransition?.()}
        >
          lock-open
        </button>
      </div>
    ) : null,
}))

describe('App 首屏弹窗过渡态', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/diary')
    mockAuthState.stage = 'needs-setup'
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
})
