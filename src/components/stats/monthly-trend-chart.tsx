import type { MonthlyTrendPoint } from '../../types/stats'

interface MonthlyTrendChartProps {
  items: MonthlyTrendPoint[]
  isLoading?: boolean
  showLegend?: boolean
}

const numberFormatter = new Intl.NumberFormat('zh-CN')
const percentFormatter = new Intl.NumberFormat('zh-CN', {
  style: 'percent',
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
})

const CHART_WIDTH = 920
const CHART_HEIGHT = 320
const CHART_MARGIN = {
  top: 20,
  right: 56,
  bottom: 46,
  left: 56,
}

function formatNumber(value: number): string {
  return numberFormatter.format(value)
}

function formatMonthLabel(label: string): string {
  const [, month] = label.split('-')
  return month ? `${month}月` : label
}

function formatMomLabel(ratio: number | null): string {
  if (ratio === null) {
    return '环比 —'
  }
  const sign = ratio > 0 ? '+' : ''
  return `环比 ${sign}${percentFormatter.format(ratio)}`
}

export default function MonthlyTrendChart({ items, isLoading = false, showLegend = true }: MonthlyTrendChartProps) {
  if (isLoading) {
    return (
      <div className="rounded-[12px] border border-dashed border-td-line bg-td-surface p-5 text-sm text-td-muted">
        正在渲染月度趋势图...
      </div>
    )
  }

  const hasData = items.some((item) => item.totalWordCount > 0 || item.entryCount > 0)
  if (!hasData) {
    return (
      <div className="rounded-[12px] border border-dashed border-td-line bg-td-surface p-5 text-sm text-td-muted">
        最近 12 个月暂无写作数据。
      </div>
    )
  }

  const plotWidth = CHART_WIDTH - CHART_MARGIN.left - CHART_MARGIN.right
  const plotHeight = CHART_HEIGHT - CHART_MARGIN.top - CHART_MARGIN.bottom
  const wordMax = Math.max(1, ...items.map((item) => item.totalWordCount))
  const entryMax = Math.max(1, ...items.map((item) => item.entryCount))
  const step = items.length > 1 ? plotWidth / (items.length - 1) : 0
  const barWidth = items.length > 1 ? Math.max(14, Math.min(34, step * 0.5)) : 28

  const chartPoints = items.map((item, index) => {
    const x = CHART_MARGIN.left + (items.length > 1 ? index * step : plotWidth / 2)
    const barHeight = Math.round((item.totalWordCount / wordMax) * plotHeight)
    const barY = CHART_MARGIN.top + plotHeight - barHeight
    const lineY = CHART_MARGIN.top + plotHeight - Math.round((item.entryCount / entryMax) * plotHeight)

    return {
      ...item,
      x,
      barY,
      barHeight,
      lineY,
    }
  })

  const linePath = chartPoints
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.lineY}`)
    .join(' ')

  const yTicks = [0, 0.25, 0.5, 0.75, 1]

  return (
    <div className={showLegend ? 'space-y-3' : undefined} data-testid="insights-monthly-chart" aria-label="月度趋势图">
      {showLegend ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-td-muted" aria-label="月度趋势图例">
          <span className="inline-flex items-center gap-1 rounded-full border border-td-line bg-td-surface px-2 py-1">
            <i className="inline-block h-2 w-2 rounded-[2px] bg-[#4f46e5]" aria-hidden="true" />
            字数柱
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-td-line bg-td-surface px-2 py-1">
            <i className="inline-block h-[2px] w-3 bg-[#0f766e]" aria-hidden="true" />
            篇数线
          </span>
        </div>
      ) : null}

      <div className="rounded-[12px] border border-td-line bg-td-surface" data-testid="insights-monthly-chart-frame">
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          className="block h-auto w-full"
          role="img"
          aria-label="近12个月字数与篇数趋势图"
        >
          {yTicks.map((tick) => {
            const y = CHART_MARGIN.top + plotHeight - tick * plotHeight
            const wordValue = Math.round(wordMax * tick)
            const entryValue = Math.round(entryMax * tick)

            return (
              <g key={tick}>
                <line
                  x1={CHART_MARGIN.left}
                  y1={y}
                  x2={CHART_MARGIN.left + plotWidth}
                  y2={y}
                  stroke="rgba(17,17,17,0.12)"
                  strokeDasharray="3 4"
                />
                <text x={CHART_MARGIN.left - 8} y={y + 4} textAnchor="end" fontSize="11" fill="#666666">
                  {formatNumber(wordValue)}
                </text>
                <text x={CHART_MARGIN.left + plotWidth + 8} y={y + 4} fontSize="11" fill="#666666">
                  {formatNumber(entryValue)}
                </text>
              </g>
            )
          })}

          {chartPoints.map((point) => (
            <g key={point.label}>
              <rect
                x={point.x - barWidth / 2}
                y={point.barY}
                width={barWidth}
                height={point.barHeight}
                rx={6}
                fill="#4f46e5"
                fillOpacity={0.88}
              >
                <title>
                  {point.label} 字数 {formatNumber(point.totalWordCount)}，篇数 {formatNumber(point.entryCount)}，
                  {formatMomLabel(point.momWordDeltaRatio)}
                </title>
              </rect>

              <text x={point.x} y={CHART_MARGIN.top + plotHeight + 20} textAnchor="middle" fontSize="11" fill="#666666">
                {formatMonthLabel(point.label)}
              </text>
            </g>
          ))}

          <path d={linePath} fill="none" stroke="#0f766e" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />

          {chartPoints.map((point) => (
            <circle key={`${point.label}-point`} cx={point.x} cy={point.lineY} r={4} fill="#0f766e" stroke="#ffffff" strokeWidth={2}>
              <title>
                {point.label} 篇数 {formatNumber(point.entryCount)}，字数 {formatNumber(point.totalWordCount)}
              </title>
            </circle>
          ))}
        </svg>
      </div>
    </div>
  )
}
