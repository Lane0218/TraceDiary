import { Editor, defaultValueCtx, rootCtx } from '@milkdown/kit/core'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { gfm } from '@milkdown/kit/preset/gfm'
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react'
import { nord } from '@milkdown/theme-nord'
import { useEffect, useRef, useState } from 'react'
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
}

type MarkdownEditorInnerProps = Omit<MarkdownEditorProps, 'docKey'> & {
  docKey: string
}

function MilkdownRuntimeEditor({ initialValue, onChange, disabled, docKey, testId }: MarkdownEditorProps) {
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

  return (
    <div
      className={`trace-milkdown rounded-[10px] border border-td-line bg-td-surface ${
        disabled ? 'pointer-events-none opacity-60' : ''
      }`}
      aria-disabled={disabled}
      data-testid={testId}
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
  const wordCountBadge = (
    <div
      className="pointer-events-none absolute bottom-3 right-3 rounded-full border border-td-line bg-td-surface/90 px-2 py-1 text-[11px] leading-none text-td-muted"
      data-testid={testId ? `${testId}-word-count` : undefined}
    >
      字数 {wordCount}
    </div>
  )

  const modeToggle = enableSourceMode ? (
    <div className={`${modeToggleClassName ?? 'mb-2'} flex items-center justify-end gap-2`}>
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
    </div>
  ) : null

  if (import.meta.env.MODE === 'test') {
    return (
      <div>
        {modeToggle}
        <div className="relative">
          <textarea
            key={docKey}
            aria-label={placeholder}
            data-testid={testId}
            value={draftMarkdown}
            onChange={(event) => applyDraftChange(event.target.value)}
            disabled={disabled}
            className={`min-h-[360px] w-full rounded-[10px] border border-td-line bg-td-surface p-4 text-td-text outline-none focus:border-brand-500 ${
              showSourceMode ? 'font-mono text-sm leading-7' : ''
            }`}
          />
          {wordCountBadge}
        </div>
      </div>
    )
  }

  if (showSourceMode) {
    return (
      <div>
        {modeToggle}
        <div className="relative">
          <textarea
            key={docKey}
            aria-label={placeholder}
            data-testid={testId}
            value={draftMarkdown}
            onChange={(event) => applyDraftChange(event.target.value)}
            disabled={disabled}
            spellCheck={false}
            className="trace-editor-source min-h-[360px] w-full rounded-[10px] border border-td-line bg-td-surface p-4 text-sm leading-7 text-td-text outline-none focus:border-brand-500"
          />
          {wordCountBadge}
        </div>
      </div>
    )
  }

  return (
    <div>
      {modeToggle}
      <div className="relative">
        <MilkdownProvider>
          <MilkdownRuntimeEditor
            key={`${docKey}:${wysiwygRevision}`}
            initialValue={draftMarkdown}
            onChange={applyDraftChange}
            disabled={disabled}
            docKey={`${docKey}:${wysiwygRevision}`}
            testId={testId}
          />
        </MilkdownProvider>
        {wordCountBadge}
      </div>
    </div>
  )
}

export default function MarkdownEditor(props: MarkdownEditorProps) {
  const resolvedDocKey = props.docKey ?? 'default'
  return <MarkdownEditorInner key={resolvedDocKey} {...props} docKey={resolvedDocKey} />
}
