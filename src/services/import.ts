import type { DateString } from '../types/diary'
import { countVisibleChars } from '../utils/word-count'
import type { DiaryRecord } from './indexeddb'

const DAILY_FILE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})\.(md|txt)$/i
const YEARLY_SUMMARY_FILE_PATTERN = /^(\d{4})-summary\.(md|txt)$/i

export interface ImportReadableFile {
  name: string
  type?: string
  size: number
  lastModified?: number
  text: () => Promise<string>
}

export interface ImportSourceFile {
  name: string
  mimeType: string
  size: number
  lastModified?: string
  content: string
}

export type ImportParsedEntry =
  | {
      type: 'daily'
      id: `daily:${string}`
      date: DateString
      filename: `${string}.md.enc`
      content: string
      wordCount: number
      createdAt: string
      modifiedAt: string
    }
  | {
      type: 'yearly_summary'
      id: `summary:${number}`
      year: number
      date: DateString
      filename: `${number}-summary.md.enc`
      content: string
      wordCount: number
      createdAt: string
      modifiedAt: string
    }

export interface ImportCandidateEntry {
  sourceName: string
  entry: ImportParsedEntry
}

export interface ImportConflictItem {
  entryId: string
  sourceName: string
  localModifiedAt?: string
  incomingModifiedAt: string
  strategy?: 'overwrite' | 'skip'
  incoming: ImportParsedEntry
}

export interface ImportPreviewResult {
  ready: ImportCandidateEntry[]
  conflicts: ImportConflictItem[]
  invalid: Array<{ name: string; reason: string }>
  failed: Array<{ name: string; reason: string }>
}

export interface ImportApplyResult {
  persisted: ImportCandidateEntry[]
  failed: Array<{ name: string; entryId: string; reason: string }>
}

export interface ImportResult {
  success: string[]
  overwritten: string[]
  skipped: string[]
  invalid: Array<{ name: string; reason: string }>
  failed: Array<{ name: string; reason: string }>
}

interface ParsedDailyFileName {
  type: 'daily'
  id: `daily:${string}`
  date: DateString
  filename: `${string}.md.enc`
}

interface ParsedYearlySummaryFileName {
  type: 'yearly_summary'
  id: `summary:${number}`
  year: number
  date: DateString
  filename: `${number}-summary.md.enc`
}

type ParsedImportFileName = ParsedDailyFileName | ParsedYearlySummaryFileName

type ParseImportSourceResult =
  | {
      ok: true
      entry: ImportParsedEntry
    }
  | {
      ok: false
      category: 'invalid' | 'failed'
      reason: string
    }

function nowIsoString(): string {
  return new Date().toISOString()
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }
  return '未知错误'
}

function toIsoFromTimestamp(inputMs: number | undefined, fallback: string): string {
  if (typeof inputMs !== 'number' || !Number.isFinite(inputMs) || inputMs <= 0) {
    return fallback
  }
  return new Date(inputMs).toISOString()
}

function normalizeImportTime(value: string | undefined, fallback: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    return fallback
  }
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return new Date(parsed).toISOString()
}

function isValidDailyDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false
  }

  const parsed = new Date(Date.UTC(year, month - 1, day))
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  )
}

export function parseImportFileName(name: string): ParsedImportFileName | null {
  const trimmed = name.trim()
  const dailyMatch = DAILY_FILE_PATTERN.exec(trimmed)
  if (dailyMatch) {
    const year = Number.parseInt(dailyMatch[1], 10)
    const month = Number.parseInt(dailyMatch[2], 10)
    const day = Number.parseInt(dailyMatch[3], 10)
    if (!isValidDailyDate(year, month, day)) {
      return null
    }

    const date = `${dailyMatch[1]}-${dailyMatch[2]}-${dailyMatch[3]}` as DateString
    return {
      type: 'daily',
      id: `daily:${date}`,
      date,
      filename: `${date}.md.enc`,
    }
  }

  const yearlyMatch = YEARLY_SUMMARY_FILE_PATTERN.exec(trimmed)
  if (yearlyMatch) {
    const year = Number.parseInt(yearlyMatch[1], 10)
    const date = `${yearlyMatch[1]}-12-31` as DateString
    return {
      type: 'yearly_summary',
      id: `summary:${year}`,
      year,
      date,
      filename: `${year}-summary.md.enc`,
    }
  }

  return null
}

export async function buildImportSourceFile(file: ImportReadableFile): Promise<ImportSourceFile> {
  return {
    name: file.name,
    mimeType: typeof file.type === 'string' ? file.type : '',
    size: file.size,
    lastModified: toIsoFromTimestamp(file.lastModified, '').trim() || undefined,
    content: await file.text(),
  }
}

export function parseImportSourceFile(source: ImportSourceFile, nowIso = nowIsoString()): ParseImportSourceResult {
  const parsedName = parseImportFileName(source.name)
  if (!parsedName) {
    return {
      ok: false,
      category: 'invalid',
      reason: '文件名不符合导入规则（仅支持 YYYY-MM-DD 与 YYYY-summary）',
    }
  }

  if (!source.content.trim()) {
    return {
      ok: false,
      category: 'failed',
      reason: '文件内容为空',
    }
  }

  const modifiedAt = normalizeImportTime(source.lastModified, nowIso)
  const createdAt = modifiedAt
  const wordCount = countVisibleChars(source.content)

  if (parsedName.type === 'daily') {
    return {
      ok: true,
      entry: {
        type: 'daily',
        id: parsedName.id,
        date: parsedName.date,
        filename: parsedName.filename,
        content: source.content,
        wordCount,
        createdAt,
        modifiedAt,
      },
    }
  }

  return {
    ok: true,
    entry: {
      type: 'yearly_summary',
      id: parsedName.id,
      year: parsedName.year,
      date: parsedName.date,
      filename: parsedName.filename,
      content: source.content,
      wordCount,
      createdAt,
      modifiedAt,
    },
  }
}

function toDiaryRecord(entry: ImportParsedEntry, existingCreatedAt?: string): DiaryRecord {
  const createdAt = typeof existingCreatedAt === 'string' && existingCreatedAt.trim() ? existingCreatedAt : entry.createdAt

  if (entry.type === 'daily') {
    return {
      id: entry.id,
      type: 'daily',
      date: entry.date,
      filename: entry.filename,
      content: entry.content,
      wordCount: entry.wordCount,
      createdAt,
      modifiedAt: entry.modifiedAt,
    }
  }

  return {
    id: entry.id,
    type: 'yearly_summary',
    year: entry.year,
    date: entry.date,
    filename: entry.filename,
    content: entry.content,
    wordCount: entry.wordCount,
    createdAt,
    modifiedAt: entry.modifiedAt,
  }
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)]
}

export async function prepareImportPreview(
  sources: ImportSourceFile[],
  dependencies: {
    loadExistingDiary: (entryId: string) => Promise<DiaryRecord | null>
    now?: () => string
  },
): Promise<ImportPreviewResult> {
  const nowIso = (dependencies.now ?? nowIsoString)()
  const preview: ImportPreviewResult = {
    ready: [],
    conflicts: [],
    invalid: [],
    failed: [],
  }

  const candidates: ImportCandidateEntry[] = []

  for (const source of sources) {
    try {
      const parsed = parseImportSourceFile(source, nowIso)
      if (!parsed.ok) {
        if (parsed.category === 'invalid') {
          preview.invalid.push({
            name: source.name,
            reason: parsed.reason,
          })
        } else {
          preview.failed.push({
            name: source.name,
            reason: parsed.reason,
          })
        }
        continue
      }

      candidates.push({
        sourceName: source.name,
        entry: parsed.entry,
      })
    } catch (error) {
      preview.failed.push({
        name: source.name,
        reason: `解析失败：${toErrorMessage(error)}`,
      })
    }
  }

  for (const candidate of candidates) {
    try {
      const local = await dependencies.loadExistingDiary(candidate.entry.id)
      if (local) {
        preview.conflicts.push({
          entryId: candidate.entry.id,
          sourceName: candidate.sourceName,
          localModifiedAt: local.modifiedAt,
          incomingModifiedAt: candidate.entry.modifiedAt,
          incoming: candidate.entry,
        })
        continue
      }
      preview.ready.push(candidate)
    } catch (error) {
      preview.failed.push({
        name: candidate.sourceName,
        reason: `读取本地数据失败：${toErrorMessage(error)}`,
      })
    }
  }

  return preview
}

export async function applyImportCandidates(
  candidates: ImportCandidateEntry[],
  dependencies: {
    loadExistingDiary: (entryId: string) => Promise<DiaryRecord | null>
    saveDiary: (record: DiaryRecord) => Promise<void>
  },
): Promise<ImportApplyResult> {
  const result: ImportApplyResult = {
    persisted: [],
    failed: [],
  }

  for (const candidate of candidates) {
    try {
      const local = await dependencies.loadExistingDiary(candidate.entry.id)
      const record = toDiaryRecord(candidate.entry, local?.createdAt)
      await dependencies.saveDiary(record)
      result.persisted.push(candidate)
    } catch (error) {
      result.failed.push({
        name: candidate.sourceName,
        entryId: candidate.entry.id,
        reason: `写入本地失败：${toErrorMessage(error)}`,
      })
    }
  }

  return result
}

export function buildImportResult(input: {
  persisted: ImportCandidateEntry[]
  skippedEntryIds: string[]
  overwrittenEntryIds: string[]
  invalid: Array<{ name: string; reason: string }>
  failed: Array<{ name: string; reason: string }>
  persistFailed?: Array<{ name: string; reason: string }>
}): ImportResult {
  const persistedIds = uniqueStrings(input.persisted.map((item) => item.entry.id))
  const overwrittenSet = new Set(uniqueStrings(input.overwrittenEntryIds))

  const overwritten = persistedIds.filter((entryId) => overwrittenSet.has(entryId))
  const skipped = uniqueStrings(input.skippedEntryIds)
  const failed = [...input.failed, ...(input.persistFailed ?? [])]

  return {
    success: persistedIds,
    overwritten,
    skipped,
    invalid: input.invalid,
    failed,
  }
}
