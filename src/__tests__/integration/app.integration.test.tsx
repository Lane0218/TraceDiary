import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from '../../App'

describe('App 路由', () => {
  it('应默认进入欢迎页并可跳转到其他页面', async () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: '欢迎使用 TraceDiary' })).toBeTruthy()

    fireEvent.click(screen.getByRole('link', { name: '日历' }))
    expect(await screen.findByRole('heading', { name: '日历页面' })).toBeTruthy()

    fireEvent.click(screen.getByRole('link', { name: '编辑' }))
    expect(await screen.findByRole('heading', { name: '编辑页面' })).toBeTruthy()
  })
})
