import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from '../../App'

describe('App 首页', () => {
  it('应渲染 TraceDiary 标题与副标题', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'TraceDiary' })).toBeTruthy()
    expect(screen.getByText('你的私密、可同步、加密日记。')).toBeTruthy()
  })
})
