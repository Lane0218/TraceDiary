import type { CanonicalIndexDocument } from './index-manifest'

export interface ExportFileItem {
  entryId: string
  type: 'daily' | 'yearly_summary'
  path: string
  filename: string
  content: string
  createdAt: string
  modifiedAt: string
  wordCount: number
  date: string
  year?: number
}

export interface ExportManifest extends CanonicalIndexDocument {
  archiveName: string
}

export interface ExportResult {
  archiveName: string
  success: string[]
  failed: Array<{ entryId: string; reason: string }>
}
