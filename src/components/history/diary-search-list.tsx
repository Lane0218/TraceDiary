import { useMemo, type CSSProperties, type ReactNode } from 'react'
import { List, type RowComponentProps } from 'react-window'
import type { DateString, DiarySearchResult, DiarySearchResultItem } from '../../types/diary'

const SEARCH_ROW_HEIGHT = 58
const SEARCH_INPUT_BLOCK_HEIGHT = 48

interface SearchRowProps {
  items: DiarySearchResultItem[]
  keyword: string
  onSelectDate: (dateKey: DateString) => void
}

interface DiarySearchListProps {
  keyword: string
  result: DiarySearchResult
  isSearching?: boolean
  onKeywordChange: (keyword: string) => void
  onSelectDate: (dateKey: DateString) => void
  viewportHeight?: number
}

const snippetSingleLineStyle: CSSProperties = {
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

function renderHighlightedSnippet(snippet: string, keyword: string): ReactNode {
  if (!keyword) {
    return snippet
  }

  const index = snippet.indexOf(keyword)
  if (index < 0) {
    return snippet
  }

  const start = snippet.slice(0, index)
  const matched = snippet.slice(index, index + keyword.length)
  const end = snippet.slice(index + keyword.length)

  return (
    <>
      {start}
      <mark className="rounded-[3px] bg-[#e8eaed] px-[2px] text-[#1f2937]">{matched}</mark>
      {end}
    </>
  )
}

function SearchRow({ index, style, items, keyword, onSelectDate }: RowComponentProps<SearchRowProps>) {
  const item = items[index]

  return (
    <div style={style} className="px-0.5 py-[2px]">
      <button
        type="button"
        onClick={() => onSelectDate(item.date)}
        className="group flex h-full w-full flex-col justify-center rounded-[10px] border border-[#d7d7d3] bg-[#fcfcfb] px-3 py-[6px] text-left transition hover:border-[#bfc2c5] hover:bg-white"
        aria-label={`打开 ${item.date}`}
        data-testid="diary-search-card"
      >
        <p className="inline-flex w-fit max-w-full items-center rounded-full border border-[#cfd4d9] bg-[#eef1f4] px-2 py-[2px] text-[12px] font-medium leading-none text-[#2f3a43]">
          {item.date}
        </p>
        <p
          className="mt-[3px] w-full text-[13px] leading-[1.25] text-[#4a545c]"
          style={snippetSingleLineStyle}
          data-testid="diary-search-snippet"
        >
          {renderHighlightedSnippet(item.snippet, keyword)}
        </p>
      </button>
    </div>
  )
}

function SearchStateBox({ text, testId, style }: { text: string; testId: string; style: CSSProperties }) {
  return (
    <div
      className="rounded-[10px] border border-dashed border-td-line bg-td-soft p-3 text-sm text-td-muted"
      style={style}
      data-testid={testId}
    >
      {text}
    </div>
  )
}

export default function DiarySearchList({
  keyword,
  result,
  isSearching = false,
  onKeywordChange,
  onSelectDate,
  viewportHeight = 360,
}: DiarySearchListProps) {
  const normalizedKeyword = result.query.normalizedKeyword
  const hasKeyword = normalizedKeyword.length > 0
  const isCompactResult = hasKeyword && result.items.length > 0 && result.items.length <= 3

  const listViewportHeight = useMemo(
    () => Math.max(viewportHeight - SEARCH_INPUT_BLOCK_HEIGHT, 108),
    [viewportHeight],
  )

  const listHeight = useMemo(() => {
    if (!isCompactResult) {
      return listViewportHeight
    }
    return Math.min(listViewportHeight, result.items.length * SEARCH_ROW_HEIGHT + 6)
  }, [isCompactResult, listViewportHeight, result.items.length])

  const listStyle = useMemo<CSSProperties>(() => ({ height: listHeight, width: '100%' }), [listHeight])

  return (
    <div className="flex h-full min-h-0 flex-col gap-2" aria-label="diary-search-panel">
      <div className="relative">
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className="pointer-events-none absolute left-3 top-1/2 h-[16px] w-[16px] -translate-y-1/2 text-[#6f7680]"
        >
          <path
            d="M13.8 12.4l3 3a1 1 0 1 1-1.4 1.4l-3-3a6 6 0 1 1 1.4-1.4Zm-5.3.6a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Z"
            fill="currentColor"
          />
        </svg>
        <input
          type="text"
          value={keyword}
          onChange={(event) => onKeywordChange(event.target.value)}
          placeholder="输入关键词搜索日记内容"
          className="w-full rounded-[10px] border border-[#d7d7d3] bg-[#fcfcfb] px-3 py-[8px] pl-10 text-sm text-td-text outline-none transition focus:border-[#4b525a] focus:ring-2 focus:ring-[#e2e6ea]"
          data-testid="diary-search-input"
          aria-label="日记搜索输入"
        />
      </div>

      <div className="min-h-0 flex-1">
        {isSearching && hasKeyword ? <SearchStateBox text="正在搜索..." testId="diary-search-loading" style={listStyle} /> : null}

        {!isSearching && hasKeyword && result.items.length === 0 ? (
          <SearchStateBox text={`未找到包含“${normalizedKeyword}”的日记。`} testId="diary-search-empty" style={listStyle} />
        ) : null}

        {!isSearching && hasKeyword && result.items.length > 0 ? (
          <div className={isCompactResult ? 'space-y-1' : 'flex h-full min-h-0 flex-col gap-1'}>
            {result.truncated ? (
              <p className="text-[11px] text-td-muted" data-testid="diary-search-truncated">
                结果较多，仅展示前 {result.returnedCount} 条。
              </p>
            ) : null}

            <List
              rowCount={result.items.length}
              rowHeight={SEARCH_ROW_HEIGHT}
              rowComponent={SearchRow}
              rowProps={{ items: result.items, keyword: normalizedKeyword, onSelectDate }}
              defaultHeight={listHeight}
              overscanCount={4}
              className="rounded-[10px]"
              style={listStyle}
              aria-label="日记搜索结果列表"
              data-testid="diary-search-virtual-list"
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}
