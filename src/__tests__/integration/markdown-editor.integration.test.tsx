import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import MarkdownEditor from '../../components/editor/markdown-editor'

describe('MarkdownEditor 组件', () => {
  it('默认应进入可视化模式', () => {
    render(<MarkdownEditor initialValue="初始内容" onChange={() => {}} testId="daily-editor" />)

    expect(screen.getByTestId('daily-editor-mode-wysiwyg')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('daily-editor-mode-source')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByLabelText('开始记录今天...')).toHaveValue('初始内容')
  })

  it('源码与可视化模式应共享同一份 Markdown 内容', () => {
    const onChange = vi.fn()
    render(<MarkdownEditor initialValue="hello" onChange={onChange} testId="daily-editor" />)

    const editor = screen.getByLabelText('开始记录今天...')
    fireEvent.change(editor, { target: { value: '# 标题一' } })
    expect(onChange).toHaveBeenLastCalledWith('# 标题一')

    fireEvent.click(screen.getByTestId('daily-editor-mode-source'))
    expect(screen.getByTestId('daily-editor-mode-source')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('开始记录今天...')).toHaveValue('# 标题一')

    fireEvent.change(screen.getByLabelText('开始记录今天...'), { target: { value: '1. 第一项' } })
    expect(onChange).toHaveBeenLastCalledWith('1. 第一项')

    fireEvent.click(screen.getByTestId('daily-editor-mode-wysiwyg'))
    expect(screen.getByTestId('daily-editor-mode-wysiwyg')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('开始记录今天...')).toHaveValue('1. 第一项')
  })

  it('docKey 变化时应重置为新文档内容并回到可视化模式', () => {
    const onChange = vi.fn()
    const view = render(
      <MarkdownEditor
        key="doc-1"
        initialValue="旧文档内容"
        onChange={onChange}
        testId="daily-editor"
        docKey="doc-1"
      />,
    )

    fireEvent.click(screen.getByTestId('daily-editor-mode-source'))
    fireEvent.change(screen.getByLabelText('开始记录今天...'), { target: { value: '- 临时修改' } })

    view.rerender(
      <MarkdownEditor
        key="doc-2"
        initialValue="新文档内容"
        onChange={onChange}
        testId="daily-editor"
        docKey="doc-2"
      />,
    )

    expect(screen.getByTestId('daily-editor-mode-wysiwyg')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('daily-editor-mode-source')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByLabelText('开始记录今天...')).toHaveValue('新文档内容')
  })
})
