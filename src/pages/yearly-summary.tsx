import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import MarkdownEditor from '../components/editor/markdown-editor'
import { useDiary } from '../hooks/use-diary'
import { useSync } from '../hooks/use-sync'

function StatusHint({
  isLoading,
  isSaving,
  error,
}: {
  isLoading: boolean
  isSaving: boolean
  error: string | null
}) {
  if (isLoading) {
    return (
      <p role="status" className="text-sm text-slate-600">
        加载中...
      </p>
    )
  }

  if (error) {
    return (
      <p role="alert" className="text-sm text-rose-600">
        {error}
      </p>
    )
  }

  if (isSaving) {
    return (
      <p role="status" className="text-sm text-amber-700">
        保存中...
      </p>
    )
  }

  return (
    <p role="status" className="text-sm text-emerald-700">
      已保存到本地
    </p>
  )
}

export default function YearlySummaryPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const currentYear = useMemo(() => new Date().getFullYear(), [])
  const year = useMemo(() => {
    const queryYear = Number.parseInt(searchParams.get('year') ?? '', 10)
    if (Number.isFinite(queryYear) && queryYear >= 1970 && queryYear <= 9999) {
      return queryYear
    }
    return currentYear
  }, [currentYear, searchParams])
  const summary = useDiary({ type: 'yearly_summary', year })
  const sync = useSync<{
    type: 'yearly_summary'
    entryId: string
    year: number
    content: string
    modifiedAt: string
  }>()

  const syncPayload = useMemo(
    () => ({
      type: 'yearly_summary' as const,
      entryId: summary.entryId,
      year,
      content: summary.content,
      modifiedAt: summary.entry?.modifiedAt ?? new Date().toISOString(),
    }),
    [summary.content, summary.entry?.modifiedAt, summary.entryId, year],
  )

  const handleYearChange = (nextYear: number) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('year', String(nextYear))
      return next
    })
  }

  const handleEditorChange = (nextContent: string) => {
    summary.setContent(nextContent)
    sync.onInputChange({
      ...syncPayload,
      content: nextContent,
      modifiedAt: new Date().toISOString(),
    })
  }

  return (
    <article className="space-y-4" aria-label="yearly-summary-page">
      <header className="space-y-2">
        <h2 className="text-3xl font-semibold text-ink-900 sm:text-4xl">年度总结页面</h2>
        <p className="text-slate-600">按年份编辑总结，文件名规则为 YYYY-summary.md.enc。</p>
      </header>

      <section className="flex flex-wrap items-end gap-3">
        <label htmlFor="summary-year" className="text-sm font-medium text-slate-700">
          选择年份
        </label>
        <input
          id="summary-year"
          type="number"
          min={1970}
          max={9999}
          value={year}
          onChange={(event) => {
            const parsed = Number.parseInt(event.target.value, 10)
            if (Number.isFinite(parsed) && parsed >= 1970 && parsed <= 9999) {
              handleYearChange(parsed)
            }
          }}
          className="w-28 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 outline-none focus:border-brand-500"
        />
        <p className="text-xs text-slate-500">条目 ID：{summary.entryId}</p>
      </section>

      <StatusHint
        isLoading={summary.isLoading}
        isSaving={summary.isSaving}
        error={summary.error}
      />

      <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
        <button
          type="button"
          className="rounded-full border border-slate-300 px-4 py-1.5 text-sm transition hover:bg-slate-100"
          onClick={() => void sync.saveNow(syncPayload)}
        >
          手动保存并立即上传
        </button>
        <span>同步状态：{sync.status}</span>
        {sync.lastSyncedAt ? <span>最近同步：{sync.lastSyncedAt}</span> : null}
        {sync.errorMessage ? <span className="text-rose-600">{sync.errorMessage}</span> : null}
      </div>

      {!summary.isLoading ? (
        <MarkdownEditor
          key={summary.entryId}
          initialValue={summary.content}
          onChange={handleEditorChange}
          placeholder="写下年度总结（支持标题、列表、任务列表）"
        />
      ) : null}
    </article>
  )
}
