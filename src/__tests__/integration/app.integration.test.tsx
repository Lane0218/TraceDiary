import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../../App'
import OnThisDayList from '../../components/history/on-this-day-list'
import type { DiaryRecord } from '../../services/indexeddb'
import { isSupabaseConfigured } from '../../services/supabase'

describe('App 路由与日记页入口', () => {
  afterEach(() => {
    window.history.replaceState({}, '', '/')
    localStorage.clear()
    vi.useRealTimers()
  })

  async function enterGuestFromEntryModal(): Promise<void> {
    expect(await screen.findByLabelText('entry-auth-modal')).toBeTruthy()
    fireEvent.click(screen.getByTestId('entry-auth-guest-btn'))
    await waitFor(() => {
      expect(screen.queryByLabelText('entry-auth-modal')).toBeNull()
    })
  }

  function seedBrokenTokenConfig(): void {
    localStorage.setItem(
      'trace-diary:app-config',
      JSON.stringify({
        giteeRepo: 'https://gitee.com/lane/diary',
        giteeOwner: 'lane',
        giteeRepoName: 'diary',
        giteeBranch: 'master',
        passwordHash: 'hash',
        passwordExpiry: '2099-12-31T00:00:00.000Z',
        kdfParams: {
          algorithm: 'PBKDF2',
          hash: 'SHA-256',
          iterations: 300000,
          salt: 'salt',
        },
        encryptedToken: 'cipher-token',
        tokenCipherVersion: 'v1',
      }),
    )
    localStorage.setItem('trace-diary:auth:lock-state', 'unlocked')
    localStorage.setItem('trace-diary:auth:password-expiry', String(Date.now() + 60 * 60 * 1000))
  }

  it('应默认进入单页日记并展示游客模式入口', async () => {
    render(<App />)

    expect(await screen.findByTestId('entry-auth-guest-btn')).toBeTruthy()
    if (isSupabaseConfigured()) {
      expect(screen.queryByTestId('entry-auth-go-settings-btn')).toBeNull()
    } else {
      expect(screen.getByTestId('entry-auth-go-settings-btn')).toBeTruthy()
    }
    await enterGuestFromEntryModal()
    expect(screen.getByRole('heading', { name: 'TraceDiary' })).toBeTruthy()
    expect(screen.getByTestId('app-nav-diary')).toBeTruthy()
    expect(screen.getByTestId('app-nav-settings')).toBeTruthy()
    expect(await screen.findByTestId('guest-mode-pill')).toBeTruthy()
    expect(screen.queryByLabelText('auth-modal')).toBeNull()
  })

  it('未启用云登录时，首屏弹窗应支持跳转到设置页继续登录与配置', async () => {
    render(<App />)

    expect(await screen.findByLabelText('entry-auth-modal')).toBeTruthy()
    if (isSupabaseConfigured()) {
      expect(screen.queryByTestId('entry-auth-go-settings-btn')).toBeNull()
      return
    }
    expect(screen.getByTestId('entry-auth-go-settings-btn')).toBeTruthy()
    fireEvent.click(screen.getByTestId('entry-auth-go-settings-btn'))
    expect(await screen.findByLabelText('settings-page')).toBeTruthy()
    await waitFor(() => {
      expect(screen.queryByLabelText('entry-auth-modal')).toBeNull()
    })
  })

  it('未知路由应回退到日记页', async () => {
    window.history.replaceState({}, '', '/editor?date=2026-02-20')
    render(<App />)

    await enterGuestFromEntryModal()
    expect(await screen.findByRole('heading', { name: 'TraceDiary' })).toBeTruthy()
    expect(screen.getByLabelText('diary-layout')).toBeTruthy()
  })

  it('旧年度总结路由应重定向到年度总结独立页', async () => {
    window.history.replaceState({}, '', '/yearly-summary?year=2025')
    render(<App />)

    await enterGuestFromEntryModal()
    expect(await screen.findByRole('heading', { name: '2025 年度总结' })).toBeTruthy()
    expect(screen.getByTestId('app-nav-diary')).toBeTruthy()
  })

  it('统计页路由应可访问并展示统计标题', async () => {
    window.history.replaceState({}, '', '/insights')
    render(<App />)

    expect(await screen.findByRole('heading', { name: '数据统计' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '月度趋势' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '年度分析' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '年度对比' })).toBeTruthy()
    expect(screen.getByTestId('insights-yearly-summary-cards')).toBeTruthy()
    expect(screen.getByTestId('insights-monthly-legend')).toBeTruthy()
    expect(screen.getByTestId('insights-monthly-metrics')).toBeTruthy()
    expect(screen.getByTestId('insights-monthly-metric-entry-count')).toBeTruthy()
    expect(screen.getByTestId('insights-yearly-heatmap')).toBeTruthy()
    expect(screen.getByLabelText('热力图年份切换')).toBeTruthy()
    expect(screen.getByLabelText('热力图年份减一')).toBeTruthy()
    expect(screen.getByLabelText('热力图年份')).toBeTruthy()
    expect(screen.getByLabelText('热力图年份加一')).toBeTruthy()
    expect(screen.getByTestId('insights-yearly-heatmap-side-panel')).toBeTruthy()
    expect(screen.getByLabelText('insights-page')).toBeTruthy()
    expect(screen.getByTestId('app-nav-diary')).toBeTruthy()
    expect(screen.getByTestId('app-nav-settings')).toBeTruthy()
  })

  it('设置页路由应可访问并直接展示认证面板', async () => {
    window.history.replaceState({}, '', '/settings')
    render(<App />)

    expect(await screen.findByRole('heading', { name: '设置' })).toBeTruthy()
    expect(screen.getByLabelText('settings-page')).toBeTruthy()
    expect(screen.getByLabelText('settings-auth-panel')).toBeTruthy()
    expect(screen.queryByLabelText('cloud-auth-panel')).toBeNull()
    expect(screen.queryByText('在此直接管理配置、解锁状态与 Token 凭据。')).toBeNull()
    expect(screen.queryByText('认证与安全')).toBeNull()
    expect(screen.queryByRole('button', { name: '配置' })).toBeNull()
    expect(screen.queryByRole('button', { name: '锁定' })).toBeNull()
    expect(screen.queryByTestId('cloud-auth-email-input')).toBeNull()
    expect(screen.queryByTestId('cloud-auth-otp-input')).toBeNull()
    expect(screen.queryByTestId('cloud-auth-send-otp-btn')).toBeNull()
    expect(screen.queryByTestId('cloud-auth-verify-otp-btn')).toBeNull()
  })

  it('Token 失效时认证弹窗应可关闭，用户可先继续浏览本地内容', async () => {
    seedBrokenTokenConfig()
    render(<App />)

    expect(await screen.findByLabelText('auth-modal')).toBeTruthy()
    expect(screen.getByRole('heading', { name: '更新 Token' })).toBeTruthy()
    expect(screen.queryByLabelText('entry-auth-modal')).toBeNull()

    fireEvent.click(screen.getByTestId('auth-modal-close-btn'))
    await waitFor(() => {
      expect(screen.queryByLabelText('auth-modal')).toBeNull()
    })

    expect(screen.getByRole('heading', { name: 'TraceDiary' })).toBeTruthy()
    expect(screen.getByLabelText('diary-layout')).toBeTruthy()
  })

  it('日记页左侧应支持往年今日与统计分段切换', async () => {
    window.history.replaceState({}, '', '/diary')
    render(<App />)

    await enterGuestFromEntryModal()
    expect(await screen.findByTestId('diary-left-tab-history')).toBeTruthy()
    fireEvent.click(screen.getByTestId('diary-left-tab-stats'))

    expect(screen.getByTestId('diary-left-tab-stats')).toBeTruthy()
    expect(await screen.findByLabelText('stats-overview-card')).toBeTruthy()
  })

  it('凌晨 2 点前从 /diary 进入时应默认定位到前一天', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 1, 20, 1, 30, 0))
    window.history.replaceState({}, '', '/diary')
    render(<App />)

    await enterGuestFromEntryModal()
    expect(await screen.findByRole('heading', { name: '2026-02-19 日记' })).toBeTruthy()
  })

  it('往年今日列表不应展示字数文案', () => {
    const diaries: DiaryRecord[] = [
      {
        id: 'daily:2024-02-11',
        type: 'daily',
        date: '2024-02-11',
        content: '这是一条往年记录',
        wordCount: 8,
        createdAt: '2024-02-11T00:00:00.000Z',
        modifiedAt: '2024-02-11T00:00:00.000Z',
      },
      {
        id: 'daily:2026-02-11',
        type: 'daily',
        date: '2026-02-11',
        content: '同年记录应被过滤',
        wordCount: 8,
        createdAt: '2026-02-11T00:00:00.000Z',
        modifiedAt: '2026-02-11T00:00:00.000Z',
      },
    ]

    render(<OnThisDayList targetDate="2026-02-11" diaries={diaries} onSelectDate={() => {}} viewportHeight={430} />)

    expect(screen.getByLabelText('往年今日列表')).toBeTruthy()
    expect(screen.getByLabelText('往年今日列表')).toHaveStyle({ height: '430px' })
    expect(screen.getByText('2024-02-11')).toBeTruthy()
    expect(screen.queryByText(/^字数\s*\d+/)).toBeNull()
  })
})
