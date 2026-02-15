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

const DAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']
const HEATMAP_COLORS = ['#e8ece8', '#c9e6cf', '#9fd4ac', '#66bc7d', '#2f8f52'] as const
const CELL_SIZE = 11
const CELL_GAP = 3

function formatNumber(value: number): string {
  return numberFormatter.format(value)
}

function getCellDescription(cell: YearlyHeatmapCell): string {
  if (cell.wordCount <= 0) {
    return `${cell.dateKey} 无日记记录`
  }
  return `${cell.dateKey} ${formatNumber(cell.wordCount)} 字`
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

  const [selectedYearInput, setSelectedYearInput] = useState<number | null>(null)
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null)

  const selectedYear =
    selectedYearInput !== null && availableYears.includes(selectedYearInput)
      ? selectedYearInput
      : (availableYears[0] ?? new Date().getFullYear())

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
        <div className="flex max-w-full items-center gap-1 overflow-x-auto pb-1" aria-label="热力图年份切换">
          {availableYears.map((year) => {
            const isActive = year === selectedYear
            return (
              <button
                key={year}
                type="button"
                className={`rounded-full border px-2.5 py-1 text-xs transition ${
                  isActive
                    ? 'border-[#3f4742] bg-[#3f4742] text-white'
                    : 'border-td-line bg-td-surface text-td-muted hover:border-[#3f4742] hover:text-td-text'
                }`}
                onClick={() => {
                  setSelectedYearInput(year)
                  setSelectedDateKey(null)
                }}
                aria-pressed={isActive}
              >
                {year}
              </button>
            )
          })}
        </div>
      </header>

      <div className="grid gap-2 sm:grid-cols-3">
        <article className="rounded-[10px] border border-td-line bg-td-surface px-3 py-2">
          <p className="text-xs text-td-muted">活跃天数</p>
          <p className="mt-1 text-lg font-semibold text-td-text">{formatNumber(heatmapModel.activeDayCount)}</p>
        </article>
        <article className="rounded-[10px] border border-td-line bg-td-surface px-3 py-2">
          <p className="text-xs text-td-muted">年度总字数</p>
          <p className="mt-1 text-lg font-semibold text-td-text">{formatNumber(heatmapModel.totalWordCount)}</p>
        </article>
        <article className="rounded-[10px] border border-td-line bg-td-surface px-3 py-2">
          <p className="text-xs text-td-muted">单日峰值字数</p>
          <p className="mt-1 text-lg font-semibold text-td-text">{formatNumber(heatmapModel.maxWordCount)}</p>
        </article>
      </div>

      <div className="overflow-x-auto rounded-[12px] border border-td-line bg-td-surface p-3" data-testid="insights-yearly-heatmap-grid-frame">
        <div className="min-w-fit">
          <div className="mb-1 flex items-center gap-2">
            <span className="w-[14px] text-[10px] text-transparent">日</span>
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
            <div className="grid grid-rows-7 gap-[3px] text-[10px] leading-none text-td-muted">
              {DAY_LABELS.map((label, index) => (
                <span key={label} className="h-[11px] w-[14px] text-left">
                  {index % 2 === 0 ? label : ''}
                </span>
              ))}
            </div>

            <div className="grid grid-flow-col gap-[3px]" style={{ gridAutoColumns: `${CELL_SIZE}px` }}>
              {heatmapModel.weeks.map((week) => (
                <div key={week.index} className="grid grid-rows-7 gap-[3px]">
                  {week.days.map((cell, dayIndex) => {
                    if (!cell) {
                      return <span key={`${week.index}-${dayIndex}`} className="h-[11px] w-[11px] opacity-0" aria-hidden="true" />
                    }

                    const description = getCellDescription(cell)
                    const isSelected = selectedDateKey === cell.dateKey
                    return (
                      <button
                        key={cell.dateKey}
                        type="button"
                        className={`h-[11px] w-[11px] rounded-[2px] border transition ${
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

      <div className="flex flex-wrap items-center gap-2 text-xs text-td-muted" aria-label="热力图图例">
        <span>字数</span>
        {HEATMAP_COLORS.map((color, index) => (
          <span
            key={color}
            className="inline-block h-[10px] w-[18px] rounded-[2px] border border-black/5"
            style={{ backgroundColor: color }}
            aria-label={index === 0 ? '0 字' : `${index} 级强度`}
          />
        ))}
        <span>
          0 ~ {formatNumber(heatmapModel.maxWordCount)} 字
        </span>
      </div>

      <p className="text-xs text-td-muted" data-testid="insights-yearly-heatmap-selection" aria-live="polite">
        {selectedCell
          ? `${selectedCell.dateKey}：${selectedCell.wordCount > 0 ? `${formatNumber(selectedCell.wordCount)} 字` : '无日记记录'}`
          : '点击任意日期查看当天字数。'}
      </p>
    </section>
  )
}
