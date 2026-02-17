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
          if (!root.contains(document.activeElement)) {
            // 仅在编辑器获得焦点时回写，避免程序化刷新误判为用户输入。
            return
          }

          onChangeRef.current(markdown)
        })
      })
      .use(commonmark)
      .use(gfm)
      .use(listener)
  }, [docKey])
  const editorStyle = fillHeight
    ? ({
        '--td-editor-height': '100%',
        '--td-editor-content-height': 'calc(100% - 40px)',
      } as CSSProperties)
    : typeof viewportHeight === 'number' && viewportHeight > 0
      ? ({
          '--td-editor-height': `${viewportHeight}px`,
          '--td-editor-content-height': `${Math.max(viewportHeight - 40, 260)}px`,
        } as CSSProperties)
      : undefined

  return (
    <div
      className={`trace-milkdown rounded-[10px] border border-td-line bg-td-surface ${
        fillHeight ? 'h-full min-h-[360px]' : ''
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
  const showBottomBar = modeTogglePlacement === 'bottom'
  const sourceEditorStyle = fillHeight
    ? ({ height: '100%' } as CSSProperties)
    : typeof viewportHeight === 'number' && viewportHeight > 0
      ? ({ height: `${viewportHeight}px` } as CSSProperties)
      : undefined
  const editorShellClassName = fillHeight ? 'flex h-full min-h-0 flex-col' : ''
  const editorBodyClassName = fillHeight ? 'relative min-h-0 flex-1' : 'relative'
  const floatingWordCountBadge = (
    <div
      className="pointer-events-none absolute bottom-3 right-3 rounded-full border border-td-line bg-td-surface/90 px-2 py-1 text-[11px] leading-none text-td-muted"
      data-testid={testId ? `${testId}-word-count` : undefined}
    >
      字数 {wordCount}
    </div>
  )

  const modeToggleButton = enableSourceMode ? (
    <button
      type="button"
      className={`td-btn px-2.5 py-1 text-xs ${mode === 'source' ? 'td-btn-primary' : ''}`}
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

  const modeToggleTop = modeToggleButton && modeTogglePlacement === 'top' ? (
    <div className={`${modeToggleClassName ?? 'mb-2'} flex items-center justify-end gap-2`}>
      {modeToggleButton}
    </div>
  ) : null

  const editorBottomBar = showBottomBar ? (
    <div className={`${modeToggleClassName ?? 'mt-2'} flex items-center justify-between gap-2`}>
      <div>{modeToggleButton}</div>
      <div
        className="rounded-full border border-td-line bg-td-surface px-2 py-1 text-[11px] leading-none text-td-muted"
        data-testid={testId ? `${testId}-word-count` : undefined}
      >
        字数 {wordCount}
      </div>
    </div>
  ) : null

  if (import.meta.env.MODE === 'test') {
    return (
      <div className={editorShellClassName}>
        {modeToggleTop}
        <div className={editorBodyClassName}>
          <textarea
            key={docKey}
            aria-label={placeholder}
            data-testid={testId}
            value={draftMarkdown}
            onChange={(event) => applyDraftChange(event.target.value)}
            disabled={disabled}
            className={`w-full rounded-[10px] border border-td-line bg-td-surface p-4 text-td-text outline-none focus:border-brand-500 ${
              fillHeight ? 'h-full min-h-[360px]' : 'min-h-[360px]'
            } ${
              showSourceMode ? 'font-mono text-sm leading-7' : ''
            }`}
            style={sourceEditorStyle}
          />
          {showBottomBar ? null : floatingWordCountBadge}
        </div>
        {editorBottomBar}
      </div>
    )
  }

  if (showSourceMode) {
    return (
      <div className={editorShellClassName}>
        {modeToggleTop}
        <div className={editorBodyClassName}>
          <textarea
            key={docKey}
            aria-label={placeholder}
            data-testid={testId}
            value={draftMarkdown}
            onChange={(event) => applyDraftChange(event.target.value)}
            disabled={disabled}
            spellCheck={false}
            className={`trace-editor-source w-full rounded-[10px] border border-td-line bg-td-surface p-4 text-sm leading-7 text-td-text outline-none focus:border-brand-500 ${
              fillHeight ? 'h-full min-h-[360px]' : 'min-h-[360px]'
            }`}
            style={sourceEditorStyle}
          />
          {showBottomBar ? null : floatingWordCountBadge}
        </div>
        {editorBottomBar}
      </div>
    )
  }

  return (
    <div className={editorShellClassName}>
      {modeToggleTop}
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
        {showBottomBar ? null : floatingWordCountBadge}
      </div>
      {editorBottomBar}
    </div>
  )
}

export default function MarkdownEditor(props: MarkdownEditorProps) {
  const resolvedDocKey = props.docKey ?? 'default'
  return <MarkdownEditorInner key={resolvedDocKey} {...props} docKey={resolvedDocKey} />
}
