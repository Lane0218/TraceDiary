import JSZip from 'jszip'
import { countVisibleChars } from '../utils/word-count'
import type { ExportFileItem, ExportManifest, ExportResult } from '../types/export'
import { DIARY_INDEX_TYPE, listDiariesByIndex, type DiaryRecord } from './indexeddb'

const DAILY_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const SUMMARY_ID_RE = /^summary:(\d{4})$/
const YEAR_RANGE_MIN = 1970
const YEAR_RANGE_MAX = 9999

export type ExportOutcome = 'success' | 'no_data' | 'blocked'

export interface ExportExecutionResult extends ExportResult {
  outcome: ExportOutcome
  exportedAt: string
  message: string
  manifest?: ExportManifest
}

export interface ExportDiaryDataOptions {
  now?: () => Date
  loadRecords?: () => Promise<DiaryRecord[]>
  downloadArchive?: (blob: Blob, archiveName: string) => void
}

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }
  return fallback
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function isValidYear(year: number): boolean {
  return Number.isInteger(year) && year >= YEAR_RANGE_MIN && year <= YEAR_RANGE_MAX
}

function normalizeContent(record: DiaryRecord): string {
  return typeof record.content === 'string' ? record.content : ''
}

function normalizeModifiedAt(record: DiaryRecord, fallbackIso: string): string {
  if (typeof record.modifiedAt === 'string' && record.modifiedAt.trim()) {
    return record.modifiedAt
  }
  if (typeof record.createdAt === 'string' && record.createdAt.trim()) {
    return record.createdAt
  }
  return fallbackIso
}

function normalizeWordCount(record: DiaryRecord, content: string): number {
  if (typeof record.wordCount === 'number' && Number.isFinite(record.wordCount) && record.wordCount >= 0) {
    return record.wordCount
  }
  return countVisibleChars(content)
}

function resolveYear(record: DiaryRecord): number {
  if (typeof record.year === 'number' && isValidYear(record.year)) {
    return record.year
  }

  if (typeof record.id === 'string') {
    const match = record.id.trim().match(SUMMARY_ID_RE)
    if (match) {
      const parsed = Number.parseInt(match[1], 10)
      if (isValidYear(parsed)) {
        return parsed
      }
    }
  }

  if (typeof record.date === 'string') {
    const parsed = Number.parseInt(record.date.slice(0, 4), 10)
    if (isValidYear(parsed)) {
      return parsed
    }
  }

  throw new Error('年度总结缺少有效年份')
}

function resolveEntryId(record: DiaryRecord): string {
  if (typeof record.id === 'string' && record.id.trim()) {
    return record.id.trim()
  }

  if (record.type === 'daily' && typeof record.date === 'string' && DAILY_DATE_RE.test(record.date)) {
    return `daily:${record.date}`
  }

  if (record.type === 'yearly_summary') {
    try {
      return `summary:${resolveYear(record)}`
    } catch {
      return 'summary:unknown'
    }
  }

  return 'unknown'
}

export function buildArchiveName(now: Date): string {
  const year = now.getFullYear()
  const month = pad2(now.getMonth() + 1)
  const day = pad2(now.getDate())
  const hour = pad2(now.getHours())
  const minute = pad2(now.getMinutes())
  const second = pad2(now.getSeconds())
  return `trace-diary-export-${year}${month}${day}-${hour}${minute}${second}.zip`
}

export function toExportFileItem(record: DiaryRecord, fallbackIso: string): ExportFileItem {
  const content = normalizeContent(record)
  const modifiedAt = normalizeModifiedAt(record, fallbackIso)
  const wordCount = normalizeWordCount(record, content)
  const entryId = resolveEntryId(record)

  if (record.type === 'daily') {
    const date = typeof record.date === 'string' ? record.date.trim() : ''
    if (!DAILY_DATE_RE.test(date)) {
      throw new Error('日记日期格式无效，需为 YYYY-MM-DD')
    }
    return {
      entryId,
      type: 'daily',
      path: `diaries/${date}.md`,
      filename: `${date}.md`,
      content,
      modifiedAt,
      wordCount,
    }
  }

  if (record.type === 'yearly_summary') {
    const year = resolveYear(record)
    return {
      entryId,
      type: 'yearly_summary',
      path: `summaries/${year}-summary.md`,
      filename: `${year}-summary.md`,
      content,
      modifiedAt,
      wordCount,
    }
  }

  throw new Error('不支持的条目类型')
}

export function buildExportManifest(
  items: ExportFileItem[],
  archiveName: string,
  exportedAt: string,
): ExportManifest {
  const dailyCount = items.filter((item) => item.type === 'daily').length
  const yearlySummaryCount = items.length - dailyCount

  return {
    version: '1.1',
    exportedAt,
    archiveName,
    entryCount: items.length,
    dailyCount,
    yearlySummaryCount,
    files: items.map((item) => ({
      entryId: item.entryId,
      path: item.path,
      modifiedAt: item.modifiedAt,
      wordCount: item.wordCount,
    })),
  }
}

export async function createExportArchiveBlob(
  items: ExportFileItem[],
  manifest: ExportManifest,
): Promise<Blob> {
  const zip = new JSZip()

  for (const item of items) {
    zip.file(item.path, item.content)
  }
  zip.file('manifest.json', `${JSON.stringify(manifest, null, 2)}\n`)

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/zip',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })
}

export function triggerArchiveDownload(blob: Blob, archiveName: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('当前环境不支持浏览器下载')
  }

  const url = window.URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = archiveName
  anchor.rel = 'noopener'
  anchor.style.display = 'none'

  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => {
    window.URL.revokeObjectURL(url)
  }, 0)
}

async function defaultLoadRecords(): Promise<DiaryRecord[]> {
  const [dailyRecords, yearlySummaryRecords] = await Promise.all([
    listDiariesByIndex(DIARY_INDEX_TYPE, 'daily'),
    listDiariesByIndex(DIARY_INDEX_TYPE, 'yearly_summary'),
  ])
  return [...dailyRecords, ...yearlySummaryRecords]
}

export async function exportDiaryData(options: ExportDiaryDataOptions = {}): Promise<ExportExecutionResult> {
  const now = options.now?.() ?? new Date()
  const exportedAt = now.toISOString()
  const archiveName = buildArchiveName(now)
  const loadRecords = options.loadRecords ?? defaultLoadRecords
  const downloadArchive = options.downloadArchive ?? triggerArchiveDownload

  let records: DiaryRecord[]
  try {
    records = await loadRecords()
  } catch (error) {
    const message = `导出失败：${toErrorMessage(error, '读取数据失败')}`
    return {
      outcome: 'blocked',
      archiveName: '',
      exportedAt,
      success: [],
      failed: [],
      message,
    }
  }

  if (records.length === 0) {
    return {
      outcome: 'no_data',
      archiveName: '',
      exportedAt,
      success: [],
      failed: [],
      message: '暂无可导出的日记数据',
    }
  }

  const files: ExportFileItem[] = []
  const success: string[] = []
  const failed: Array<{ entryId: string; reason: string }> = []

  for (const record of records) {
    try {
      const item = toExportFileItem(record, exportedAt)
      files.push(item)
      success.push(item.entryId)
    } catch (error) {
      failed.push({
        entryId: resolveEntryId(record),
        reason: toErrorMessage(error, '序列化失败'),
      })
    }
  }

  if (files.length === 0) {
    return {
      outcome: 'no_data',
      archiveName: '',
      exportedAt,
      success: [],
      failed,
      message: '暂无可导出的日记数据',
    }
  }

  const manifest = buildExportManifest(files, archiveName, exportedAt)

  try {
    const blob = await createExportArchiveBlob(files, manifest)
    downloadArchive(blob, archiveName)
  } catch (error) {
    const message = `导出失败：${toErrorMessage(error, '压缩包生成失败')}`
    return {
      outcome: 'blocked',
      archiveName: '',
      exportedAt,
      success: [],
      failed,
      message,
    }
  }

  const message =
    failed.length > 0
      ? `导出完成，成功 ${success.length} 条，失败 ${failed.length} 条`
      : `导出完成，共 ${success.length} 条`

  return {
    outcome: 'success',
    archiveName,
    exportedAt,
    success,
    failed,
    manifest,
    message,
  }
}
