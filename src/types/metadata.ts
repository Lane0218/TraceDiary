import type {
  DateString,
  DailyFilename,
  YearlySummaryFilename,
} from './diary'

interface MetadataEntryBase {
  date: DateString
  filename: string
  wordCount: number
  createdAt: string
  modifiedAt: string
}

export type MetadataEntry =
  | ({
      type: 'daily'
      filename: DailyFilename
    } & MetadataEntryBase)
  | ({
      type: 'yearly_summary'
      year: number
      filename: YearlySummaryFilename
    } & MetadataEntryBase)

export interface Metadata {
  version: string
  lastSync: string
  entries: MetadataEntry[]
}
