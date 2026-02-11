import { useRef } from 'react'

export interface ConflictVersion {
  content: string
  modifiedAt?: string
}

interface ConflictDialogProps {
  open: boolean
  mode?: 'push' | 'pull'
  local: ConflictVersion
  remote: ConflictVersion | null
  onKeepLocal: () => void
  onKeepRemote: () => void
  onMerge: (mergedContent: string) => void
  onClose: () => void
}

function buildInitialMergeContent(local: string, remote: string | null): string {
  if (!remote) {
    return local
  }

  return `${local}\n\n---\n\n${remote}`
}

function formatModifiedAt(value?: string): string {
  if (!value) {
    return '未知'
  }
  return value
}

export default function ConflictDialog({
  open,
  mode = 'push',
  local,
  remote,
  onKeepLocal,
  onKeepRemote,
  onMerge,
  onClose,
}: ConflictDialogProps) {
  const mergeInputRef = useRef<HTMLTextAreaElement | null>(null)
  const mergeInitialValue = buildInitialMergeContent(local.content, remote?.content ?? null)

  if (!open) {
    return null
  }

  const title = mode === 'pull' ? '检测到拉取冲突' : '检测到同步冲突'
  const description =
    mode === 'pull'
      ? '请选择保留本地、保留远端，或手动合并后应用到本地。'
      : '请选择保留本地、保留远端，或手动合并后再提交。'
  const mergeButtonLabel = mode === 'pull' ? '合并后应用到本地' : '合并后提交'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6 backdrop-blur-sm td-fade-in">
      <article
        className="td-card w-full max-w-4xl bg-td-bg shadow-card"
        aria-label="conflict-dialog"
        data-testid="conflict-dialog"
      >
        <header className="border-b border-td-line px-4 py-3 sm:px-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xl text-td-text">{title}</h2>
            <button type="button" className="td-btn px-2 py-1 text-xs" onClick={onClose}>
              关闭
            </button>
          </div>
          <p className="mt-1 text-sm text-td-muted">{description}</p>
        </header>

        <section className="grid gap-3 border-b border-td-line px-4 py-4 sm:grid-cols-2 sm:px-5">
          <article className="td-card-muted td-panel space-y-2">
            <h3 className="text-base text-td-text">本地版本</h3>
            <p className="text-xs text-td-muted">更新时间：{formatModifiedAt(local.modifiedAt)}</p>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-[10px] border border-td-line bg-td-surface p-3 text-sm text-td-text">
              {local.content}
            </pre>
          </article>

          <article className="td-card-muted td-panel space-y-2">
            <h3 className="text-base text-td-text">远端版本</h3>
            <p className="text-xs text-td-muted">更新时间：{formatModifiedAt(remote?.modifiedAt)}</p>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-[10px] border border-td-line bg-td-surface p-3 text-sm text-td-text">
              {remote?.content ?? '远端版本不可用，请先刷新后重试。'}
            </pre>
          </article>
        </section>

        <section className="space-y-3 px-4 py-4 sm:px-5">
          <label className="block text-sm text-td-muted" htmlFor="merged-content">
            合并内容
          </label>
          <textarea
            key={mergeInitialValue}
            ref={mergeInputRef}
            id="merged-content"
            className="td-input min-h-[180px] font-mono text-sm"
            defaultValue={mergeInitialValue}
            data-testid="conflict-merge-textarea"
          />

          <div className="flex flex-wrap gap-2">
            <button type="button" className="td-btn" onClick={onKeepLocal} data-testid="conflict-keep-local">
              保留本地版本
            </button>
            <button
              type="button"
              className="td-btn"
              onClick={onKeepRemote}
              disabled={!remote}
              data-testid="conflict-keep-remote"
            >
              保留远端版本
            </button>
            <button
              type="button"
              className="td-btn td-btn-primary ml-auto"
              onClick={() => onMerge(mergeInputRef.current?.value ?? mergeInitialValue)}
              data-testid="conflict-merge-submit"
            >
              {mergeButtonLabel}
            </button>
          </div>
        </section>
      </article>
    </div>
  )
}
