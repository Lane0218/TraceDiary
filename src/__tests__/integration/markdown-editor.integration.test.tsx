import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import MarkdownEditor from '../../components/editor/markdown-editor'

describe('MarkdownEditor 组件', () => {
  it('默认应进入可视化模式', () => {
    render(<MarkdownEditor initialValue="初始内容" onChange={() => {}} testId="daily-editor" />)

    expect(screen.getByTestId('daily-editor-mode-source')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByLabelText('开始记录今天...')).toHaveValue('初始内容')
    expect(screen.getByTestId('daily-editor-word-count')).toHaveTextContent('字数 4')
  })

  it('传入 viewportHeight 时应应用固定编辑区高度', () => {
    render(<MarkdownEditor initialValue="初始内容" onChange={() => {}} testId="daily-editor" viewportHeight={430} />)

    expect(screen.getByLabelText('开始记录今天...')).toHaveStyle({ height: '430px' })
  })

  it('字数应按去空白字符数统计', () => {
    const onChange = vi.fn()
    render(<MarkdownEditor initialValue={' A \nB\t C '} onChange={onChange} testId="daily-editor" />)

    const editor = screen.getByLabelText('开始记录今天...')
    expect(screen.getByTestId('daily-editor-word-count')).toHaveTextContent('字数 3')

    fireEvent.change(editor, { target: { value: '  hello  \n world \t' } })
    expect(onChange).toHaveBeenLastCalledWith('  hello  \n world \t')
    expect(screen.getByTestId('daily-editor-word-count')).toHaveTextContent('字数 10')

    fireEvent.change(editor, { target: { value: ' \n\t  ' } })
    expect(screen.getByTestId('daily-editor-word-count')).toHaveTextContent('字数 0')
  })

  it('源码按钮应在源码与可视化间切换并共享 Markdown 内容', () => {
    const onChange = vi.fn()
    render(<MarkdownEditor initialValue="hello" onChange={onChange} testId="daily-editor" />)
    const sourceModeButton = screen.getByTestId('daily-editor-mode-source')

    expect(screen.getByTestId('daily-editor-word-count')).toHaveTextContent('字数 5')

    const editor = screen.getByLabelText('开始记录今天...')
    fireEvent.change(editor, { target: { value: '# 标题一' } })
    expect(onChange).toHaveBeenLastCalledWith('# 标题一')
    expect(screen.getByTestId('daily-editor-word-count')).toHaveTextContent('字数 4')

    fireEvent.click(sourceModeButton)
    expect(sourceModeButton).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('开始记录今天...')).toHaveValue('# 标题一')
    expect(screen.getByTestId('daily-editor-word-count')).toHaveTextContent('字数 4')

    fireEvent.change(screen.getByLabelText('开始记录今天...'), { target: { value: '1. 第一项' } })
    expect(onChange).toHaveBeenLastCalledWith('1. 第一项')
    expect(screen.getByTestId('daily-editor-word-count')).toHaveTextContent('字数 5')

    fireEvent.click(sourceModeButton)
    expect(sourceModeButton).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByLabelText('开始记录今天...')).toHaveValue('1. 第一项')
    expect(screen.getByTestId('daily-editor-word-count')).toHaveTextContent('字数 5')
  })

  it('docKey 变化时应重置为新文档内容并回到可视化模式', () => {
    const onChange = vi.fn()
    const view = render(
      <MarkdownEditor
        key="doc-1"
        initialValue="旧文档A"
        onChange={onChange}
        testId="daily-editor"
        docKey="doc-1"
      />,
    )

    expect(screen.getByTestId('daily-editor-word-count')).toHaveTextContent('字数 4')

    fireEvent.click(screen.getByTestId('daily-editor-mode-source'))
    fireEvent.change(screen.getByLabelText('开始记录今天...'), { target: { value: '- 临时修改' } })
    expect(screen.getByTestId('daily-editor-word-count')).toHaveTextContent('字数 5')

    view.rerender(
      <MarkdownEditor
        key="doc-2"
        initialValue="新文档内容XYZ"
        onChange={onChange}
        testId="daily-editor"
        docKey="doc-2"
      />,
    )

    expect(screen.getByTestId('daily-editor-mode-source')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByLabelText('开始记录今天...')).toHaveValue('新文档内容XYZ')
    expect(screen.getByTestId('daily-editor-word-count')).toHaveTextContent('字数 8')
  })

  it('底部模式下应将源码按钮与字数放在编辑区底部', () => {
    render(
      <MarkdownEditor
        initialValue="底部工具条"
        onChange={() => {}}
        testId="daily-editor"
        modeTogglePlacement="bottom"
      />,
    )

    expect(screen.getByTestId('daily-editor-word-count')).toHaveTextContent('字数 5')
    expect(screen.getByTestId('daily-editor-mode-source')).toHaveAttribute('aria-pressed', 'false')
  })
})
