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
}

function MilkdownRuntimeEditor({ initialValue, onChange, disabled, docKey }: MarkdownEditorProps) {
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEditor((root) => {
    let isInitialEvent = true

    return Editor.make()
      .config(nord)
      .config((ctx) => {
        ctx.set(rootCtx, root)
        ctx.set(defaultValueCtx, initialValue)
        ctx.get(listenerCtx).markdownUpdated((_ctx, markdown, prevMarkdown) => {
          if (markdown === prevMarkdown) {
            return
          }

          // 首次触发通常由初始化文档导致，避免误判为用户输入。
          if (isInitialEvent) {
            isInitialEvent = false
            if (markdown === initialValue) {
              return
            }
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
}: MarkdownEditorProps) {
  if (import.meta.env.MODE === 'test') {
    return (
      <textarea
        key={docKey}
        aria-label={placeholder}
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
      />
    </MilkdownProvider>
  )
}
