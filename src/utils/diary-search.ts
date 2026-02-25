import type { DiaryRecord } from '../services/indexeddb'
import type { DateString, DiarySearchResult, DiarySearchResultItem } from '../types/diary'
import { countVisibleChars } from './word-count'

const DEFAULT_SEARCH_LIMIT = 200
const DEFAULT_SNIPPET_RADIUS = 24
const MAX_SNIPPET_TOTAL_CHARS = 40
const MAX_SNIPPET_LEADING_CONTEXT = 8

interface SearchDiaryRecordsOptions {
  limit?: number
  snippetRadius?: number
}

function normalizeLimit(limit?: number): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) {
    return DEFAULT_SEARCH_LIMIT
  }
  return Math.max(0, Math.floor(limit))
}

function normalizeSnippetRadius(snippetRadius?: number): number {
  if (typeof snippetRadius !== 'number' || !Number.isFinite(snippetRadius)) {
    return DEFAULT_SNIPPET_RADIUS
  }
  return Math.max(0, Math.floor(snippetRadius))
}

function toSnippetContent(content: string): string {
  return content.replace(/\s+/g, ' ').trim()
}

function createEmptySearchResult(keyword: string, normalizedKeyword: string, limit: number): DiarySearchResult {
  return {
    query: {
      keyword,
      normalizedKeyword,
      source: 'local_daily_only',
      limit,
    },
    totalMatched: 0,
    returnedCount: 0,
    truncated: false,
    items: [],
  }
}

export function buildMatchSnippet(content: string, matchIndex: number, radius: number, matchLength = 1): string {
  if (!content) {
    return ''
  }

  const safeRadius = Math.max(0, radius)
  const safeMatchLength = Math.max(1, matchLength)
  const safeMatchIndex = Math.min(Math.max(0, matchIndex), Math.max(content.length - 1, 0))
  const leadingContext = Math.min(safeRadius, MAX_SNIPPET_LEADING_CONTEXT)
  const trailingContext = safeRadius
  const start = Math.max(0, safeMatchIndex - leadingContext)
  const maxWindowLength = Math.max(
    safeMatchLength + leadingContext,
    Math.min(MAX_SNIPPET_TOTAL_CHARS, safeMatchLength + leadingContext + trailingContext),
  )
  const endByMatch = safeMatchIndex + safeMatchLength + trailingContext
  const end = Math.min(content.length, Math.max(start + maxWindowLength, endByMatch))
  const snippet = toSnippetContent(content.slice(start, end))

  if (!snippet) {
    return ''
  }

  const prefix = start > 0 ? '...' : ''
  return `${prefix}${snippet}`
}

function toSearchItem(
  record: DiaryRecord,
  normalizedKeyword: string,
  snippetRadius: number,
): DiarySearchResultItem | null {
  if (record.type !== 'daily') {
    return null
  }

  const content = typeof record.content === 'string' ? record.content : ''
  if (countVisibleChars(content) <= 0) {
    return null
  }

  const matchIndex = content.indexOf(normalizedKeyword)
  if (matchIndex < 0) {
    return null
  }

  return {
    entryId: `daily:${record.date}` as `daily:${string}`,
    date: record.date as DateString,
    snippet: buildMatchSnippet(content, matchIndex, snippetRadius, normalizedKeyword.length),
    matchIndex,
    contentLength: content.length,
  }
}

export function searchDiaryRecords(
  records: DiaryRecord[],
  keyword: string,
  options: SearchDiaryRecordsOptions = {},
): DiarySearchResult {
  const normalizedKeyword = keyword.trim()
  const limit = normalizeLimit(options.limit)
  if (!normalizedKeyword) {
    return createEmptySearchResult(keyword, normalizedKeyword, limit)
  }

  const snippetRadius = normalizeSnippetRadius(options.snippetRadius)
  const allMatchedItems = records
    .map((record) => toSearchItem(record, normalizedKeyword, snippetRadius))
    .filter((item): item is DiarySearchResultItem => item !== null)
    .sort((a, b) => b.date.localeCompare(a.date))

  const items = allMatchedItems.slice(0, limit)
  return {
    query: {
      keyword,
      normalizedKeyword,
      source: 'local_daily_only',
      limit,
    },
    totalMatched: allMatchedItems.length,
    returnedCount: items.length,
    truncated: allMatchedItems.length > items.length,
    items,
  }
}
