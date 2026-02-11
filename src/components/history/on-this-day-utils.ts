import type { DiaryRecord } from '../../services/indexeddb'

interface ParsedDate {
  year: number
  monthDay: string
}

export interface OnThisDayEntry {
  id: string
  date: string
  year: number
  preview: string
}

function parseDateKey(dateKey: string): ParsedDate | null {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey)
  if (!matched) {
    return null
  }

  const year = Number(matched[1])
  return {
    year,
    monthDay: `${matched[2]}-${matched[3]}`,
  }
}

export function buildPreview(content: string): string {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 3)

  return lines.length > 0 ? lines.join('\n') : '（无内容预览）'
}

export function buildOnThisDayEntries(targetDate: string, diaries: DiaryRecord[]): OnThisDayEntry[] {
  const target = parseDateKey(targetDate)
  if (!target) {
    return []
  }

  const result: OnThisDayEntry[] = []

  for (const record of diaries) {
    if (record.type !== 'daily') {
      continue
    }
    if (typeof record.date !== 'string') {
      continue
    }

    const current = parseDateKey(record.date)
    if (!current) {
      continue
    }
    if (current.monthDay !== target.monthDay || current.year === target.year) {
      continue
    }

    const content = typeof record.content === 'string' ? record.content : ''
    result.push({
      id: record.id,
      date: record.date,
      year: current.year,
      preview: buildPreview(content),
    })
  }

  return result.sort((left, right) => right.date.localeCompare(left.date))
}
