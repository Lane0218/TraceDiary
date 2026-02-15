export interface ExportFileItem {
  entryId: string
  type: 'daily' | 'yearly_summary'
  path: string
  filename: string
  content: string
  modifiedAt: string
  wordCount: number
}

export interface ExportManifest {
  version: '1.1'
  exportedAt: string
  archiveName: string
  entryCount: number
  dailyCount: number
  yearlySummaryCount: number
  files: Array<{
    entryId: string
    path: string
    modifiedAt: string
    wordCount: number
  }>
}

export interface ExportResult {
  archiveName: string
  success: string[]
  failed: Array<{ entryId: string; reason: string }>
}
