import { useMemo, type CSSProperties, type ReactNode } from 'react'
import { List, type RowComponentProps } from 'react-window'
import type { DateString, DiarySearchResult, DiarySearchResultItem } from '../../types/diary'

const SEARCH_ROW_HEIGHT = 64
const SEARCH_INPUT_BLOCK_HEIGHT = 106

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
      <mark className="rounded-[3px] bg-[#efe4b8] px-[2px] text-[#38311f]">{matched}</mark>
      {end}
    </>
  )
}

function SearchRow({ index, style, items, keyword, onSelectDate }: RowComponentProps<SearchRowProps>) {
  const item = items[index]

  return (
    <div style={style} className="px-0.5 py-[3px]">
      <button
        type="button"
        onClick={() => onSelectDate(item.date)}
        className="group relative flex h-full w-full flex-col rounded-[12px] border border-[#d7d4ca] bg-[#fdfcf8] px-3 py-[7px] text-left shadow-[0_1px_0_rgba(255,255,255,0.85),0_3px_8px_rgba(34,40,34,0.06)] transition hover:border-[#bdb8a6] hover:bg-white hover:shadow-[0_1px_0_rgba(255,255,255,0.9),0_10px_14px_rgba(34,40,34,0.12)]"
        aria-label={`打开 ${item.date}`}
        data-testid="diary-search-card"
      >
        <p className="inline-flex w-fit max-w-full items-center rounded-full border border-[#d6cfb5] bg-[#f3ecd4] px-2.5 py-[2px] text-[13px] font-semibold leading-none text-[#2f3834]">
          {item.date}
        </p>
        <p className="mt-[5px] w-full text-[13px] leading-[1.3] text-[#4f5b63]" style={snippetSingleLineStyle}>
          {renderHighlightedSnippet(item.snippet, keyword)}
        </p>
      </button>
    </div>
  )
}

function SearchStateBox({ text, testId, style }: { text: string; testId: string; style: CSSProperties }) {
  return (
    <div
      className="rounded-[11px] border border-dashed border-[#cec9bc] bg-[#f3f1ea] p-3 text-sm text-[#66645f]"
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
    <div className="flex h-full min-h-0 flex-col gap-2.5" aria-label="diary-search-panel">
      <div className="rounded-[13px] border border-[#d2cec3] bg-[linear-gradient(180deg,#f8f5ec_0%,#ebe7dc_100%)] p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#5c5a53]">
            <span aria-hidden="true">⌕</span>
            日记搜索
          </p>
          <span className="rounded-full border border-[#d2ccb8] bg-[#f7f2df] px-2 py-0.5 text-[11px] text-[#5f583f]">
            {hasKeyword ? `命中 ${result.totalMatched}` : '等待输入'}
          </span>
        </div>

        <div className="relative">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-[#7d7a72]"
          >
            ⌕
          </span>
          <input
            type="text"
            value={keyword}
            onChange={(event) => onKeywordChange(event.target.value)}
            placeholder="输入关键词搜索日记内容"
            className="w-full rounded-[10px] border border-[#cbc6ba] bg-white px-3 py-2 pl-8 text-sm text-[#2f3a36] outline-none transition focus:border-[#4f5a53] focus:ring-2 focus:ring-[#d8ddd5]"
            data-testid="diary-search-input"
            aria-label="日记搜索输入"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {isSearching && hasKeyword ? <SearchStateBox text="正在搜索..." testId="diary-search-loading" style={listStyle} /> : null}

        {!isSearching && !hasKeyword ? (
          <SearchStateBox text="输入关键词开始搜索。" testId="diary-search-empty" style={listStyle} />
        ) : null}

        {!isSearching && hasKeyword && result.items.length === 0 ? (
          <SearchStateBox text={`未找到包含“${normalizedKeyword}”的日记。`} testId="diary-search-empty" style={listStyle} />
        ) : null}

        {!isSearching && hasKeyword && result.items.length > 0 ? (
          <div className={isCompactResult ? 'space-y-1.5' : 'flex h-full min-h-0 flex-col gap-1.5'}>
            {result.truncated ? (
              <p className="text-[11px] text-[#7a725f]" data-testid="diary-search-truncated">
                结果较多，仅展示前 {result.returnedCount} 条。
              </p>
            ) : (
              <p className="text-[11px] text-[#7a725f]">共命中 {result.totalMatched} 条记录。</p>
            )}

            <div className="rounded-[12px] border border-[#ddd9cd] bg-[linear-gradient(180deg,#f8f7f2_0%,#f1efe6_100%)] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
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
          </div>
        ) : null}
      </div>
    </div>
  )
}
