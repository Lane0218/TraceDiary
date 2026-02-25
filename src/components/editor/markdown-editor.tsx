import { Editor, defaultValueCtx, rootCtx } from '@milkdown/kit/core'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { gfm } from '@milkdown/kit/preset/gfm'
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react'
import { nord } from '@milkdown/theme-nord'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { countVisibleChars } from '../../utils/word-count'
import './markdown-editor.css'

interface MarkdownEditorProps {
  initialValue: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  docKey?: string
  testId?: string
  enableSourceMode?: boolean
  defaultMode?: 'wysiwyg' | 'source'
  modeToggleClassName?: string
  modeTogglePlacement?: 'top' | 'bottom'
  viewportHeight?: number
  fillHeight?: boolean
}

type MarkdownEditorInnerProps = Omit<MarkdownEditorProps, 'docKey'> & {
  docKey: string
}

interface MilkdownRuntimeEditorProps {
  initialValue: string
  onChange: (value: string) => void
  disabled?: boolean
  docKey: string
  testId?: string
  viewportHeight?: number
  fillHeight?: boolean
}

function MilkdownRuntimeEditor({
  initialValue,
  onChange,
  disabled,
  docKey,
  testId,
  viewportHeight,
  fillHeight = false,
}: MilkdownRuntimeEditorProps) {
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEditor((root) => {
    let allowChangeEvents = false
    setTimeout(() => {
      allowChangeEvents = true
    }, 0)

    return Editor.make()
      .config(nord)
      .config((ctx) => {
        ctx.set(rootCtx, root)
        ctx.set(defaultValueCtx, initialValue)
        ctx.get(listenerCtx).markdownUpdated((_ctx, markdown, prevMarkdown) => {
          if (markdown === prevMarkdown) {
            return
          }
          if (!allowChangeEvents) {
            // 初始化期会触发程序化更新，不能回写到数据层，否则会覆盖真实内容。
            return
          }
          onChangeRef.current(markdown)
        })
      })
      .use(commonmark)
      .use(gfm)
      .use(listener)
  }, [docKey])
  const resolvedViewportHeight =
    typeof viewportHeight === 'number' && viewportHeight > 0 ? viewportHeight : undefined
  const editorStyle = resolvedViewportHeight
    ? ({
        '--td-editor-height': `${resolvedViewportHeight}px`,
        '--td-editor-content-height': `${Math.max(resolvedViewportHeight - 40, 260)}px`,
      } as CSSProperties)
    : undefined

  return (
    <div
      className={`trace-milkdown rounded-[10px] border border-td-line bg-td-surface ${
        fillHeight ? 'trace-milkdown-fill h-full min-h-0' : ''
      } ${
        disabled ? 'pointer-events-none opacity-60' : ''
      }`}
      aria-disabled={disabled}
      data-testid={testId}
      style={editorStyle}
    >
      <Milkdown />
    </div>
  )
}

function MarkdownEditorInner({
  initialValue,
  onChange,
  placeholder = '开始记录今天...',
  disabled = false,
  docKey,
  testId,
  enableSourceMode = true,
  defaultMode = 'wysiwyg',
  modeToggleClassName,
  modeTogglePlacement = 'top',
  viewportHeight,
  fillHeight = false,
}: MarkdownEditorInnerProps) {
  const [mode, setMode] = useState<'wysiwyg' | 'source'>(defaultMode)
  const [draftMarkdown, setDraftMarkdown] = useState(initialValue)
  const [wysiwygRevision, setWysiwygRevision] = useState(0)
  const wordCount = countVisibleChars(draftMarkdown)

  const applyDraftChange = (nextValue: string) => {
    setDraftMarkdown(nextValue)
    onChange(nextValue)
  }

  const showSourceMode = enableSourceMode && mode === 'source'
  const showTopBar = modeTogglePlacement === 'top'
  const showBottomBar = modeTogglePlacement === 'bottom'
  const showToolbarWordCount = showTopBar || showBottomBar
  const resolvedViewportHeight =
    typeof viewportHeight === 'number' && viewportHeight > 0 ? viewportHeight : undefined
  const sourceEditorStyle = fillHeight
    ? ({ height: '100%' } as CSSProperties)
    : resolvedViewportHeight
      ? ({ height: `${resolvedViewportHeight}px` } as CSSProperties)
      : undefined
  const editorShellClassName = fillHeight ? 'flex h-full min-h-0 flex-col' : ''
  const editorBodyClassName = fillHeight ? 'relative min-h-0 flex-1' : 'relative'
  const bubbleFrameClassName = 'inline-flex h-6 items-center rounded-full border px-2.5 text-[11px] leading-none'
  const bubbleClassName = `${bubbleFrameClassName} border-td-line bg-td-surface text-td-muted`
  const sourceBubbleClassName = `${bubbleFrameClassName} transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
    mode === 'source'
      ? 'td-btn-primary-ink'
      : 'border-td-line bg-td-surface text-td-muted hover:border-[#cfcac1] hover:text-td-text'
  }`
  const renderWordCountBadge = () => (
    <div
      className={bubbleClassName}
      data-testid={testId ? `${testId}-word-count` : undefined}
    >
      字数 {wordCount}
    </div>
  )
  const floatingWordCountBadge = (
    <div
      className={`pointer-events-none absolute bottom-3 right-3 ${bubbleClassName}`}
      data-testid={testId ? `${testId}-word-count` : undefined}
    >
      字数 {wordCount}
    </div>
  )

  const modeToggleButton = enableSourceMode ? (
    <button
      type="button"
      className={sourceBubbleClassName}
      aria-pressed={mode === 'source'}
      onClick={() => {
        if (mode === 'source') {
          setMode('wysiwyg')
          setWysiwygRevision((prev) => prev + 1)
          return
        }
        setMode('source')
      }}
      disabled={disabled}
      data-testid={testId ? `${testId}-mode-source` : undefined}
    >
      源码
    </button>
  ) : null

  const editorTopBar = showTopBar ? (
    <div className={`${modeToggleClassName ?? 'mb-2'} flex items-center justify-end gap-2`}>
      {renderWordCountBadge()}
      {modeToggleButton}
    </div>
  ) : null

  const editorBottomBar = showBottomBar ? (
    <div className={`${modeToggleClassName ?? 'mt-2'} flex items-center justify-end gap-2`}>
      {renderWordCountBadge()}
      {modeToggleButton}
    </div>
  ) : null

  if (import.meta.env.MODE === 'test') {
    return (
      <div className={editorShellClassName}>
        {editorTopBar}
        <div className={editorBodyClassName}>
          <textarea
            key={docKey}
            aria-label={placeholder}
            data-testid={testId}
            value={draftMarkdown}
            onChange={(event) => applyDraftChange(event.target.value)}
            disabled={disabled}
            className={`w-full resize-none overflow-y-auto rounded-[10px] border border-td-line bg-td-surface p-4 text-td-text outline-none focus:border-brand-500 ${
              fillHeight ? 'h-full min-h-0' : 'min-h-[360px]'
            } ${
              showSourceMode ? 'font-mono text-sm leading-7' : ''
            }`}
            style={sourceEditorStyle}
          />
          {showToolbarWordCount ? null : floatingWordCountBadge}
        </div>
        {editorBottomBar}
      </div>
    )
  }

  if (showSourceMode) {
    return (
      <div className={editorShellClassName}>
        {editorTopBar}
        <div className={editorBodyClassName}>
          <textarea
            key={docKey}
            aria-label={placeholder}
            data-testid={testId}
            value={draftMarkdown}
            onChange={(event) => applyDraftChange(event.target.value)}
            disabled={disabled}
            spellCheck={false}
            className={`trace-editor-source w-full resize-none overflow-y-auto rounded-[10px] border border-td-line bg-td-surface p-4 text-sm leading-7 text-td-text outline-none focus:border-brand-500 ${
              fillHeight ? 'h-full min-h-0' : 'min-h-[360px]'
            }`}
            style={sourceEditorStyle}
          />
          {showToolbarWordCount ? null : floatingWordCountBadge}
        </div>
        {editorBottomBar}
      </div>
    )
  }

  return (
    <div className={editorShellClassName}>
      {editorTopBar}
      <div className={editorBodyClassName}>
        <MilkdownProvider>
          <MilkdownRuntimeEditor
            key={`${docKey}:${wysiwygRevision}`}
            initialValue={draftMarkdown}
            onChange={applyDraftChange}
            disabled={disabled}
            docKey={`${docKey}:${wysiwygRevision}`}
            testId={testId}
            viewportHeight={viewportHeight}
            fillHeight={fillHeight}
          />
        </MilkdownProvider>
        {showToolbarWordCount ? null : floatingWordCountBadge}
      </div>
      {editorBottomBar}
    </div>
  )
}

export default function MarkdownEditor(props: MarkdownEditorProps) {
  const resolvedDocKey = props.docKey ?? 'default'
  return <MarkdownEditorInner key={resolvedDocKey} {...props} docKey={resolvedDocKey} />
}
