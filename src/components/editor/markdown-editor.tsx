import { Editor, defaultValueCtx, rootCtx } from '@milkdown/kit/core'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { gfm } from '@milkdown/kit/preset/gfm'
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react'
import { nord } from '@milkdown/theme-nord'
import { useEffect, useRef } from 'react'
import './markdown-editor.css'

interface MarkdownEditorProps {
  initialValue: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  docKey?: string
  testId?: string
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

export default function MarkdownEditor({
  initialValue,
  onChange,
  placeholder = '开始记录今天...',
  disabled = false,
  docKey = 'default',
  testId,
}: MarkdownEditorProps) {
  if (import.meta.env.MODE === 'test') {
    return (
      <textarea
        key={docKey}
        aria-label={placeholder}
        data-testid={testId}
        defaultValue={initialValue}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="min-h-[360px] w-full rounded-[10px] border border-td-line bg-td-surface p-4 text-td-text outline-none focus:border-brand-500"
      />
    )
  }

  return (
    <MilkdownProvider>
      <MilkdownRuntimeEditor
        initialValue={initialValue}
        onChange={onChange}
        disabled={disabled}
        docKey={docKey}
        testId={testId}
      />
    </MilkdownProvider>
  )
}
