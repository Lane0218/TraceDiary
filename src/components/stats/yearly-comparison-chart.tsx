import type { YearlyTrendPoint } from '../../types/stats'

interface YearlyComparisonChartProps {
  items: YearlyTrendPoint[]
  isLoading?: boolean
}

const numberFormatter = new Intl.NumberFormat('zh-CN')

const CHART_WIDTH = 760
const CHART_HEIGHT = 300
const CHART_MARGIN = {
  top: 18,
  right: 52,
  bottom: 44,
  left: 52,
}

function formatNumber(value: number): string {
  return numberFormatter.format(value)
}

export default function YearlyComparisonChart({ items, isLoading = false }: YearlyComparisonChartProps) {
  if (isLoading) {
    return (
      <div className="rounded-[12px] border border-dashed border-td-line bg-td-surface p-5 text-sm text-td-muted">
        正在渲染年度对比图...
      </div>
    )
  }

  const hasData = items.some((item) => item.totalWordCount > 0 || item.activeDayCount > 0)
  if (!hasData) {
    return (
      <div className="rounded-[12px] border border-dashed border-td-line bg-td-surface p-5 text-sm text-td-muted">
        暂无可展示的年度统计。
      </div>
    )
  }

  const plotWidth = CHART_WIDTH - CHART_MARGIN.left - CHART_MARGIN.right
  const plotHeight = CHART_HEIGHT - CHART_MARGIN.top - CHART_MARGIN.bottom
  const wordMax = Math.max(1, ...items.map((item) => item.totalWordCount))
  const activeMax = Math.max(1, ...items.map((item) => item.activeDayCount))
  const step = items.length > 1 ? plotWidth / (items.length - 1) : 0
  const barWidth = items.length > 1 ? Math.max(24, Math.min(56, step * 0.55)) : 56

  const chartPoints = items.map((item, index) => {
    const x = CHART_MARGIN.left + (items.length > 1 ? index * step : plotWidth / 2)
    const barHeight = Math.round((item.totalWordCount / wordMax) * plotHeight)
    const barY = CHART_MARGIN.top + plotHeight - barHeight
    const activeY = CHART_MARGIN.top + plotHeight - Math.round((item.activeDayCount / activeMax) * plotHeight)

    return {
      ...item,
      x,
      barY,
      barHeight,
      activeY,
    }
  })

  const activePath = chartPoints
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.activeY}`)
    .join(' ')

  const yTicks = [0, 0.25, 0.5, 0.75, 1]

  return (
    <div className="space-y-3" data-testid="insights-yearly-chart" aria-label="年度对比图">
      <div className="flex flex-wrap items-center gap-2 text-xs text-td-muted">
        <span className="inline-flex items-center gap-1 rounded-full border border-td-line bg-td-surface px-2 py-1">
          <i className="inline-block h-2 w-2 rounded-[2px] bg-[#0ea5e9]" aria-hidden="true" />
          年度字数
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-td-line bg-td-surface px-2 py-1">
          <i className="inline-block h-[2px] w-3 bg-[#ea580c]" aria-hidden="true" />
          活跃天数
        </span>
      </div>

      <div className="overflow-x-auto rounded-[12px] border border-td-line bg-td-surface">
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          className="block min-w-[620px]"
          role="img"
          aria-label="年度总字数与活跃天数对比图"
        >
          {yTicks.map((tick) => {
            const y = CHART_MARGIN.top + plotHeight - tick * plotHeight
            const wordValue = Math.round(wordMax * tick)
            const activeValue = Math.round(activeMax * tick)

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
                  {formatNumber(activeValue)}
                </text>
              </g>
            )
          })}

          {chartPoints.map((point) => (
            <g key={point.year}>
              <rect
                x={point.x - barWidth / 2}
                y={point.barY}
                width={barWidth}
                height={point.barHeight}
                rx={8}
                fill="#0ea5e9"
                fillOpacity={0.86}
              >
                <title>
                  {point.year} 年：总字数 {formatNumber(point.totalWordCount)}，活跃天数 {formatNumber(point.activeDayCount)}，
                  总篇数 {formatNumber(point.entryCount)}
                </title>
              </rect>

              <text x={point.x} y={CHART_MARGIN.top + plotHeight + 20} textAnchor="middle" fontSize="11" fill="#666666">
                {point.year}
              </text>
            </g>
          ))}

          <path
            d={activePath}
            fill="none"
            stroke="#ea580c"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {chartPoints.map((point) => (
            <circle
              key={`${point.year}-active`}
              cx={point.x}
              cy={point.activeY}
              r={4}
              fill="#ea580c"
              stroke="#ffffff"
              strokeWidth={2}
            >
              <title>
                {point.year} 年活跃天数 {formatNumber(point.activeDayCount)}
              </title>
            </circle>
          ))}
        </svg>
      </div>
    </div>
  )
}
