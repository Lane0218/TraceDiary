import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

type AppHeaderPage = 'diary' | 'yearly' | 'insights' | 'settings'

export interface AppHeaderAuthEntry {
  sessionEmail: string | null
  isSigningOut?: boolean
  onOpenAuthModal: () => void
  onSignOut: () => void
  onSwitchAccount: () => void
}

interface AppHeaderProps {
  currentPage: AppHeaderPage
  yearlyHref: string
  guestMode?: {
    enabled: boolean
    description?: string
  }
  authEntry?: AppHeaderAuthEntry
}

interface HeaderNavItem {
  id: AppHeaderPage
  label: string
  to: string
}

function getEmailAlias(email: string): string {
  const prefix = email.split('@')[0]?.trim()
  if (prefix) {
    return prefix
  }
  return email.trim()
}

export default function AppHeader({ currentPage, yearlyHref, guestMode, authEntry }: AppHeaderProps) {
  const navigate = useNavigate()
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const accountMenuRef = useRef<HTMLDivElement | null>(null)
  const sessionEmail = authEntry?.sessionEmail?.trim() ?? ''
  const isSignedIn = sessionEmail.length > 0
  const emailAlias = useMemo(() => {
    if (!sessionEmail) {
      return ''
    }
    return getEmailAlias(sessionEmail)
  }, [sessionEmail])
  const guestModeDescription = guestMode?.description?.trim() ?? ''

  useEffect(() => {
    if (!accountMenuOpen) {
      return
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Node)) {
        return
      }
      if (!accountMenuRef.current?.contains(target)) {
        setAccountMenuOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setAccountMenuOpen(false)
      }
    }

    window.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleEscape)
    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [accountMenuOpen])

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
            {guestModeDescription ? (
              <>
                <span className="td-guest-pill-sep" aria-hidden="true">/</span>
                <span className="td-guest-pill-desc">{guestModeDescription}</span>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
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

        {authEntry ? (
          <div className="relative" ref={accountMenuRef}>
            {!isSignedIn ? (
              <button
                type="button"
                className="td-btn td-btn-primary-ink min-w-[108px] text-sm"
                onClick={authEntry.onOpenAuthModal}
                data-testid="app-header-auth-trigger"
              >
                登录 / 注册
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="td-btn inline-flex min-w-[124px] items-center gap-2 border-[#d2ccc0] bg-[#fffdfa] px-2 py-1.5"
                  onClick={() => setAccountMenuOpen((prev) => !prev)}
                  aria-expanded={accountMenuOpen}
                  aria-haspopup="menu"
                  data-testid="app-header-account-trigger"
                >
                  <span
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#d2ccc0] bg-white text-xs font-semibold text-[#3f4742]"
                    aria-hidden="true"
                  >
                    {(emailAlias[0] ?? 'U').toUpperCase()}
                  </span>
                  <span className="hidden min-w-0 flex-1 truncate text-left text-xs text-[#4a4a4a] sm:inline">
                    {emailAlias}
                  </span>
                </button>
                {accountMenuOpen ? (
                  <div
                    className="absolute right-0 top-[calc(100%+8px)] z-30 w-[280px] rounded-[14px] border border-[#ddd6c8] bg-[#fffefa] p-3 shadow-card"
                    role="menu"
                    aria-label="账号菜单"
                  >
                    <div className="rounded-[10px] border border-[#e7e1d5] bg-white px-3 py-2">
                      <p className="text-[11px] text-[#6f6a60]">当前账号</p>
                      <p
                        className="mt-1 truncate text-sm font-medium text-[#292724]"
                        data-testid="app-header-account-email"
                      >
                        {sessionEmail}
                      </p>
                    </div>
                    <div className="mt-3 flex flex-col gap-2">
                      <button
                        type="button"
                        className="td-btn justify-center border-[#d9d3c7] bg-white text-sm"
                        onClick={() => {
                          setAccountMenuOpen(false)
                          authEntry.onSwitchAccount()
                        }}
                        role="menuitem"
                        data-testid="app-header-account-switch-btn"
                      >
                        切换账号
                      </button>
                      <button
                        type="button"
                        className="td-btn justify-center border-[#efc6c6] bg-[#fff5f5] text-sm text-[#a63f3f]"
                        onClick={() => {
                          setAccountMenuOpen(false)
                          authEntry.onSignOut()
                        }}
                        role="menuitem"
                        disabled={authEntry.isSigningOut}
                        data-testid="app-header-account-signout-btn"
                      >
                        {authEntry.isSigningOut ? '退出中...' : '退出登录'}
                      </button>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </div>
    </header>
  )
}
