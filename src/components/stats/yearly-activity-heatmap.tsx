import { useMemo, useState } from 'react'
import type { DiaryRecord } from '../../services/indexeddb'
import type { YearlyStatsItem } from '../../types/stats'
import {
  buildHeatmapAvailableYears,
  buildYearlyHeatmapModel,
  type YearlyHeatmapCell,
} from '../../utils/stats-heatmap'

interface YearlyActivityHeatmapProps {
  records: DiaryRecord[]
  yearlyItems: YearlyStatsItem[]
  isLoading?: boolean
}

const numberFormatter = new Intl.NumberFormat('zh-CN')

const DAY_LABELS = ['一', '二', '三', '四', '五', '六', '日']
const HEATMAP_COLORS = ['#e8ece8', '#c9e6cf', '#9fd4ac', '#66bc7d', '#2f8f52'] as const
const CELL_SIZE = 13
const CELL_GAP = 3
const MIN_YEAR = 1970
const MAX_YEAR = 9999

function formatNumber(value: number): string {
  return numberFormatter.format(value)
}

function parseValidYearInput(value: string): number | null {
  if (value.length === 0) {
    return null
  }

  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < MIN_YEAR || parsed > MAX_YEAR) {
    return null
  }

  return parsed
}

function getCellDescription(cell: YearlyHeatmapCell): string {
  if (cell.wordCount <= 0) {
    return `${cell.dateKey} 无日记记录`
  }
  return `${cell.dateKey} ${formatNumber(cell.wordCount)} 字`
}

function getDefaultYear(years: number[]): number {
  return years[0] ?? new Date().getFullYear()
}

export default function YearlyActivityHeatmap({
  records,
  yearlyItems,
  isLoading = false,
}: YearlyActivityHeatmapProps) {
  const availableYears = useMemo(
    () => buildHeatmapAvailableYears(records, yearlyItems),
    [records, yearlyItems],
  )

  const [selectedYear, setSelectedYear] = useState(() => getDefaultYear(availableYears))
  const [yearInput, setYearInput] = useState(() => String(getDefaultYear(availableYears)))
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null)

  const heatmapModel = useMemo(() => buildYearlyHeatmapModel(records, selectedYear), [records, selectedYear])

  const cellsByDate = useMemo(() => {
    const map = new Map<string, YearlyHeatmapCell>()
    for (const week of heatmapModel.weeks) {
      for (const day of week.days) {
        if (day) {
          map.set(day.dateKey, day)
        }
      }
    }
    return map
  }, [heatmapModel.weeks])

  const selectedCell = selectedDateKey ? cellsByDate.get(selectedDateKey) ?? null : null
  const heatmapWidth = heatmapModel.weekCount * CELL_SIZE + Math.max(0, heatmapModel.weekCount - 1) * CELL_GAP

  const handleYearChange = (nextYear: number) => {
    if (!Number.isFinite(nextYear) || nextYear < MIN_YEAR || nextYear > MAX_YEAR) {
      return
    }

    setSelectedYear(nextYear)
    setYearInput(String(nextYear))
    setSelectedDateKey(null)
  }

  if (isLoading) {
    return (
      <div className="rounded-[12px] border border-dashed border-td-line bg-td-surface p-4 text-sm text-td-muted">
        正在加载年度热力图...
      </div>
    )
  }

  return (
    <section className="space-y-3" data-testid="insights-yearly-heatmap" aria-label="年度热力图">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-base font-semibold text-td-text">年度热力图</h4>

        <div
          className="inline-flex h-9 items-center overflow-hidden rounded-[8px] border border-[#d6d6d6] bg-white"
          aria-label="热力图年份切换"
        >
          <button
            type="button"
            aria-label="热力图年份减一"
            disabled={selectedYear <= MIN_YEAR}
            className="h-full w-8 text-sm text-td-muted transition hover:bg-[#f5f5f5] hover:text-td-text disabled:cursor-not-allowed disabled:text-[#c5c5c5] disabled:hover:bg-white"
            onClick={() => handleYearChange(selectedYear - 1)}
          >
            &#8249;
          </button>

          <input
            id="insights-heatmap-year"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            aria-label="热力图年份"
            value={yearInput}
            onChange={(event) => {
              const sanitized = event.target.value.replace(/\D+/g, '').slice(0, 4)
              setYearInput(sanitized)
              const parsed = parseValidYearInput(sanitized)
              if (parsed !== null) {
                handleYearChange(parsed)
              }
            }}
            onBlur={() => {
              const parsed = parseValidYearInput(yearInput)
              if (parsed === null) {
                setYearInput(String(selectedYear))
                return
              }
              setYearInput(String(parsed))
            }}
            className="h-full w-[90px] border-x border-[#e1e1e1] bg-white px-1.5 text-center text-[15px] font-semibold text-td-text outline-none"
          />

          <button
            type="button"
            aria-label="热力图年份加一"
            disabled={selectedYear >= MAX_YEAR}
            className="h-full w-8 text-sm text-td-muted transition hover:bg-[#f5f5f5] hover:text-td-text disabled:cursor-not-allowed disabled:text-[#c5c5c5] disabled:hover:bg-white"
            onClick={() => handleYearChange(selectedYear + 1)}
          >
            &#8250;
          </button>
        </div>
      </header>

      <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_272px] xl:items-stretch">
        <div className="space-y-2 xl:min-w-0" data-testid="insights-yearly-heatmap-main-panel">
          <div
            className="w-full max-w-full overflow-x-auto rounded-[12px] border border-td-line bg-td-surface p-3 md:p-4"
            data-testid="insights-yearly-heatmap-grid-frame"
          >
            <div className="min-w-fit">
              <div className="mb-2 flex items-center gap-2">
                <span className="w-[16px] text-[10px] text-transparent">一</span>
                <div className="relative h-4" style={{ width: `${heatmapWidth}px` }}>
                  {heatmapModel.monthTicks.map((tick) => (
                    <span
                      key={tick.month}
                      className="absolute top-0 text-[10px] text-td-muted"
                      style={{ left: `${tick.weekIndex * (CELL_SIZE + CELL_GAP)}px` }}
                    >
                      {tick.label}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <div
                  className="grid grid-rows-7 gap-[3px] text-[10px] leading-none text-td-muted"
                  data-testid="insights-yearly-heatmap-weekday-axis"
                >
                  {DAY_LABELS.map((label, index) => (
                    <span key={label} className="h-[12px] w-[16px] text-left">
                      {index % 2 === 0 ? label : ''}
                    </span>
                  ))}
                </div>

                <div className="grid grid-flow-col gap-[3px]" style={{ gridAutoColumns: `${CELL_SIZE}px` }}>
                  {heatmapModel.weeks.map((week) => (
                    <div key={week.index} className="grid grid-rows-7 gap-[3px]">
                      {week.days.map((cell, dayIndex) => {
                        if (!cell) {
                          return (
                            <span
                              key={`${week.index}-${dayIndex}`}
                              className="h-[12px] w-[12px] opacity-0"
                              aria-hidden="true"
                            />
                          )
                        }

                        const description = getCellDescription(cell)
                        const isSelected = selectedDateKey === cell.dateKey
                        return (
                          <button
                            key={cell.dateKey}
                            type="button"
                            className={`h-[12px] w-[12px] rounded-[3px] border transition ${
                              isSelected
                                ? 'border-[#111111] shadow-[0_0_0_1px_rgba(17,17,17,0.12)]'
                                : 'border-transparent hover:border-[#111111]/45'
                            }`}
                            style={{ backgroundColor: HEATMAP_COLORS[cell.intensity] }}
                            title={description}
                            aria-label={description}
                            onClick={() => setSelectedDateKey(cell.dateKey)}
                          />
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div
            className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-center"
            data-testid="insights-yearly-heatmap-bottom-row"
          >
            <article className="rounded-[10px] border border-td-line bg-td-surface px-3 py-2">
              <p className="text-xs text-td-muted">字数图例</p>
              <div className="mt-1 flex flex-wrap items-center gap-2" aria-label="热力图图例">
                {HEATMAP_COLORS.map((color, index) => (
                  <span
                    key={color}
                    className="inline-block h-[10px] w-[20px] rounded-[2px] border border-black/5"
                    style={{ backgroundColor: color }}
                    aria-label={index === 0 ? '0 字' : `${index} 级强度`}
                  />
                ))}
                <span className="text-sm text-td-muted">0 ~ {formatNumber(heatmapModel.maxWordCount)} 字</span>
              </div>
            </article>

            <article className="rounded-[10px] border border-td-line bg-td-surface px-3 py-2">
              <p className="text-xs text-td-muted">选中日期</p>
              <p className="mt-1 text-sm text-td-text" data-testid="insights-yearly-heatmap-selection" aria-live="polite">
                {selectedCell
                  ? `${selectedCell.dateKey} / ${selectedCell.wordCount > 0 ? `${formatNumber(selectedCell.wordCount)} 字` : '无日记记录'}`
                  : '点击左侧日期查看当天字数。'}
              </p>
            </article>
          </div>
        </div>

        <aside className="grid content-start gap-2 xl:h-full xl:grid-rows-3" data-testid="insights-yearly-heatmap-side-panel">
          <article
            className="rounded-[10px] border border-td-line bg-td-surface px-3 py-2 xl:flex xl:h-full xl:flex-col xl:justify-center"
            data-testid="insights-yearly-heatmap-metric-active-days"
          >
            <p className="text-xs text-td-muted">活跃天数</p>
            <p className="mt-1 text-lg font-semibold text-td-text">{formatNumber(heatmapModel.activeDayCount)}</p>
          </article>
          <article className="rounded-[10px] border border-td-line bg-td-surface px-3 py-2 xl:flex xl:h-full xl:flex-col xl:justify-center">
            <p className="text-xs text-td-muted">年度总字数</p>
            <p className="mt-1 text-lg font-semibold text-td-text">{formatNumber(heatmapModel.totalWordCount)}</p>
          </article>
          <article
            className="rounded-[10px] border border-td-line bg-td-surface px-3 py-2 xl:flex xl:h-full xl:flex-col xl:justify-center"
            data-testid="insights-yearly-heatmap-metric-peak-word"
          >
            <p className="text-xs text-td-muted">单日峰值字数</p>
            <p className="mt-1 text-lg font-semibold text-td-text">{formatNumber(heatmapModel.maxWordCount)}</p>
          </article>
        </aside>
      </div>
    </section>
  )
}
