import { useMemo, type CSSProperties } from 'react'
import { List, type RowComponentProps } from 'react-window'
import type { DateString, DiarySearchResult, DiarySearchResultItem } from '../../types/diary'

const SEARCH_ROW_HEIGHT = 68
const SEARCH_INPUT_BLOCK_HEIGHT = 50

interface SearchRowProps {
  items: DiarySearchResultItem[]
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

function SearchRow({ index, style, items, onSelectDate }: RowComponentProps<SearchRowProps>) {
  const item = items[index]

  return (
    <div style={style} className="px-0.5 py-0.5">
      <button
        type="button"
        onClick={() => onSelectDate(item.date)}
        className="flex h-full w-full flex-col rounded-[10px] border border-td-line bg-td-surface px-3 py-1 text-left transition hover:border-[#c6c5c1] hover:bg-[#fcfcfb]"
        aria-label={`打开 ${item.date}`}
        data-testid="diary-search-card"
      >
        <p className="inline-flex w-fit max-w-full items-center rounded-full border border-[#d8d6cf] bg-[#f5f3ed] px-2 py-[2px] text-sm font-medium leading-none text-td-text">
          {item.date}
        </p>
        <p className="mt-px w-full text-[13px] leading-[1.3] text-td-muted" style={snippetSingleLineStyle}>
          {item.snippet}
        </p>
      </button>
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
  const listViewportHeight = useMemo(
    () => Math.max(viewportHeight - SEARCH_INPUT_BLOCK_HEIGHT, 96),
    [viewportHeight],
  )
  const listStyle = useMemo<CSSProperties>(() => ({ height: listViewportHeight, width: '100%' }), [listViewportHeight])

  return (
    <div className="flex h-full min-h-0 flex-col gap-2" aria-label="diary-search-panel">
      <div>
        <input
          type="text"
          value={keyword}
          onChange={(event) => onKeywordChange(event.target.value)}
          placeholder="输入关键词搜索日记内容"
          className="w-full rounded-[10px] border border-[#d8d6cf] bg-white px-3 py-2 text-sm text-td-text outline-none transition focus:border-[#4f5a53] focus:ring-2 focus:ring-[#cfd8d1]"
          data-testid="diary-search-input"
          aria-label="日记搜索输入"
        />
      </div>

      <div className="min-h-0 flex-1">
        {isSearching && hasKeyword ? (
          <div
            className="rounded-[10px] border border-td-line bg-td-soft p-3 text-sm text-td-muted"
            style={listStyle}
            data-testid="diary-search-loading"
          >
            正在搜索...
          </div>
        ) : null}

        {!isSearching && !hasKeyword ? (
          <div
            className="rounded-[10px] border border-dashed border-td-line bg-td-soft p-3 text-sm text-td-muted"
            style={listStyle}
            data-testid="diary-search-empty"
          >
            输入关键词开始搜索。
          </div>
        ) : null}

        {!isSearching && hasKeyword && result.items.length === 0 ? (
          <div
            className="rounded-[10px] border border-dashed border-td-line bg-td-soft p-3 text-sm text-td-muted"
            style={listStyle}
            data-testid="diary-search-empty"
          >
            未找到包含“{normalizedKeyword}”的日记。
          </div>
        ) : null}

        {!isSearching && hasKeyword && result.items.length > 0 ? (
          <div className="flex h-full min-h-0 flex-col gap-1.5">
            {result.truncated ? (
              <p className="text-[11px] text-[#7a725f]" data-testid="diary-search-truncated">
                结果较多，仅展示前 {result.returnedCount} 条。
              </p>
            ) : (
              <p className="text-[11px] text-[#7a725f]">
                共命中 {result.totalMatched} 条记录。
              </p>
            )}
            <List
              rowCount={result.items.length}
              rowHeight={SEARCH_ROW_HEIGHT}
              rowComponent={SearchRow}
              rowProps={{ items: result.items, onSelectDate }}
              defaultHeight={listViewportHeight}
              overscanCount={4}
              className="rounded-[10px] bg-transparent"
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
