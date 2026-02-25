import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import App from '../../App'

async function enterGuestMode(): Promise<void> {
  expect(await screen.findByLabelText('entry-auth-modal')).toBeTruthy()
  fireEvent.click(screen.getByTestId('entry-auth-guest-btn'))
  await waitFor(() => {
    expect(screen.queryByLabelText('entry-auth-modal')).toBeNull()
  })
}

describe('Diary 搜索面板', () => {
  afterEach(() => {
    window.history.replaceState({}, '', '/')
    localStorage.clear()
  })

  it('应支持在搜索分段展示空关键词提示', async () => {
    window.history.replaceState({}, '', '/diary?date=2026-02-19')
    render(<App />)

    await enterGuestMode()
    fireEvent.click(screen.getByTestId('diary-left-tab-search'))

    const input = await screen.findByTestId('diary-search-input')
    expect(input).toHaveAttribute('placeholder', '输入关键词搜索日记内容')
    expect(screen.queryByText('输入关键词开始搜索。')).toBeNull()
    expect(screen.queryByTestId('diary-search-empty')).toBeNull()
  })

  it('输入关键词后应展示结果并支持点击跳转日期', async () => {
    window.history.replaceState({}, '', '/diary?date=2026-02-19')
    render(<App />)

    await enterGuestMode()
    expect(await screen.findByRole('heading', { name: '2026-02-19 日记' })).toBeTruthy()

    fireEvent.click(screen.getByTestId('diary-left-tab-search'))
    fireEvent.change(screen.getByTestId('diary-search-input'), { target: { value: '专注' } })

    expect(await screen.findByTestId('diary-search-virtual-list')).toBeTruthy()
    await waitFor(() => {
      expect(screen.queryByText(/共命中 .* 条记录。/)).toBeNull()
    })
    await waitFor(() => {
      const marks = Array.from(document.querySelectorAll('[data-testid="diary-search-snippet"] mark'))
      expect(marks.some((mark) => mark.textContent === '专注')).toBe(true)
    })

    const cards = await screen.findAllByTestId('diary-search-card')
    fireEvent.click(cards[0] as HTMLElement)

    expect(await screen.findByRole('heading', { name: '2026-11-20 日记' })).toBeTruthy()
  })
})
