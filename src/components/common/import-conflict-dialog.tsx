import type { ImportConflictItem } from '../../services/import'

interface ImportConflictDialogProps {
  open: boolean
  item: ImportConflictItem | null
  currentIndex: number
  total: number
  onOverwrite: () => void
  onSkip: () => void
  onClose: () => void
}

function formatModifiedAt(value?: string): string {
  if (!value) {
    return '未知'
  }
  return value
}

export default function ImportConflictDialog({
  open,
  item,
  currentIndex,
  total,
  onOverwrite,
  onSkip,
  onClose,
}: ImportConflictDialogProps) {
  if (!open || !item) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6 backdrop-blur-sm td-fade-in">
      <article className="td-card w-full max-w-2xl bg-td-bg shadow-card" aria-label="import-conflict-dialog" data-testid="import-conflict-dialog">
        <header className="border-b border-td-line px-4 py-3 sm:px-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg text-td-text">导入冲突</h2>
            <button type="button" className="td-btn px-2 py-1 text-xs" onClick={onClose}>
              结束
            </button>
          </div>
          <p className="mt-1 text-sm text-td-muted">第 {currentIndex}/{total} 条：覆盖或跳过。</p>
        </header>

        <section className="space-y-3 px-4 py-4 sm:px-5">
          <div className="td-import-conflict-card" data-testid="import-conflict-item">
            <p className="td-import-conflict-label">来源文件</p>
            <p className="td-import-conflict-value">{item.sourceName}</p>
            <p className="td-import-conflict-label">条目标识</p>
            <p className="td-import-conflict-value">{item.entryId}</p>
            <p className="td-import-conflict-label">本地更新时间</p>
            <p className="td-import-conflict-value">{formatModifiedAt(item.localModifiedAt)}</p>
            <p className="td-import-conflict-label">导入更新时间</p>
            <p className="td-import-conflict-value">{formatModifiedAt(item.incomingModifiedAt)}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" className="td-btn" onClick={onSkip} data-testid="import-conflict-skip">
              跳过
            </button>
            <button
              type="button"
              className="td-btn td-btn-primary ml-auto"
              onClick={onOverwrite}
              data-testid="import-conflict-overwrite"
            >
              覆盖本地
            </button>
          </div>
        </section>
      </article>
    </div>
  )
}
