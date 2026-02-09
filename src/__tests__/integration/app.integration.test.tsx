import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import App from '../../App'

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
})
