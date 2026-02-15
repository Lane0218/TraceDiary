import type { ImportAutoUploadResult } from '../../services/import-sync'
import type { ImportResult } from '../../services/import'

interface ImportResultDialogProps {
  open: boolean
  importResult: ImportResult | null
  uploadResult: ImportAutoUploadResult | null
  uploadSkippedReason: string | null
  onClose: () => void
}

interface SummaryItem {
  label: string
  value: number
}

function SummaryGrid({ items }: { items: SummaryItem[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-3" data-testid="import-result-summary-grid">
      {items.map((item) => (
        <article key={item.label} className="td-import-summary-item">
          <p className="td-import-summary-label">{item.label}</p>
          <p className="td-import-summary-value">{item.value}</p>
        </article>
      ))}
    </div>
  )
}

export default function ImportResultDialog({
  open,
  importResult,
  uploadResult,
  uploadSkippedReason,
  onClose,
}: ImportResultDialogProps) {
  if (!open || !importResult) {
    return null
  }

  const importSummary: SummaryItem[] = [
    { label: '成功导入', value: importResult.success.length },
    { label: '冲突覆盖', value: importResult.overwritten.length },
    { label: '冲突跳过', value: importResult.skipped.length },
    { label: '无效命名', value: importResult.invalid.length },
    { label: '导入失败', value: importResult.failed.length },
  ]

  const uploadSummary: SummaryItem[] = uploadResult
    ? [
        { label: '自动上传成功', value: uploadResult.success.length },
        { label: '自动上传失败', value: uploadResult.failed.length },
      ]
    : []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6 backdrop-blur-sm td-fade-in">
      <article
        className="td-card w-full max-w-3xl bg-td-bg shadow-card"
        aria-label="import-result-dialog"
        data-testid="import-result-dialog"
      >
        <header className="border-b border-td-line px-4 py-3 sm:px-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg text-td-text">导入结果</h2>
            <button type="button" className="td-btn px-2 py-1 text-xs" onClick={onClose} data-testid="import-result-close">
              关闭
            </button>
          </div>
          <p className="mt-1 text-sm text-td-muted">导入与上传结果如下。</p>
        </header>

        <section className="space-y-3 px-4 py-4 sm:px-5">
          <section className="space-y-2">
            <h3 className="td-import-section-title">导入汇总</h3>
            <SummaryGrid items={importSummary} />
          </section>

          <section className="space-y-2" data-testid="import-upload-summary">
            <h3 className="td-import-section-title">自动上传汇总</h3>
            {uploadResult ? (
              <SummaryGrid items={uploadSummary} />
            ) : (
              <p className="text-sm text-td-muted">{uploadSkippedReason ?? '未执行自动上传。'}</p>
            )}
          </section>

          {importResult.invalid.length > 0 ? (
            <section className="td-import-list-block" data-testid="import-invalid-list">
              <h4 className="td-import-list-title">无效命名文件</h4>
              <ul className="td-import-list">
                {importResult.invalid.map((item) => (
                  <li key={`${item.name}:${item.reason}`}>
                    <code>{item.name}</code>
                    <span>：{item.reason}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {importResult.failed.length > 0 ? (
            <section className="td-import-list-block" data-testid="import-failed-list">
              <h4 className="td-import-list-title">导入失败文件</h4>
              <ul className="td-import-list">
                {importResult.failed.map((item) => (
                  <li key={`${item.name}:${item.reason}`}>
                    <code>{item.name}</code>
                    <span>：{item.reason}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {uploadResult && uploadResult.failed.length > 0 ? (
            <section className="td-import-list-block" data-testid="import-upload-failed-list">
              <h4 className="td-import-list-title">自动上传失败条目</h4>
              <ul className="td-import-list">
                {uploadResult.failed.map((item) => (
                  <li key={`${item.entryId}:${item.reason}`}>
                    <code>{item.entryId}</code>
                    <span>：{item.reason}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </section>
      </article>
    </div>
  )
}
