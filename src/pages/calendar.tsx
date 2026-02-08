import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import MonthCalendar from '../components/calendar/month-calendar'
import OnThisDayList from '../components/history/on-this-day-list'
import { DIARY_INDEX_TYPE, listDiariesByIndex, type DiaryRecord } from '../services/indexeddb'
import { formatDateKey } from '../utils/date'

function toMonthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function shiftMonth(month: Date, offset: number): Date {
  return new Date(month.getFullYear(), month.getMonth() + offset, 1)
}

export default function CalendarPage() {
  const navigate = useNavigate()
  const today = new Date()
  const [month, setMonth] = useState(() => toMonthStart(today))
  const [activeDateKey, setActiveDateKey] = useState(() => formatDateKey(today))
  const [diaries, setDiaries] = useState<DiaryRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true

    async function loadDailyDiaries(): Promise<void> {
      setIsLoading(true)
      setLoadError(null)

      try {
        const records = await listDiariesByIndex(DIARY_INDEX_TYPE, 'daily')
        if (!isMounted) {
          return
        }
        setDiaries(records.filter((record) => record.type === 'daily'))
      } catch (error) {
        if (!isMounted) {
          return
        }
        const message = error instanceof Error ? error.message : '未知错误'
        setLoadError(message)
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    void loadDailyDiaries()

    return () => {
      isMounted = false
    }
  }, [])

  const diaryDateSet = useMemo(() => {
    return new Set(diaries.map((record) => record.date))
  }, [diaries])

  const handlePreviousMonth = () => {
    setMonth((current) => shiftMonth(current, -1))
  }

  const handleNextMonth = () => {
    setMonth((current) => shiftMonth(current, 1))
  }

  const handleSelectDate = (dateKey: string) => {
    setActiveDateKey(dateKey)
    navigate(`/editor?date=${dateKey}`)
  }

  const handleHistoryDateChange = (dateKey: string) => {
    setActiveDateKey(dateKey)
    const nextDate = new Date(`${dateKey}T00:00:00`)
    if (!Number.isNaN(nextDate.getTime())) {
      setMonth(toMonthStart(nextDate))
    }
  }

  return (
    <article className="space-y-4" aria-label="calendar-page">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-3xl font-semibold text-ink-900 sm:text-4xl">日历页面</h2>
          <button
            type="button"
            className="rounded-full border border-slate-300 px-4 py-1.5 text-sm text-slate-700 transition hover:bg-slate-100"
            onClick={() => navigate(`/yearly-summary?year=${activeDateKey.slice(0, 4)}`)}
          >
            年度总结
          </button>
        </div>
        <p className="text-slate-600">按月浏览日期，点击任意一天可直接进入当日日记编辑。</p>
      </header>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <MonthCalendar
          month={month}
          activeDateKey={activeDateKey}
          diaryDateSet={diaryDateSet}
          onPreviousMonth={handlePreviousMonth}
          onNextMonth={handleNextMonth}
          onSelectDate={handleSelectDate}
        />

        <aside className="space-y-3 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm sm:p-5">
          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-ink-900">往年今日</h3>
            <p className="text-sm text-slate-500">查询同月同日历史记录，支持虚拟滚动。</p>
          </div>

          <label className="block space-y-1 text-sm text-slate-700" htmlFor="history-date">
            <span>查询日期</span>
            <input
              id="history-date"
              type="date"
              value={activeDateKey}
              onChange={(event) => handleHistoryDateChange(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-ink-900 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
          </label>

          <OnThisDayList
            targetDate={activeDateKey}
            diaries={diaries}
            isLoading={isLoading}
            loadError={loadError}
            onSelectDate={handleSelectDate}
          />
        </aside>
      </section>
    </article>
  )
}
