import type { CanonicalEntry, CanonicalIndexDocument, LegacyManifestFileEntry } from '../types/index-manifest'

const DAILY_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const DAILY_ENTRY_ID_RE = /^daily:(\d{4}-\d{2}-\d{2})$/
const SUMMARY_ENTRY_ID_RE = /^summary:(\d{4})$/
const DAILY_PATH_RE = /^diaries\/(\d{4}-\d{2}-\d{2})\.md$/
const SUMMARY_PATH_RE = /^summaries\/(\d{4})-summary\.md$/
const DAILY_FILENAME_RE = /^(\d{4}-\d{2}-\d{2})\.md\.enc$/
const SUMMARY_FILENAME_RE = /^(\d{4})-summary\.md\.enc$/

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const normalized = value.trim()
  return normalized ? normalized : null
}

function normalizeDate(value: unknown): string | null {
  const normalized = normalizeString(value)
  if (!normalized || !DAILY_DATE_RE.test(normalized)) {
    return null
  }
  return normalized
}

function normalizeYear(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 1970 && value <= 9999) {
    return value
  }
  const normalized = normalizeString(value)
  if (!normalized || !/^\d{4}$/.test(normalized)) {
    return null
  }
  return Number.parseInt(normalized, 10)
}

function normalizeWordCount(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null
  }
  return Math.trunc(value)
}

export function buildDailyEntryId(date: string): string {
  return `daily:${date}`
}

export function buildSummaryEntryId(year: number): string {
  return `summary:${year}`
}

export function buildDailyPlainPath(date: string): string {
  return `diaries/${date}.md`
}

export function buildSummaryPlainPath(year: number): string {
  return `summaries/${year}-summary.md`
}

export function buildDailyEncryptedFilename(date: string): `${string}.md.enc` {
  return `${date}.md.enc`
}

export function buildSummaryEncryptedFilename(year: number): `${number}-summary.md.enc` {
  return `${year}-summary.md.enc`
}

function sortEntries(entries: CanonicalEntry[]): CanonicalEntry[] {
  return [...entries].sort((left, right) => {
    if (left.type !== right.type) {
      return left.type === 'daily' ? -1 : 1
    }

    if (left.type === 'daily' && right.type === 'daily') {
      return left.date.localeCompare(right.date)
    }

    if (left.type === 'yearly_summary' && right.type === 'yearly_summary') {
      return left.year - right.year
    }

    return left.entryId.localeCompare(right.entryId)
  })
}

function dedupeEntries(entries: CanonicalEntry[]): CanonicalEntry[] {
  const next = new Map<string, CanonicalEntry>()
  for (const entry of entries) {
    next.set(entry.entryId, entry)
  }
  return sortEntries(Array.from(next.values()))
}

export function createCanonicalDailyEntry(input: {
  date: string
  wordCount: number
  createdAt: string
  modifiedAt: string
  entryId?: string
  path?: string
  filename?: string
}): CanonicalEntry {
  return {
    entryId: input.entryId ?? buildDailyEntryId(input.date),
    type: 'daily',
    date: input.date as `${number}-${number}-${number}`,
    path: input.path ?? buildDailyPlainPath(input.date),
    filename: (input.filename ?? buildDailyEncryptedFilename(input.date)) as `${string}.md.enc`,
    wordCount: input.wordCount,
    createdAt: input.createdAt,
    modifiedAt: input.modifiedAt,
  }
}

export function createCanonicalYearlySummaryEntry(input: {
  year: number
  wordCount: number
  createdAt: string
  modifiedAt: string
  entryId?: string
  date?: string
  path?: string
  filename?: string
}): CanonicalEntry {
  return {
    entryId: input.entryId ?? buildSummaryEntryId(input.year),
    type: 'yearly_summary',
    year: input.year,
    date: (input.date ?? `${input.year}-12-31`) as `${number}-${number}-${number}`,
    path: input.path ?? buildSummaryPlainPath(input.year),
    filename: (input.filename ?? buildSummaryEncryptedFilename(input.year)) as `${number}-summary.md.enc`,
    wordCount: input.wordCount,
    createdAt: input.createdAt,
    modifiedAt: input.modifiedAt,
  }
}

export function createCanonicalIndexDocument(
  entries: CanonicalEntry[],
  generatedAt: string,
  options: { version?: string; archiveName?: string } = {},
): CanonicalIndexDocument {
  const dedupedEntries = dedupeEntries(entries)
  const dailyCount = dedupedEntries.filter((entry) => entry.type === 'daily').length
  const yearlySummaryCount = dedupedEntries.length - dailyCount

  return {
    version: options.version?.trim() || '1.1',
    generatedAt,
    entryCount: dedupedEntries.length,
    dailyCount,
    yearlySummaryCount,
    entries: dedupedEntries,
    ...(options.archiveName?.trim() ? { archiveName: options.archiveName.trim() } : {}),
  }
}

function resolveEntryIdFromRaw(raw: Record<string, unknown>): string | null {
  const fromEntryId = normalizeString(raw.entryId)
  if (fromEntryId) {
    return fromEntryId
  }

  const fromPath = normalizeString(raw.path)
  if (fromPath) {
    const dailyPath = fromPath.match(DAILY_PATH_RE)
    if (dailyPath) {
      return buildDailyEntryId(dailyPath[1])
    }
    const summaryPath = fromPath.match(SUMMARY_PATH_RE)
    if (summaryPath) {
      return buildSummaryEntryId(Number.parseInt(summaryPath[1], 10))
    }
  }

  const fromFilename = normalizeString(raw.filename)
  if (fromFilename) {
    const dailyFilename = fromFilename.match(DAILY_FILENAME_RE)
    if (dailyFilename) {
      return buildDailyEntryId(dailyFilename[1])
    }
    const summaryFilename = fromFilename.match(SUMMARY_FILENAME_RE)
    if (summaryFilename) {
      return buildSummaryEntryId(Number.parseInt(summaryFilename[1], 10))
    }
  }

  return null
}

function resolveTypeFromRaw(raw: Record<string, unknown>): 'daily' | 'yearly_summary' | null {
  if (raw.type === 'daily' || raw.type === 'yearly_summary') {
    return raw.type
  }

  const entryId = resolveEntryIdFromRaw(raw)
  if (!entryId) {
    return null
  }
  if (DAILY_ENTRY_ID_RE.test(entryId)) {
    return 'daily'
  }
  if (SUMMARY_ENTRY_ID_RE.test(entryId)) {
    return 'yearly_summary'
  }
  return null
}

function parseLegacyManifestFileEntry(
  raw: LegacyManifestFileEntry,
  fallbackGeneratedAt: string,
): CanonicalEntry | null {
  return parseCanonicalEntry(raw as Record<string, unknown>, fallbackGeneratedAt)
}

export function parseCanonicalEntry(raw: unknown, fallbackGeneratedAt: string): CanonicalEntry | null {
  if (!isObject(raw)) {
    return null
  }

  const type = resolveTypeFromRaw(raw)
  const entryId = resolveEntryIdFromRaw(raw)
  const modifiedAt = normalizeString(raw.modifiedAt) ?? normalizeString(raw.createdAt) ?? fallbackGeneratedAt
  const createdAt = normalizeString(raw.createdAt) ?? modifiedAt
  const wordCount = normalizeWordCount(raw.wordCount) ?? 0

  if (type === 'daily') {
    const date =
      normalizeDate(raw.date) ??
      entryId?.match(DAILY_ENTRY_ID_RE)?.[1] ??
      normalizeString(raw.path)?.match(DAILY_PATH_RE)?.[1] ??
      normalizeString(raw.filename)?.match(DAILY_FILENAME_RE)?.[1] ??
      null
    if (!date || !entryId) {
      return null
    }

    return createCanonicalDailyEntry({
      entryId,
      date,
      path: normalizeString(raw.path) ?? buildDailyPlainPath(date),
      filename: normalizeString(raw.filename) ?? buildDailyEncryptedFilename(date),
      wordCount,
      createdAt,
      modifiedAt,
    })
  }

  if (type === 'yearly_summary') {
    const year =
      normalizeYear(raw.year) ??
      (entryId ? Number.parseInt(entryId.match(SUMMARY_ENTRY_ID_RE)?.[1] ?? '', 10) : Number.NaN) ??
      Number.NaN
    const normalizedYear = Number.isInteger(year) && year >= 1970 && year <= 9999 ? year : null
    if (normalizedYear === null || !entryId) {
      return null
    }

    return createCanonicalYearlySummaryEntry({
      entryId,
      year: normalizedYear,
      date: normalizeDate(raw.date) ?? `${normalizedYear}-12-31`,
      path: normalizeString(raw.path) ?? buildSummaryPlainPath(normalizedYear),
      filename: normalizeString(raw.filename) ?? buildSummaryEncryptedFilename(normalizedYear),
      wordCount,
      createdAt,
      modifiedAt,
    })
  }

  return null
}

export function normalizeCanonicalIndexDocument(
  raw: unknown,
  fallbackGeneratedAt: string,
): CanonicalIndexDocument {
  if (!isObject(raw)) {
    return createCanonicalIndexDocument([], fallbackGeneratedAt)
  }

  const candidate = raw as Record<string, unknown>
  const generatedAt =
    normalizeString(candidate.generatedAt) ??
    normalizeString(candidate.exportedAt) ??
    normalizeString(candidate.lastSync) ??
    fallbackGeneratedAt

  const sourceEntries = Array.isArray(candidate.entries)
    ? candidate.entries
    : Array.isArray(candidate.files)
      ? candidate.files
      : []

  const entries = sourceEntries
    .map((entry) =>
      Array.isArray(candidate.files)
        ? parseLegacyManifestFileEntry(entry as LegacyManifestFileEntry, generatedAt)
        : parseCanonicalEntry(entry, generatedAt),
    )
    .filter((entry): entry is CanonicalEntry => entry !== null)

  return createCanonicalIndexDocument(entries, generatedAt, {
    version: normalizeString(candidate.version) ?? '1.1',
    archiveName: normalizeString(candidate.archiveName) ?? undefined,
  })
}
