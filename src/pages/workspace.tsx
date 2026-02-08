import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import AuthModal from '../components/auth/auth-modal'
import MonthCalendar from '../components/calendar/month-calendar'
import MarkdownEditor from '../components/editor/markdown-editor'
import OnThisDayList from '../components/history/on-this-day-list'
import type { UseAuthResult } from '../hooks/use-auth'
import { useDiary } from '../hooks/use-diary'
import { useSync } from '../hooks/use-sync'
import { DIARY_INDEX_TYPE, listDiariesByIndex, type DiaryRecord } from '../services/indexeddb'
import type { DateString } from '../types/diary'
import { formatDateKey } from '../utils/date'

type WorkspaceMode = 'daily' | 'yearly'

interface WorkspacePageProps {
  auth: UseAuthResult
}

function isValidDateString(value: string | null): value is DateString {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value))
}

function toMonthStartFromDateKey(dateKey: DateString): Date {
  const date = new Date(`${dateKey}T00:00:00`)
  if (Number.isNaN(date.getTime())) {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  }
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function shiftMonth(month: Date, offset: number): Date {
  return new Date(month.getFullYear(), month.getMonth() + offset, 1)
}

function countWords(content: string): number {
  return content.trim().length === 0 ? 0 : content.trim().split(/\s+/u).length
}

function upsertDailyRecord(records: DiaryRecord[], date: DateString, content: string): DiaryRecord[] {
  const id = `daily:${date}`
  const now = new Date().toISOString()
  const nextRecord: DiaryRecord = {
    id,
    type: 'daily',
    date,
    content,
    wordCount: countWords(content),
    createdAt: now,
    modifiedAt: now,
  }

  const index = records.findIndex((record) => record.id === id)
  if (index === -1) {
    return [nextRecord, ...records]
  }

  const prev = records[index]
  const merged: DiaryRecord = {
    ...prev,
    ...nextRecord,
    createdAt: typeof prev.createdAt === 'string' ? prev.createdAt : now,
  }

  return records.map((record, recordIndex) => (recordIndex === index ? merged : record))
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
    return <span className="td-status td-status-muted">加载中...</span>
  }

  if (error) {
    return <span className="td-status td-status-danger">{error}</span>
  }

  if (isSaving) {
    return <span className="td-status td-status-warning">保存中...</span>
  }

  return <span className="td-status td-status-success">已保存到本地</span>
}

export default function WorkspacePage({ auth }: WorkspacePageProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [monthOffset, setMonthOffset] = useState(0)
  const [manualAuthModalOpen, setManualAuthModalOpen] = useState(false)
  const [diaries, setDiaries] = useState<DiaryRecord[]>([])
  const [isLoadingDiaries, setIsLoadingDiaries] = useState(true)
  const [diaryLoadError, setDiaryLoadError] = useState<string | null>(null)

  const today = useMemo(() => formatDateKey(new Date()) as DateString, [])
  const mode: WorkspaceMode = searchParams.get('mode') === 'yearly' ? 'yearly' : 'daily'
  const date = useMemo(() => {
    const queryDate = searchParams.get('date')
    return isValidDateString(queryDate) ? queryDate : today
  }, [searchParams, today])
  const year = useMemo(() => {
    const queryYear = Number.parseInt(searchParams.get('year') ?? '', 10)
    if (Number.isFinite(queryYear) && queryYear >= 1970 && queryYear <= 9999) {
      return queryYear
    }
    return Number.parseInt(date.slice(0, 4), 10)
  }, [date, searchParams])

  const baseMonth = useMemo(() => toMonthStartFromDateKey(date), [date])
  const month = useMemo(() => shiftMonth(baseMonth, monthOffset), [baseMonth, monthOffset])

  const diary = useDiary(
    mode === 'daily'
      ? { type: 'daily', date }
      : {
          type: 'yearly_summary',
          year,
        },
  )
  const sync = useSync<
    | {
        type: 'daily'
        entryId: string
        date: DateString
        content: string
        modifiedAt: string
      }
    | {
        type: 'yearly_summary'
        entryId: string
        year: number
        content: string
        modifiedAt: string
      }
  >()

  const diaryDateSet = useMemo(() => {
    return new Set(diaries.filter((record) => record.type === 'daily').map((record) => record.date))
  }, [diaries])

  const forceOpenAuthModal = auth.state.stage !== 'ready'
  const authModalOpen = forceOpenAuthModal || manualAuthModalOpen

  useEffect(() => {
    let mounted = true

    async function loadDailyDiaries(): Promise<void> {
      setIsLoadingDiaries(true)
      setDiaryLoadError(null)

      try {
        const records = await listDiariesByIndex(DIARY_INDEX_TYPE, 'daily')
        if (!mounted) {
          return
        }
        setDiaries(records.filter((record) => record.type === 'daily'))
      } catch (error) {
        if (!mounted) {
          return
        }
        setDiaryLoadError(error instanceof Error ? error.message : '未知错误')
      } finally {
        if (mounted) {
          setIsLoadingDiaries(false)
        }
      }
    }

    void loadDailyDiaries()

    return () => {
      mounted = false
    }
  }, [])

  const patchSearch = useCallback(
    (patcher: (next: URLSearchParams) => void) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        patcher(next)
        return next
      })
    },
    [setSearchParams],
  )

  const handleDateChange = useCallback(
    (nextDate: DateString) => {
      patchSearch((next) => {
        next.set('date', nextDate)
      })
      setMonthOffset(0)
    },
    [patchSearch],
  )

  const handleModeSwitch = useCallback(
    (nextMode: WorkspaceMode) => {
      patchSearch((next) => {
        next.set('mode', nextMode)
        if (nextMode === 'yearly') {
          next.set('year', String(year))
        } else {
          next.delete('year')
        }
      })
    },
    [patchSearch, year],
  )

  const handleYearChange = useCallback(
    (nextYear: number) => {
      patchSearch((next) => {
        next.set('year', String(nextYear))
      })
    },
    [patchSearch],
  )

  const handleSelectDate = useCallback(
    (dateKey: string) => {
      if (!isValidDateString(dateKey)) {
        return
      }
      handleDateChange(dateKey)
    },
    [handleDateChange],
  )

  const handleEditorChange = (nextContent: string) => {
    diary.setContent(nextContent)

    const modifiedAt = new Date().toISOString()
    if (mode === 'daily') {
      sync.onInputChange({
        type: 'daily',
        entryId: diary.entryId,
        date,
        content: nextContent,
        modifiedAt,
      })
      setDiaries((prev) => upsertDailyRecord(prev, date, nextContent))
      return
    }

    sync.onInputChange({
      type: 'yearly_summary',
      entryId: diary.entryId,
      year,
      content: nextContent,
      modifiedAt,
    })
  }

  const saveNow = () => {
    const modifiedAt = diary.entry?.modifiedAt ?? new Date().toISOString()
    if (mode === 'daily') {
      void sync.saveNow({
        type: 'daily',
        entryId: diary.entryId,
        date,
        content: diary.content,
        modifiedAt,
      })
      return
    }

    void sync.saveNow({
      type: 'yearly_summary',
      entryId: diary.entryId,
      year,
      content: diary.content,
      modifiedAt,
    })
  }

  const sessionLabel = useMemo(() => {
    if (auth.state.stage === 'ready') {
      return '会话：已解锁'
    }
    if (auth.state.stage === 'checking') {
      return '会话：认证处理中'
    }
    return '会话：待认证'
  }, [auth.state.stage])

  return (
    <>
      <main className="mx-auto min-h-screen w-full max-w-6xl px-4 pb-8 sm:px-6">
        <header className="sticky top-0 z-10 flex min-h-[68px] flex-wrap items-center justify-between gap-3 border-b border-td-line bg-td-bg/95 py-3 backdrop-blur-sm">
          <h1 className="font-display text-2xl text-td-text">TraceDiary</h1>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-td-line bg-td-surface px-3 py-1 text-xs text-td-muted">{sessionLabel}</span>
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

        <section className="py-5">
          <h2 className="font-display text-3xl text-td-text">日记工作台</h2>
          <p className="mt-2 max-w-3xl text-sm text-td-muted">
            风格与 blog 保持同源：米白底、细线边框与克制动效。左侧管理日期与历史，右侧同屏切换“日记/年度总结”。
          </p>
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(280px,1fr)_minmax(0,1.8fr)]" aria-label="workspace-layout">
          <aside className="td-card td-panel space-y-3">
            <MonthCalendar
              month={month}
              activeDateKey={date}
              diaryDateSet={diaryDateSet}
              onPreviousMonth={() => setMonthOffset((prev) => prev - 1)}
              onNextMonth={() => setMonthOffset((prev) => prev + 1)}
              onSelectDate={handleSelectDate}
            />

            <div className="space-y-2 rounded-[10px] border border-td-line bg-td-surface-soft p-3">
              <label htmlFor="history-date" className="text-sm text-td-muted">
                查询日期
              </label>
              <input
                id="history-date"
                type="date"
                value={date}
                onChange={(event) => {
                  if (isValidDateString(event.target.value)) {
                    handleDateChange(event.target.value)
                  }
                }}
                className="td-input"
              />
              <OnThisDayList
                targetDate={date}
                diaries={diaries}
                isLoading={isLoadingDiaries}
                loadError={diaryLoadError}
                onSelectDate={handleSelectDate}
              />
            </div>
          </aside>

          <section className="space-y-3">
            <div className="td-card td-panel flex flex-wrap items-center gap-2">
              <label htmlFor="workspace-date" className="text-xs text-td-muted">
                当前日期
              </label>
              <input
                id="workspace-date"
                type="date"
                value={date}
                onChange={(event) => {
                  if (isValidDateString(event.target.value)) {
                    handleDateChange(event.target.value)
                  }
                }}
                className="td-input w-auto min-w-[180px]"
              />

              <div className="inline-flex overflow-hidden rounded-[10px] border border-td-line">
                <button
                  type="button"
                  className={`px-3 py-2 text-sm transition ${mode === 'daily' ? 'bg-td-text text-white' : 'bg-td-surface text-td-muted hover:bg-td-soft'}`}
                  onClick={() => handleModeSwitch('daily')}
                >
                  日记
                </button>
                <button
                  type="button"
                  className={`px-3 py-2 text-sm transition ${mode === 'yearly' ? 'bg-td-text text-white' : 'bg-td-surface text-td-muted hover:bg-td-soft'}`}
                  onClick={() => handleModeSwitch('yearly')}
                >
                  年度总结
                </button>
              </div>

              {mode === 'yearly' ? (
                <>
                  <label htmlFor="workspace-year" className="text-xs text-td-muted">
                    年份
                  </label>
                  <input
                    id="workspace-year"
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
                    className="td-input w-24"
                  />
                </>
              ) : null}

              <StatusHint isLoading={diary.isLoading} isSaving={diary.isSaving} error={diary.error} />
              <button type="button" className="td-btn ml-auto" onClick={saveNow}>
                手动保存并立即上传
              </button>
              <span className="text-xs text-td-muted">同步：{sync.status}</span>
            </div>

            <article className="td-card td-panel">
              <h3 className="font-display text-xl text-td-text">
                {mode === 'daily' ? `${date} 日记` : `${year} 年度总结`}
              </h3>
              <p className="mt-1 text-xs text-td-muted">条目 ID：{diary.entryId}</p>
              <div className="mt-3">
                {!diary.isLoading ? (
                  <MarkdownEditor
                    key={diary.entryId}
                    initialValue={diary.content}
                    onChange={handleEditorChange}
                    placeholder={mode === 'daily' ? '写下今天的记录（支持 Markdown）' : '写下本年度总结（支持 Markdown）'}
                  />
                ) : null}
              </div>
            </article>
          </section>
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
