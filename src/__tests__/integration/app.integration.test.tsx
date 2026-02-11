import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import App from '../../App'
import OnThisDayList from '../../components/history/on-this-day-list'
import type { DiaryRecord } from '../../services/indexeddb'

describe('App 路由与工作台入口', () => {
  afterEach(() => {
    window.history.replaceState({}, '', '/')
    localStorage.clear()
  })

  it('应默认进入单页工作台并显示认证弹层', async () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'TraceDiary' })).toBeTruthy()
    expect(await screen.findByLabelText('auth-modal')).toBeTruthy()
    expect(screen.getByText(/^状态：/)).toBeTruthy()
  })

  it('未知路由应回退到工作台', async () => {
    window.history.replaceState({}, '', '/editor?date=2026-02-20')
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'TraceDiary' })).toBeTruthy()
    expect(screen.getByLabelText('workspace-layout')).toBeTruthy()
  })

  it('旧年度总结路由应重定向到年度总结独立页', async () => {
    window.history.replaceState({}, '', '/yearly-summary?year=2025')
    render(<App />)

    expect(await screen.findByRole('heading', { name: '2025 年度总结' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '返回日记工作台' })).toBeTruthy()
  })

  it('统计页路由应可访问并展示统计标题', async () => {
    window.history.replaceState({}, '', '/insights')
    render(<App />)

    expect(await screen.findByRole('heading', { name: '写作统计' })).toBeTruthy()
    expect(screen.getByLabelText('insights-page')).toBeTruthy()
    expect(screen.getByRole('button', { name: '返回日记工作台' })).toBeTruthy()
  })

  it('工作台左侧应支持往年今日与统计分段切换', async () => {
    window.history.replaceState({}, '', '/workspace')
    render(<App />)

    expect(await screen.findByTestId('workspace-left-tab-history')).toBeTruthy()
    fireEvent.click(screen.getByTestId('workspace-left-tab-stats'))

    expect(screen.getByText('写作统计')).toBeTruthy()
    expect(screen.getByTestId('workspace-left-tab-stats')).toBeTruthy()
    expect(
      await screen.findByText(/正在汇总统计数据|还没有记录，今天写下第一篇吧|统计读取失败/u),
    ).toBeTruthy()
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

    render(<OnThisDayList targetDate="2026-02-11" diaries={diaries} onSelectDate={() => {}} />)

    expect(screen.getByLabelText('往年今日列表')).toBeTruthy()
    expect(screen.getByText('2024-02-11')).toBeTruthy()
    expect(screen.queryByText(/^字数\s*\d+/)).toBeNull()
  })
})
