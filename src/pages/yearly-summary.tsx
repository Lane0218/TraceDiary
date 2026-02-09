import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import AuthModal from '../components/auth/auth-modal'
import MarkdownEditor from '../components/editor/markdown-editor'
import type { UseAuthResult } from '../hooks/use-auth'
import { useDiary } from '../hooks/use-diary'
import { useSync } from '../hooks/use-sync'

interface YearlySummaryPageProps {
  auth: UseAuthResult
}

function normalizeYear(yearParam: string | undefined, fallbackYear: number): number {
  const parsed = Number.parseInt(yearParam ?? '', 10)
  if (Number.isFinite(parsed) && parsed >= 1970 && parsed <= 9999) {
    return parsed
  }
  return fallbackYear
}

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
    return <span className="td-status-pill td-status-muted">加载中</span>
  }

  if (error) {
    return <span className="td-status-pill td-status-danger">本地保存异常</span>
  }

  if (isSaving) {
    return <span className="td-status-pill td-status-warning">保存中</span>
  }

  return <span className="td-status-pill td-status-success">本地已保存</span>
}

export default function YearlySummaryPage({ auth }: YearlySummaryPageProps) {
  const navigate = useNavigate()
  const params = useParams<{ year?: string }>()
  const [manualAuthModalOpen, setManualAuthModalOpen] = useState(false)

  const currentYear = useMemo(() => new Date().getFullYear(), [])
  const year = useMemo(() => normalizeYear(params.year, currentYear), [currentYear, params.year])

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

  const forceOpenAuthModal = auth.state.stage !== 'ready'
  const authModalOpen = forceOpenAuthModal || manualAuthModalOpen

  const sessionLabel = useMemo(() => {
    if (auth.state.stage === 'ready') {
      return '会话：已解锁'
    }
    if (auth.state.stage === 'checking') {
      return '会话：认证处理中'
    }
    return '会话：待认证'
  }, [auth.state.stage])

  const syncLabel = useMemo(() => {
    if (sync.status === 'syncing') {
      return '云端同步中'
    }
    if (sync.status === 'success') {
      return '云端已同步'
    }
    if (sync.status === 'error') {
      return '云端同步失败'
    }
    return '云端待同步'
  }, [sync.status])

  const syncToneClass = useMemo(() => {
    if (sync.status === 'syncing') {
      return 'td-status-warning'
    }
    if (sync.status === 'success') {
      return 'td-status-success'
    }
    if (sync.status === 'error') {
      return 'td-status-danger'
    }
    return 'td-status-muted'
  }, [sync.status])

  const handleYearChange = (nextYear: number) => {
    if (!Number.isFinite(nextYear) || nextYear < 1970 || nextYear > 9999) {
      return
    }
    navigate(`/yearly/${nextYear}`)
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
    <>
      <main className="mx-auto min-h-screen w-full max-w-7xl px-4 pb-8 sm:px-6">
        <header className="sticky top-0 z-10 flex min-h-[68px] flex-wrap items-center justify-between gap-3 border-b border-td-line bg-td-bg/95 py-3 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl text-td-text">TraceDiary</h1>
            <span className="rounded-full border border-td-line bg-td-surface px-3 py-1 text-xs text-td-muted">{sessionLabel}</span>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="td-btn" onClick={() => navigate('/workspace')}>
              返回日记工作台
            </button>
            <button
              type="button"
              className="td-btn"
              onClick={() => {
                setManualAuthModalOpen(true)
              }}
            >
              解锁/配置
            </button>
            {auth.state.stage === 'ready' ? (
              <button
                type="button"
                className="td-btn"
                onClick={() => {
                  auth.lockNow()
                }}
              >
                锁定
              </button>
            ) : null}
          </div>
        </header>

        <section className="mt-4 space-y-3 td-fade-in" aria-label="yearly-summary-page">
          <article className="td-card-primary td-panel space-y-4">
            <header className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-2xl text-td-text sm:text-3xl">{year} 年度总结</h2>
                <button
                  type="button"
                  className="td-btn"
                  onClick={() => handleYearChange(year - 1)}
                  aria-label="上一年"
                >
                  上一年
                </button>
                <button
                  type="button"
                  className="td-btn"
                  onClick={() => handleYearChange(year + 1)}
                  aria-label="下一年"
                >
                  下一年
                </button>
                <label htmlFor="summary-year" className="text-xs text-td-muted">
                  跳转年份
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
                  className="td-input w-28"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <StatusHint isLoading={summary.isLoading} isSaving={summary.isSaving} error={summary.error} />
                <span className={`td-status-pill ${syncToneClass}`}>{syncLabel}</span>
                {sync.lastSyncedAt ? (
                  <span className="rounded-full border border-td-line bg-td-surface px-2.5 py-1 text-xs text-td-muted">
                    最近同步：{sync.lastSyncedAt}
                  </span>
                ) : null}
                <button type="button" className="td-btn ml-auto" onClick={() => void sync.saveNow(syncPayload)}>
                  手动保存并立即上传
                </button>
              </div>

              {sync.errorMessage ? (
                <p className="text-sm text-td-danger" role="alert">
                  {sync.errorMessage}
                </p>
              ) : null}
            </header>

            {!summary.isLoading ? (
              <MarkdownEditor
                key={summary.entryId}
                initialValue={summary.content}
                onChange={handleEditorChange}
                placeholder="写下本年度总结（长文写作场景，支持 Markdown）"
              />
            ) : null}
          </article>
        </section>
      </main>

      <AuthModal
        auth={auth}
        open={authModalOpen}
        canClose={!forceOpenAuthModal}
        onClose={() => {
          setManualAuthModalOpen(false)
        }}
      />
    </>
  )
}
