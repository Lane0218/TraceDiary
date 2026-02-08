export type DateString = `${number}-${number}-${number}`

export type EntryId = `daily:${DateString}` | `summary:${number}`

export type DailyFilename = `${string}.md.enc`

export type YearlySummaryFilename = `${number}-summary.md.enc`

export interface EntryBase {
  id: EntryId
  date: DateString
  filename: string
  content: string
  wordCount: number
  createdAt: string
  modifiedAt: string
}

export interface DailyEntry extends EntryBase {
  type: 'daily'
  id: `daily:${DateString}`
  filename: DailyFilename
}

export interface YearlySummaryEntry extends EntryBase {
  type: 'yearly_summary'
  id: `summary:${number}`
  year: number
  filename: YearlySummaryFilename
}

export type DiaryEntry = DailyEntry | YearlySummaryEntry
