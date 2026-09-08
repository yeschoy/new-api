/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import {
  BookOpen,
  Boxes,
  ChevronDown,
  FileText,
  KeyRound,
  LayoutGrid,
  List,
  LogOut,
  MessageSquare,
  Moon,
  PanelLeft,
  Plus,
  Search,
  Settings,
  Sun,
  UserRound,
  Wallet,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { LanguageSwitcher } from '@/components/language-switcher'
import { SignOutDialog } from '@/components/sign-out-dialog'
import { useTheme } from '@/context/theme-provider'
import { CiMark } from '@/features/home/components/ci-mark'
import { useUserDisplay } from '@/hooks/use-user-display'
import { formatConsoleMoney } from '@/lib/console-money'
import {
  CONSOLE_NAV,
  CONSOLE_NAV_GROUPS,
  consoleNavPath,
  isConsoleNavActive,
} from '@/lib/console-nav'
import { ROLE } from '@/lib/roles'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'
import { useConsoleModeStore } from '@/stores/console-mode-store'
import { useSystemConfigStore } from '@/stores/system-config-store'

import { CommunityHelp } from './community-help'
import { DocsSearch } from './docs-search'

const NAV_ICONS = {
  overview: LayoutGrid,
  requests: List,
  models: Boxes,
  reports: FileText,
  playground: MessageSquare,
  keys: KeyRound,
  billing: Wallet,
  docs: BookOpen,
} as const

const SIDEBAR_STORAGE_KEY = 'ci_sidebar_collapsed'

type TerminalLayoutProps = {
  children: React.ReactNode
}

function isCompactViewport(): boolean {
  return window.matchMedia('(max-width: 900px)').matches
}

function readCollapsed(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const stored = window.localStorage.getItem(SIDEBAR_STORAGE_KEY)
    if (stored === 'true') return true
    if (stored === 'false' && !isCompactViewport()) return false
  } catch {
    /* ignore */
  }
  return isCompactViewport()
}

export function TerminalLayout(props: TerminalLayoutProps) {
  const { t } = useTranslation()
  const { resolvedTheme, setTheme } = useTheme()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.auth.user)
  const setMode = useConsoleModeStore((state) => state.setMode)
  const { displayName, secondaryText, initials } = useUserDisplay(user)
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [query, setQuery] = useState('')
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [signOutOpen, setSignOutOpen] = useState(false)
  const isDark = resolvedTheme === 'dark'
  const isAdmin = Boolean(user?.role && user.role >= ROLE.ADMIN)
  const remainQuota = Number(user?.quota ?? 0)
  const quotaPerUnit = useSystemConfigStore(
    (state) => state.config.currency.quotaPerUnit
  )
  const remainYuan = remainQuota / Math.max(quotaPerUnit || 500000, 1)
  const showBalanceCard = !collapsed && (remainQuota <= 0 || remainYuan < 20)
  const isPlayground = pathname.startsWith('/playground')
  const handleLabel = secondaryText || displayName

  const visibleNav = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return CONSOLE_NAV
    return CONSOLE_NAV.filter((item) => {
      const translated = t(item.title).toLowerCase()
      return (
        item.title.toLowerCase().includes(needle) || translated.includes(needle)
      )
    })
  }, [query, t])

  useEffect(() => {
    if (isCompactViewport()) setCollapsed(true)
  }, [pathname])

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current
      try {
        if (!isCompactViewport()) {
          window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next))
        }
      } catch {
        /* ignore */
      }
      return next
    })
  }

  return (
    <div
      className={cn(
        'ci-landing ci-theme ci-app',
        collapsed && 'ci-app--collapsed'
      )}
      data-theme={isDark ? 'dark' : 'light'}
    >
      <aside className='ci-appSidebar'>
        {user ? (
          <Link
            to='/dashboard/$section'
            params={{ section: 'overview' }}
            className='ci-appBrand'
          >
            <CiMark size={22} withWordmark={!collapsed} />
          </Link>
        ) : (
          <Link to='/' className='ci-appBrand'>
            <CiMark size={22} withWordmark={!collapsed} />
          </Link>
        )}
        <label className='ci-appSearch'>
          <Search size={14} />
          {collapsed ? null : (
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('Search')}
              aria-label={t('Search')}
            />
          )}
        </label>
        <nav className='ci-appNav' aria-label={t('Workspace')}>
          {CONSOLE_NAV_GROUPS.map((group) => {
            const items = visibleNav.filter((item) => item.group === group.id)
            if (items.length === 0) return null
            return (
              <div key={group.id} className='ci-appNavGroup'>
                {group.label && !collapsed ? (
                  <p className='ci-appNavLabel'>{t(group.label)}</p>
                ) : null}
                {items.map((item) => {
                  const Icon = NAV_ICONS[item.id as keyof typeof NAV_ICONS]
                  const path = consoleNavPath(item.href)
                  const active = isConsoleNavActive(pathname, item.href)
                  const className = cn('ci-appNavItem', active && 'is-active')
                  if (path === '/usage-logs/common') {
                    return (
                      <Link
                        key={item.id}
                        to='/usage-logs/$section'
                        params={{ section: 'common' }}
                        className={className}
                        title={t(item.title)}
                      >
                        <Icon size={16} />
                        {collapsed ? null : <span>{t(item.title)}</span>}
                      </Link>
                    )
                  }
                  if (path === '/dashboard/overview') {
                    return (
                      <Link
                        key={item.id}
                        to='/dashboard/$section'
                        params={{ section: 'overview' }}
                        className={className}
                        title={t(item.title)}
                      >
                        <Icon size={16} />
                        {collapsed ? null : <span>{t(item.title)}</span>}
                      </Link>
                    )
                  }
                  if (path === '/dashboard/reports') {
                    return (
                      <Link
                        key={item.id}
                        to='/dashboard/$section'
                        params={{ section: 'reports' }}
                        className={className}
                        title={t(item.title)}
                      >
                        <Icon size={16} />
                        {collapsed ? null : <span>{t(item.title)}</span>}
                      </Link>
                    )
                  }
                  if (path === '/pricing') {
                    return (
                      <Link
                        key={item.id}
                        to='/pricing'
                        className={className}
                        title={t(item.title)}
                      >
                        <Icon size={16} />
                        {collapsed ? null : <span>{t(item.title)}</span>}
                      </Link>
                    )
                  }
                  if (path === '/playground') {
                    return (
                      <Link
                        key={item.id}
                        to='/playground'
                        className={className}
                        title={t(item.title)}
                      >
                        <Icon size={16} />
                        {collapsed ? null : <span>{t(item.title)}</span>}
                      </Link>
                    )
                  }
                  if (path === '/keys') {
                    return (
                      <Link
                        key={item.id}
                        to='/keys'
                        className={className}
                        title={t(item.title)}
                      >
                        <Icon size={16} />
                        {collapsed ? null : <span>{t(item.title)}</span>}
                      </Link>
                    )
                  }
                  if (path === '/wallet') {
                    return (
                      <Link
                        key={item.id}
                        to='/wallet'
                        hash={item.href.includes('#') ? 'redeem' : undefined}
                        className={className}
                        title={t(item.title)}
                      >
                        <Icon size={16} />
                        {collapsed ? null : <span>{t(item.title)}</span>}
                      </Link>
                    )
                  }
                  return (
                    <Link
                      key={item.id}
                      to='/guide'
                      className={className}
                      title={t(item.title)}
                    >
                      <Icon size={16} />
                      {collapsed ? null : <span>{t(item.title)}</span>}
                    </Link>
                  )
                })}
              </div>
            )
          })}
        </nav>
        <div className='ci-appSidebarFooter'>
          {showBalanceCard ? (
            <div className='ci-appBalance'>
              <div className='ci-appBalanceRow'>
                <span>{t('Balance')}</span>
                <strong className={remainQuota <= 0 ? 'is-empty' : undefined}>
                  {formatConsoleMoney(remainQuota)}
                </strong>
              </div>
              <p>
                {remainQuota <= 0
                  ? t('Balance is empty. Top up or requests will fail.')
                  : t('Balance is getting low. Top up when you can.')}
              </p>
              <Link
                to='/wallet'
                hash='topup'
                className='ci-button ci-button--outline ci-button--size-xs ci-appTopup'
              >
                <Plus size={14} />
                {t('Top up')}
              </Link>
            </div>
          ) : null}
          <div className='ci-appUserWrap'>
            <button
              type='button'
              className='ci-appUser'
              onClick={() => setUserMenuOpen((open) => !open)}
            >
              <span className='ci-appUserMark'>{initials.slice(0, 1)}</span>
              {collapsed ? null : (
                <>
                  <span className='ci-appUserName'>{handleLabel}</span>
                  <ChevronDown size={14} />
                </>
              )}
            </button>
            {userMenuOpen ? (
              <div className='ci-appUserMenu'>
                <button
                  type='button'
                  onClick={() => {
                    setUserMenuOpen(false)
                    void navigate({ to: '/profile' })
                  }}
                >
                  <UserRound size={14} />
                  {t('Profile')}
                </button>
                {isAdmin ? (
                  <button
                    type='button'
                    onClick={() => {
                      setUserMenuOpen(false)
                      setMode('developer')
                      void navigate({ to: '/channels' })
                    }}
                  >
                    <Settings size={14} />
                    {t('Operator')}
                  </button>
                ) : null}
                <button
                  type='button'
                  onClick={() => {
                    setUserMenuOpen(false)
                    setSignOutOpen(true)
                  }}
                >
                  <LogOut size={14} />
                  {t('Sign out')}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </aside>
      {!collapsed ? (
        <button
          type='button'
          className='ci-appBackdrop'
          aria-label={t('Collapse sidebar')}
          onClick={() => setCollapsed(true)}
        />
      ) : null}
      <div className='ci-appFrame'>
        <header className='ci-appTopbar'>
          <button
            type='button'
            className='ci-appIconBtn'
            aria-label={collapsed ? t('Expand sidebar') : t('Collapse sidebar')}
            onClick={toggleCollapsed}
          >
            <PanelLeft size={16} />
          </button>
          <DocsSearch />
          <div className='ci-appTopbarRight'>
            <span className='ci-appUsd'>¥</span>
            <LanguageSwitcher />
            <button
              type='button'
              className='ci-appIconBtn'
              aria-label={
                isDark ? 'Switch to light theme' : 'Switch to dark theme'
              }
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
            >
              {isDark ? <Moon size={16} /> : <Sun size={16} />}
            </button>
            <CommunityHelp />
          </div>
        </header>
        <div className={cn('ci-appMain', isPlayground && 'ci-appMain--flush')}>
          {props.children}
        </div>
      </div>
      <SignOutDialog open={signOutOpen} onOpenChange={setSignOutOpen} />
    </div>
  )
}
