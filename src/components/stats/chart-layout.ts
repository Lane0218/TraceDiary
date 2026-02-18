interface ChartLayoutOptions {
  chartWidth: number
  marginLeft: number
  marginRight: number
  axisGutterLeft: number
  axisGutterRight: number
  pointCount: number
  barMinWidth: number
  barMaxWidth: number
  barWidthRatio: number
  edgeGap: number
}

interface ChartLayoutResult {
  plotStartX: number
  plotEndX: number
  plotWidth: number
  barWidth: number
  pointStartX: number
  pointEndX: number
  step: number
  getPointX: (index: number) => number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function createChartLayout(options: ChartLayoutOptions): ChartLayoutResult {
  const plotStartX = options.marginLeft + options.axisGutterLeft
  const plotEndX = options.chartWidth - options.marginRight - options.axisGutterRight
  const plotWidth = Math.max(1, plotEndX - plotStartX)

  if (options.pointCount <= 1) {
    const barWidth = clamp(plotWidth * 0.28, options.barMinWidth, options.barMaxWidth)
    const centerX = plotStartX + plotWidth / 2
    return {
      plotStartX,
      plotEndX,
      plotWidth,
      barWidth,
      pointStartX: centerX,
      pointEndX: centerX,
      step: 0,
      getPointX: () => centerX,
    }
  }

  const rawStep = plotWidth / (options.pointCount - 1)
  const barWidth = clamp(rawStep * options.barWidthRatio, options.barMinWidth, options.barMaxWidth)
  const edgeInset = Math.min(plotWidth / 2, barWidth / 2 + options.edgeGap)
  const pointStartX = plotStartX + edgeInset
  const pointEndX = plotEndX - edgeInset
  const step = (pointEndX - pointStartX) / (options.pointCount - 1)

  return {
    plotStartX,
    plotEndX,
    plotWidth,
    barWidth,
    pointStartX,
    pointEndX,
    step,
    getPointX: (index) => pointStartX + step * index,
  }
}

export type { ChartLayoutOptions, ChartLayoutResult }
