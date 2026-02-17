import type { TocHeadingItem } from '../../utils/markdown-toc'

interface YearlyTocProps {
  items: TocHeadingItem[]
  activeId: string | null
  onSelect: (item: TocHeadingItem) => void
}

function resolveIndentClass(level: TocHeadingItem['level']): string {
  if (level === 1) {
    return 'pl-0'
  }
  if (level === 2) {
    return 'pl-3'
  }
  return 'pl-6'
}

export default function YearlyToc({ items, activeId, onSelect }: YearlyTocProps) {
  return (
    <div className="lg:flex lg:h-full lg:min-h-0 lg:flex-col" data-testid="yearly-toc">
      <h2 className="text-sm font-semibold text-td-text">目录</h2>

      {items.length === 0 ? (
        <p className="mt-2 rounded-[10px] border border-dashed border-[#d9d7d2] bg-[#f8f7f3] px-3 py-3 text-xs leading-5 text-td-muted">
          暂无目录
        </p>
      ) : (
        <div className="mt-2 space-y-1 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
          {items.map((item) => {
            const active = item.id === activeId
            return (
              <div key={item.id} className={resolveIndentClass(item.level)}>
                <button
                  type="button"
                  className={`w-full rounded-[8px] border px-2.5 py-1.5 text-left text-sm leading-5 transition ${
                    active
                      ? 'border-[#7d7768] bg-[#f1efe8] text-td-text'
                      : 'border-transparent text-td-muted hover:border-[#dbd8cf] hover:bg-[#f8f7f3] hover:text-td-text'
                  }`}
                  aria-current={active ? 'location' : undefined}
                  onClick={() => onSelect(item)}
                >
                  {item.text}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
