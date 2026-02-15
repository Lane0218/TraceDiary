import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import App from '../../App'
import OnThisDayList from '../../components/history/on-this-day-list'
import type { DiaryRecord } from '../../services/indexeddb'

describe('App 路由与日记页入口', () => {
  afterEach(() => {
    window.history.replaceState({}, '', '/')
    localStorage.clear()
  })

  it('应默认进入单页日记并显示认证弹层', async () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'TraceDiary' })).toBeTruthy()
    expect(screen.getByTestId('app-nav-diary')).toBeTruthy()
    expect(screen.getByTestId('app-nav-settings')).toBeTruthy()
    expect(await screen.findByLabelText('auth-modal')).toBeTruthy()
    expect(screen.getByText(/^状态：/)).toBeTruthy()
  })

  it('未知路由应回退到日记页', async () => {
    window.history.replaceState({}, '', '/editor?date=2026-02-20')
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'TraceDiary' })).toBeTruthy()
    expect(screen.getByLabelText('diary-layout')).toBeTruthy()
  })

  it('旧年度总结路由应重定向到年度总结独立页', async () => {
    window.history.replaceState({}, '', '/yearly-summary?year=2025')
    render(<App />)

    expect(await screen.findByRole('heading', { name: '2025 年度总结' })).toBeTruthy()
    expect(screen.getByTestId('app-nav-diary')).toBeTruthy()
  })

  it('统计页路由应可访问并展示统计标题', async () => {
    window.history.replaceState({}, '', '/insights')
    render(<App />)

    expect(await screen.findByRole('heading', { name: '数据统计' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '近 12 个月趋势' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '年度对比' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '年度洞察' })).toBeTruthy()
    expect(screen.getByTestId('insights-yearly-summary-cards')).toBeTruthy()
    expect(screen.getByTestId('insights-yearly-heatmap')).toBeTruthy()
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
    expect(screen.queryByText('在此直接管理配置、解锁状态与 Token 凭据。')).toBeNull()
    expect(screen.queryByText('认证与安全')).toBeNull()
    expect(screen.queryByRole('button', { name: '配置' })).toBeNull()
    expect(screen.queryByRole('button', { name: '锁定' })).toBeNull()
  })

  it('日记页左侧应支持往年今日与统计分段切换', async () => {
    window.history.replaceState({}, '', '/diary')
    render(<App />)

    expect(await screen.findByTestId('diary-left-tab-history')).toBeTruthy()
    fireEvent.click(screen.getByTestId('diary-left-tab-stats'))

    expect(screen.getByTestId('diary-left-tab-stats')).toBeTruthy()
    expect(await screen.findByText(/正在汇总统计数据|统计读取失败/u)).toBeTruthy()
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
