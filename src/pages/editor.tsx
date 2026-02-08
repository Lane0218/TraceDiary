import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import MarkdownEditor from '../components/editor/markdown-editor'
import { useDiary } from '../hooks/use-diary'
import { useSync } from '../hooks/use-sync'
import { formatDateKey } from '../utils/date'
import type { DateString } from '../types/diary'

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

export default function EditorPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const todayDate = useMemo(() => formatDateKey(new Date()) as DateString, [])
  const date = useMemo(() => {
    const queryDate = searchParams.get('date')
    if (queryDate && /^\d{4}-\d{2}-\d{2}$/.test(queryDate)) {
      return queryDate as DateString
    }
    return todayDate
  }, [searchParams, todayDate])
  const diary = useDiary({ type: 'daily', date })
  const sync = useSync<{
    type: 'daily'
    entryId: string
    date: DateString
    content: string
    modifiedAt: string
  }>()

  const syncPayload = useMemo(
    () => ({
      type: 'daily' as const,
      entryId: diary.entryId,
      date,
      content: diary.content,
      modifiedAt: diary.entry?.modifiedAt ?? new Date().toISOString(),
    }),
    [date, diary.content, diary.entry?.modifiedAt, diary.entryId],
  )

  const handleDateChange = (nextDate: DateString) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('date', nextDate)
      return next
    })
  }

  const handleEditorChange = (nextContent: string) => {
    diary.setContent(nextContent)
    sync.onInputChange({
      ...syncPayload,
      content: nextContent,
      modifiedAt: new Date().toISOString(),
    })
  }

  return (
    <article className="space-y-4" aria-label="editor-page">
      <header className="space-y-2">
        <h2 className="text-3xl font-semibold text-ink-900 sm:text-4xl">编辑页面</h2>
        <p className="text-slate-600">按日期管理日记，输入后会实时写入 IndexedDB。</p>
      </header>

      <section className="flex flex-wrap items-end gap-3">
        <label htmlFor="diary-date" className="text-sm font-medium text-slate-700">
          选择日期
        </label>
        <input
          id="diary-date"
          type="date"
          value={date}
          onChange={(event) => {
            if (event.target.value) {
              handleDateChange(event.target.value as DateString)
            }
          }}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 outline-none focus:border-brand-500"
        />
        <p className="text-xs text-slate-500">条目 ID：{diary.entryId}</p>
      </section>

      <StatusHint isLoading={diary.isLoading} isSaving={diary.isSaving} error={diary.error} />

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

      {!diary.isLoading ? (
        <MarkdownEditor
          key={diary.entryId}
          initialValue={diary.content}
          onChange={handleEditorChange}
          placeholder="写下今天的记录（支持标题、列表、任务列表）"
        />
      ) : null}
    </article>
  )
}
