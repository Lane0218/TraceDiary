import type { DiarySyncMetadata } from '../services/sync'

function normalizeContent(content: string): string {
  return content.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '')
}

function hashFnv1a(input: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function getDiarySyncEntryId(metadata: DiarySyncMetadata): string {
  const normalized = metadata.entryId.trim()
  if (normalized) {
    return normalized
  }
  if (metadata.type === 'daily') {
    return `daily:${metadata.date}`
  }
  return `summary:${metadata.year}`
}

export function getDiarySyncFingerprint(metadata: DiarySyncMetadata): string {
  const scope = metadata.type === 'daily' ? `daily:${metadata.date}` : `yearly:${metadata.year}`
  const normalizedContent = normalizeContent(metadata.content)
  const digestInput = `${scope}\n${normalizedContent}`
  return `v1:${hashFnv1a(digestInput)}:${normalizedContent.length}`
}
