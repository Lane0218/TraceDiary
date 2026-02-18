import type { PullRemoteDiariesToIndexedDbResult } from '../../services/sync'

interface PullResultDialogProps {
  open: boolean
  result: PullRemoteDiariesToIndexedDbResult | null
  onClose: () => void
}

interface SummaryItem {
  label: string
  value: number
}

function SummaryGrid({ items }: { items: SummaryItem[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-3" data-testid="pull-result-summary-grid">
      {items.map((item) => (
        <article key={item.label} className="td-import-summary-item">
          <p className="td-import-summary-label">{item.label}</p>
          <p className="td-import-summary-value">{item.value}</p>
        </article>
      ))}
    </div>
  )
}

export default function PullResultDialog({ open, result, onClose }: PullResultDialogProps) {
  if (!open || !result) {
    return null
  }

  const summaryItems: SummaryItem[] = [
    { label: '远端总条目', value: result.total },
    { label: '新增写入', value: result.inserted },
    { label: '更新覆盖', value: result.updated },
    { label: '跳过条目', value: result.skipped },
    { label: '冲突跳过', value: result.conflicted },
    { label: '拉取失败', value: result.failed },
    { label: '实际下载', value: result.downloaded },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6 backdrop-blur-sm td-fade-in">
      <article
        className="td-card w-full max-w-3xl bg-td-bg shadow-card"
        aria-label="pull-result-dialog"
        data-testid="pull-result-dialog"
      >
        <header className="border-b border-td-line px-4 py-3 sm:px-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg text-td-text">拉取结果</h2>
            <button type="button" className="td-btn px-2 py-1 text-xs" onClick={onClose} data-testid="pull-result-close">
              关闭
            </button>
          </div>
          <p className="mt-1 text-sm text-td-muted">全量 pull 执行完成，结果如下。</p>
        </header>

        <section className="space-y-3 px-4 py-4 sm:px-5">
          <section className="space-y-2">
            <h3 className="td-import-section-title">全量拉取汇总</h3>
            <SummaryGrid items={summaryItems} />
            {result.metadataMissing ? (
              <p className="text-sm text-td-muted" data-testid="pull-result-metadata-missing">
                远端 metadata 不存在，当前没有可拉取条目。
              </p>
            ) : null}
          </section>

          {result.conflicts.length > 0 ? (
            <section className="td-import-list-block" data-testid="pull-result-conflict-list">
              <h4 className="td-import-list-title">冲突条目</h4>
              <ul className="td-import-list">
                {result.conflicts.map((item) => (
                  <li key={`${item.entryId}:${item.reason}`}>
                    <code>{item.entryId}</code>
                    <span>：{item.reason}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {result.failedItems.length > 0 ? (
            <section className="td-import-list-block" data-testid="pull-result-failed-list">
              <h4 className="td-import-list-title">失败条目</h4>
              <ul className="td-import-list">
                {result.failedItems.map((item) => (
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
