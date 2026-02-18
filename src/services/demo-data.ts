import type { DiaryRecord } from './indexeddb'
import type { DateString } from '../types/diary'

const DEMO_AUTHOR = 'TraceDiary Demo'

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function toDateString(year: number, month: number, day: number): DateString {
  return `${year}-${pad(month)}-${pad(day)}` as DateString
}

function toIso(date: DateString): string {
  return `${date}T08:00:00.000+08:00`
}

function buildDailyRecord(date: DateString, content: string): DiaryRecord {
  return {
    id: `daily:${date}`,
    type: 'daily',
    date,
    content,
    wordCount: content.replace(/\s+/g, '').length,
    createdAt: toIso(date),
    modifiedAt: toIso(date),
  }
}

function buildYearlyRecord(year: number, content: string): DiaryRecord {
  const date = toDateString(year, 12, 31)
  return {
    id: `summary:${year}`,
    type: 'yearly_summary',
    year,
    date,
    content,
    wordCount: content.replace(/\s+/g, '').length,
    createdAt: `${year}-12-31T20:00:00.000+08:00`,
    modifiedAt: `${year}-12-31T20:00:00.000+08:00`,
  }
}

function buildDemoDailyContent(date: DateString): string {
  return `# ${date} · 演示日记\n\n这是 ${DEMO_AUTHOR} 的只读示例内容。\n\n- 今日关键词：专注 / 复盘 / 同步\n- 演示说明：当前处于游客模式，编辑与 push/pull 已禁用\n\n> 你可以先体验阅读、日历切换与往年今日。\n`
}

function buildDemoSummaryContent(year: number): string {
  return `# ${year} 年年度总结（演示）\n\n## 今年最重要的三件事\n\n- 建立稳定的日记记录习惯\n- 每月进行一次节奏复盘\n- 把想法沉淀为可执行计划\n\n## 想继续完善的方向\n\n- 更细致地记录情绪与能量波动\n- 把年度目标拆成季度与周计划\n\n> 当前是演示数据，登录并完成配置后可切换到你的真实数据。\n`
}

export function getDemoDailyEntry(date: DateString): DiaryRecord {
  return buildDailyRecord(date, buildDemoDailyContent(date))
}

export function listDemoDailyRecords(targetDate: DateString): DiaryRecord[] {
  const [yearText, monthText, dayText] = targetDate.split('-')
  const year = Number.parseInt(yearText, 10)
  const month = Number.parseInt(monthText, 10)
  const day = Number.parseInt(dayText, 10)
  const safeYear = Number.isFinite(year) ? year : new Date().getFullYear()

  const anchorDates: DateString[] = [
    toDateString(safeYear, month, day),
    toDateString(safeYear - 1, month, day),
    toDateString(safeYear - 2, month, day),
    toDateString(safeYear, 1, 12),
    toDateString(safeYear, 3, 3),
    toDateString(safeYear, 6, 18),
    toDateString(safeYear, 9, 9),
    toDateString(safeYear, 11, 20),
  ]

  return anchorDates.map((date) => buildDailyRecord(date, buildDemoDailyContent(date)))
}

export function getDemoYearlySummary(year: number): DiaryRecord {
  return buildYearlyRecord(year, buildDemoSummaryContent(year))
}

export function listDemoYearlySummaries(targetYear: number): DiaryRecord[] {
  return [
    buildYearlyRecord(targetYear, buildDemoSummaryContent(targetYear)),
    buildYearlyRecord(targetYear - 1, buildDemoSummaryContent(targetYear - 1)),
  ]
}

export const GUEST_MODE_READ_ONLY_MESSAGE = '演示模式为只读，请先在设置页完成登录与配置后再进行 pull/push。'
