import type { MonthlyTrendPoint } from '../../types/stats'
import { createChartLayout } from './chart-layout'
import { STATS_CHART_THEME } from './stats-chart-theme'

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
const AXIS_GUTTER = {
  left: 28,
  right: 28,
}
const CLIP_PATH_ID = 'insights-monthly-plot-clip'

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

  const layout = createChartLayout({
    chartWidth: CHART_WIDTH,
    marginLeft: CHART_MARGIN.left,
    marginRight: CHART_MARGIN.right,
    axisGutterLeft: AXIS_GUTTER.left,
    axisGutterRight: AXIS_GUTTER.right,
    pointCount: items.length,
    barMinWidth: 14,
    barMaxWidth: 34,
    barWidthRatio: 0.5,
    edgeGap: 4,
  })

  const plotWidth = layout.plotWidth
  const plotHeight = CHART_HEIGHT - CHART_MARGIN.top - CHART_MARGIN.bottom
  const wordMax = Math.max(1, ...items.map((item) => item.totalWordCount))
  const entryMax = Math.max(1, ...items.map((item) => item.entryCount))
  const barWidth = layout.barWidth

  const chartPoints = items.map((item, index) => {
    const x = layout.getPointX(index)
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
            <i
              className="inline-block h-2 w-2 rounded-[2px]"
              style={{ backgroundColor: STATS_CHART_THEME.primary500 }}
              aria-hidden="true"
            />
            字数柱
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-td-line bg-td-surface px-2 py-1">
            <i
              className="inline-block h-[2px] w-3"
              style={{ backgroundColor: STATS_CHART_THEME.primary600 }}
              aria-hidden="true"
            />
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
                  x1={layout.plotStartX}
                  y1={y}
                  x2={layout.plotEndX}
                  y2={y}
                  stroke={STATS_CHART_THEME.gridLine}
                  strokeDasharray="3 4"
                />
                <text
                  x={layout.plotStartX - 8}
                  y={y + 4}
                  textAnchor="end"
                  fontSize="11"
                  fill={STATS_CHART_THEME.axisText}
                  data-chart-role="y-axis-label-left"
                >
                  {formatNumber(wordValue)}
                </text>
                <text
                  x={layout.plotEndX + 8}
                  y={y + 4}
                  fontSize="11"
                  fill={STATS_CHART_THEME.axisText}
                  data-chart-role="y-axis-label-right"
                >
                  {formatNumber(entryValue)}
                </text>
              </g>
            )
          })}

          <defs>
            <clipPath id={CLIP_PATH_ID}>
              <rect x={layout.plotStartX} y={CHART_MARGIN.top} width={plotWidth} height={plotHeight} />
            </clipPath>
          </defs>

          <g clipPath={`url(#${CLIP_PATH_ID})`}>
            {chartPoints.map((point) => (
              <rect
                key={point.label}
                x={point.x - barWidth / 2}
                y={point.barY}
                width={barWidth}
                height={point.barHeight}
                rx={6}
                fill={STATS_CHART_THEME.primary500}
                fillOpacity={0.88}
                data-chart-role="bar"
              >
                <title>
                  {point.label} 字数 {formatNumber(point.totalWordCount)}，篇数 {formatNumber(point.entryCount)}，
                  {formatMomLabel(point.momWordDeltaRatio)}
                </title>
              </rect>
            ))}

            <path
              d={linePath}
              fill="none"
              stroke={STATS_CHART_THEME.primary600}
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {chartPoints.map((point) => (
              <circle
                key={`${point.label}-point`}
                cx={point.x}
                cy={point.lineY}
                r={4}
                fill={STATS_CHART_THEME.primary600}
                stroke={STATS_CHART_THEME.pointStroke}
                strokeWidth={2}
              >
                <title>
                  {point.label} 篇数 {formatNumber(point.entryCount)}，字数 {formatNumber(point.totalWordCount)}
                </title>
              </circle>
            ))}
          </g>

          {chartPoints.map((point) => (
            <text
              key={`${point.label}-x-axis`}
              x={point.x}
              y={CHART_MARGIN.top + plotHeight + 20}
              textAnchor="middle"
              fontSize="11"
              fill={STATS_CHART_THEME.axisText}
            >
              {formatMonthLabel(point.label)}
            </text>
          ))}
        </svg>
      </div>
    </div>
  )
}
