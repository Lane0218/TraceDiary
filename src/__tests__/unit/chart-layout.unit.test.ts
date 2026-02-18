import { describe, expect, it } from 'vitest'
import { createChartLayout } from '../../components/stats/chart-layout'

describe('createChartLayout', () => {
  it('月度图布局应给首尾柱体保留安全区', () => {
    const layout = createChartLayout({
      chartWidth: 920,
      marginLeft: 56,
      marginRight: 56,
      axisGutterLeft: 28,
      axisGutterRight: 28,
      pointCount: 12,
      barMinWidth: 14,
      barMaxWidth: 34,
      barWidthRatio: 0.5,
      edgeGap: 4,
    })

    const firstX = layout.getPointX(0)
    const lastX = layout.getPointX(11)
    const firstBarLeft = firstX - layout.barWidth / 2
    const lastBarRight = lastX + layout.barWidth / 2

    expect(firstBarLeft).toBeGreaterThan(layout.plotStartX)
    expect(lastBarRight).toBeLessThan(layout.plotEndX)
    expect(layout.step).toBeGreaterThan(0)
  })

  it('年度图布局在少量年份时也不应贴边', () => {
    const layout = createChartLayout({
      chartWidth: 960,
      marginLeft: 64,
      marginRight: 64,
      axisGutterLeft: 30,
      axisGutterRight: 30,
      pointCount: 4,
      barMinWidth: 12,
      barMaxWidth: 72,
      barWidthRatio: 0.58,
      edgeGap: 4,
    })

    const firstX = layout.getPointX(0)
    const lastX = layout.getPointX(3)

    expect(firstX - layout.barWidth / 2).toBeGreaterThan(layout.plotStartX)
    expect(lastX + layout.barWidth / 2).toBeLessThan(layout.plotEndX)
  })

  it('单点场景应保持居中且不越界', () => {
    const layout = createChartLayout({
      chartWidth: 920,
      marginLeft: 56,
      marginRight: 56,
      axisGutterLeft: 28,
      axisGutterRight: 28,
      pointCount: 1,
      barMinWidth: 14,
      barMaxWidth: 34,
      barWidthRatio: 0.5,
      edgeGap: 4,
    })

    const x = layout.getPointX(0)
    const center = layout.plotStartX + layout.plotWidth / 2

    expect(layout.step).toBe(0)
    expect(x).toBe(center)
    expect(x - layout.barWidth / 2).toBeGreaterThanOrEqual(layout.plotStartX)
    expect(x + layout.barWidth / 2).toBeLessThanOrEqual(layout.plotEndX)
  })
})
