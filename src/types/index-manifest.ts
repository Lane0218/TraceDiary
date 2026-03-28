import type {
  DateString,
  DailyFilename,
  YearlySummaryFilename,
} from './diary'

interface CanonicalEntryBase {
  entryId: string
  date: DateString
  path: string
  filename: string
  wordCount: number
  createdAt: string
  modifiedAt: string
}

export type CanonicalEntry =
  | ({
      type: 'daily'
      filename: DailyFilename
    } & CanonicalEntryBase)
  | ({
      type: 'yearly_summary'
      year: number
      filename: YearlySummaryFilename
    } & CanonicalEntryBase)

export interface CanonicalIndexDocument {
  version: string
  generatedAt: string
  entryCount: number
  dailyCount: number
  yearlySummaryCount: number
  entries: CanonicalEntry[]
  archiveName?: string
}

export interface LegacyManifestFileEntry {
  entryId?: string
  path?: string
  modifiedAt?: string
  wordCount?: number
}
