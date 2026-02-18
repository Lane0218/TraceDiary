import type { YearlyTrendPoint } from '../../types/stats'
import { createChartLayout } from './chart-layout'
import { STATS_CHART_THEME } from './stats-chart-theme'

interface YearlyComparisonChartProps {
  items: YearlyTrendPoint[]
  isLoading?: boolean
}

const numberFormatter = new Intl.NumberFormat('zh-CN')

const CHART_WIDTH = 960
const CHART_HEIGHT = 360
const CHART_MARGIN = {
  top: 22,
  right: 64,
  bottom: 52,
  left: 64,
}
const AXIS_GUTTER = {
  left: 30,
  right: 30,
}
const CLIP_PATH_ID = 'insights-yearly-plot-clip'

function formatNumber(value: number): string {
  return numberFormatter.format(value)
}

function shouldRenderXAxisLabel(index: number, total: number): boolean {
  if (total <= 10) {
    return true
  }
  if (index === 0 || index === total - 1) {
    return true
  }
  const step = Math.ceil(total / 10)
  return index % step === 0
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

  const layout = createChartLayout({
    chartWidth: CHART_WIDTH,
    marginLeft: CHART_MARGIN.left,
    marginRight: CHART_MARGIN.right,
    axisGutterLeft: AXIS_GUTTER.left,
    axisGutterRight: AXIS_GUTTER.right,
    pointCount: items.length,
    barMinWidth: 12,
    barMaxWidth: 72,
    barWidthRatio: 0.58,
    edgeGap: 4,
  })

  const plotWidth = layout.plotWidth
  const plotHeight = CHART_HEIGHT - CHART_MARGIN.top - CHART_MARGIN.bottom
  const wordMax = Math.max(1, ...items.map((item) => item.totalWordCount))
  const activeMax = Math.max(1, ...items.map((item) => item.activeDayCount))
  const barWidth = layout.barWidth

  const chartPoints = items.map((item, index) => {
    const x = layout.getPointX(index)
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
      <div className="flex flex-wrap items-center gap-2 text-sm text-td-muted">
        <span className="inline-flex items-center gap-1 rounded-full border border-td-line bg-td-surface px-2 py-1">
          <i
            className="inline-block h-2 w-2 rounded-[2px]"
            style={{ backgroundColor: STATS_CHART_THEME.primary500 }}
            aria-hidden="true"
          />
          年度字数
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-td-line bg-td-surface px-2 py-1">
          <i
            className="inline-block h-[2px] w-3"
            style={{ backgroundColor: STATS_CHART_THEME.primary600 }}
            aria-hidden="true"
          />
          活跃天数
        </span>
      </div>

      <div className="rounded-[12px] border border-td-line bg-td-surface" data-testid="insights-yearly-chart-frame">
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          className="block h-auto w-full"
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
                  x1={layout.plotStartX}
                  y1={y}
                  x2={layout.plotEndX}
                  y2={y}
                  stroke={STATS_CHART_THEME.gridLine}
                  strokeDasharray="3 4"
                />
                <text
                  x={layout.plotStartX - 10}
                  y={y + 4}
                  textAnchor="end"
                  fontSize="12"
                  fill={STATS_CHART_THEME.axisText}
                  data-chart-role="y-axis-label-left"
                >
                  {formatNumber(wordValue)}
                </text>
                <text
                  x={layout.plotEndX + 10}
                  y={y + 4}
                  fontSize="12"
                  fill={STATS_CHART_THEME.axisText}
                  data-chart-role="y-axis-label-right"
                >
                  {formatNumber(activeValue)}
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
                key={point.year}
                x={point.x - barWidth / 2}
                y={point.barY}
                width={barWidth}
                height={point.barHeight}
                rx={8}
                fill={STATS_CHART_THEME.primary500}
                fillOpacity={0.86}
                data-chart-role="bar"
              >
                <title>
                  {point.year} 年：总字数 {formatNumber(point.totalWordCount)}，活跃天数 {formatNumber(point.activeDayCount)}，
                  总篇数 {formatNumber(point.entryCount)}
                </title>
              </rect>
            ))}

            <path
              d={activePath}
              fill="none"
              stroke={STATS_CHART_THEME.primary600}
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
                fill={STATS_CHART_THEME.primary600}
                stroke={STATS_CHART_THEME.pointStroke}
                strokeWidth={2}
              >
                <title>
                  {point.year} 年活跃天数 {formatNumber(point.activeDayCount)}
                </title>
              </circle>
            ))}
          </g>

          {chartPoints.map((point, index) =>
            shouldRenderXAxisLabel(index, chartPoints.length) ? (
              <text
                key={`${point.year}-x-axis`}
                x={point.x}
                y={CHART_MARGIN.top + plotHeight + 24}
                textAnchor="middle"
                fontSize="12"
                fill={STATS_CHART_THEME.axisText}
              >
                {point.year}
              </text>
            ) : null,
          )}
        </svg>
      </div>
    </div>
  )
}
