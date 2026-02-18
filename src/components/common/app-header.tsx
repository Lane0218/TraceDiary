import { useNavigate } from 'react-router-dom'

type AppHeaderPage = 'diary' | 'yearly' | 'insights' | 'settings'

interface AppHeaderProps {
  currentPage: AppHeaderPage
  yearlyHref: string
  guestMode?: {
    enabled: boolean
    description?: string
    ctaHref?: string
    ctaLabel?: string
  }
}

interface HeaderNavItem {
  id: AppHeaderPage
  label: string
  to: string
}

export default function AppHeader({ currentPage, yearlyHref, guestMode }: AppHeaderProps) {
  const navigate = useNavigate()
  const navItems: HeaderNavItem[] = [
    {
      id: 'diary',
      label: '日记',
      to: '/diary',
    },
    {
      id: 'yearly',
      label: '年度总结',
      to: yearlyHref,
    },
    {
      id: 'insights',
      label: '数据统计',
      to: '/insights',
    },
    {
      id: 'settings',
      label: '设置',
      to: '/settings',
    },
  ]

  return (
    <header className="sticky top-0 z-10 flex min-h-[68px] flex-wrap items-center justify-between gap-3 border-b border-td-line bg-td-bg/95 py-3 backdrop-blur-sm">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <h1 className="font-display text-2xl text-td-text">TraceDiary</h1>
        {guestMode?.enabled ? (
          <div className="td-guest-pill" data-testid="guest-mode-pill" aria-label="演示模式提示">
            <span className="td-guest-pill-dot" aria-hidden="true" />
            <span>演示模式</span>
            <span className="td-guest-pill-sep" aria-hidden="true">/</span>
            <span className="td-guest-pill-desc">{guestMode.description ?? '只读'}</span>
            {guestMode.ctaHref ? (
              <button
                type="button"
                className="td-guest-pill-cta"
                data-testid="guest-start-button"
                onClick={() => {
                  navigate(guestMode.ctaHref as string)
                }}
              >
                {guestMode.ctaLabel ?? '开始使用我的数据'}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      <nav className="flex flex-wrap items-center gap-2" aria-label="应用主导航">
        {navItems.map((item) => {
          const isActive = item.id === currentPage
          return (
            <button
              key={item.id}
              type="button"
              className={`td-btn ${
                isActive
                  ? 'border-[#3f4742] bg-[#3f4742] text-white hover:border-[#333a36] hover:bg-[#333a36] hover:shadow-none'
                  : ''
              }`}
              data-testid={`app-nav-${item.id}`}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => {
                navigate(item.to)
              }}
            >
              {item.label}
            </button>
          )
        })}
      </nav>
    </header>
  )
}
