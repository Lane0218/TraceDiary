export interface TocHeadingItem {
  id: string
  level: 1 | 2 | 3
  text: string
  line: number
}

const HEADING_PATTERN = /^(#{1,3})\s+(.+?)\s*$/
const FENCE_PATTERN = /^(\s*)(`{3,}|~{3,})/

function toSlug(text: string): string {
  const cleaned = text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{Letter}\p{Number}-]/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return cleaned.length > 0 ? cleaned : 'section'
}

function trimClosingHashes(text: string): string {
  return text.replace(/\s+#+\s*$/u, '').trim()
}

export function buildMarkdownToc(markdown: string): TocHeadingItem[] {
  const lines = markdown.split(/\r?\n/u)
  const idCounter = new Map<string, number>()
  const items: TocHeadingItem[] = []
  let activeFence: string | null = null

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index]
    const line = rawLine.trimStart()
    const fenceMatch = FENCE_PATTERN.exec(line)
    if (fenceMatch) {
      const marker = fenceMatch[2][0]
      if (!activeFence) {
        activeFence = marker
      } else if (activeFence === marker) {
        activeFence = null
      }
      continue
    }
    if (activeFence) {
      continue
    }

    const match = HEADING_PATTERN.exec(line)
    if (!match) {
      continue
    }

    const level = match[1].length as TocHeadingItem['level']
    const title = trimClosingHashes(match[2])
    if (!title) {
      continue
    }

    const baseId = toSlug(title)
    const nextCount = (idCounter.get(baseId) ?? 0) + 1
    idCounter.set(baseId, nextCount)
    const id = nextCount === 1 ? baseId : `${baseId}-${nextCount}`

    items.push({
      id,
      level,
      text: title,
      line: index + 1,
    })
  }

  return items
}
