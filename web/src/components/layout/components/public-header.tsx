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
import { ArrowRight, Menu, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BrandMark } from '@/components/brand-mark'
import { Dialog } from '@/components/dialog'
import { LanguageSwitcher } from '@/components/language-switcher'
import { NotificationPopover } from '@/components/notification-popover'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useNotifications } from '@/hooks/use-notifications'
import { useSystemConfig } from '@/hooks/use-system-config'
import { useTopNavLinks } from '@/hooks/use-top-nav-links'
import { PRODUCT_NAME } from '@/lib/product-brand'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import { defaultTopNavLinks } from '../config/top-nav.config'
import type { TopNavLink } from '../types'
import { CommunityHelp } from './community-help'

const AUTH_PROMPT_SECONDS = 5

type AuthPromptTarget = {
  title: string
  href: string
}

export interface PublicHeaderProps {
  navLinks?: TopNavLink[]
  mobileLinks?: TopNavLink[]
  navContent?: React.ReactNode
  showThemeSwitch?: boolean
  showLanguageSwitcher?: boolean
  logo?: React.ReactNode
  siteName?: string
  homeUrl?: string
  leftContent?: React.ReactNode
  rightContent?: React.ReactNode
  showNavigation?: boolean
  showAuthButtons?: boolean
  showNotifications?: boolean
  className?: string
}

/**
 * Header for backend-configured public pages (pricing, rankings, about).
 * Navigation links come from the operator's HeaderNavModules setting.
 */
export function PublicHeader(props: PublicHeaderProps) {
  const {
    navLinks = defaultTopNavLinks,
    showThemeSwitch = true,
    showLanguageSwitcher = true,
    logo: customLogo,
    homeUrl = '/',
    showAuthButtons = true,
    showNotifications = true,
  } = props

  const { t } = useTranslation()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [authPromptTarget, setAuthPromptTarget] =
    useState<AuthPromptTarget | null>(null)
  const [authPromptSecondsLeft, setAuthPromptSecondsLeft] =
    useState(AUTH_PROMPT_SECONDS)
  const { auth } = useAuthStore()
  const { loading } = useSystemConfig()
  const dynamicLinks = useTopNavLinks({ surface: 'public' })
  const notifications = useNotifications()
  const routerState = useRouterState()
  const pathname = routerState.location.pathname

  const user = auth.user
  const isAuthenticated = !!user
  const shouldShowNotifications = showNotifications && isAuthenticated
  const links = dynamicLinks.length > 0 ? dynamicLinks : navLinks

  useEffect(() => {
    if (!authPromptTarget) return

    const intervalId = window.setInterval(() => {
      setAuthPromptSecondsLeft((seconds) => Math.max(seconds - 1, 0))
    }, 1000)

    const timeoutId = window.setTimeout(() => {
      const redirect = authPromptTarget.href
      setAuthPromptTarget(null)
      navigate({ to: '/sign-in', search: { redirect } })
    }, AUTH_PROMPT_SECONDS * 1000)

    return () => {
      window.clearInterval(intervalId)
      window.clearTimeout(timeoutId)
    }
  }, [authPromptTarget, navigate])

  const closeAuthPrompt = useCallback(() => {
    setAuthPromptTarget(null)
    setAuthPromptSecondsLeft(AUTH_PROMPT_SECONDS)
  }, [])

  const navigateToSignIn = useCallback(() => {
    const redirect = authPromptTarget?.href || '/'
    setAuthPromptTarget(null)
    navigate({ to: '/sign-in', search: { redirect } })
  }, [authPromptTarget?.href, navigate])

  const logoContent: React.ReactNode = customLogo ?? (
    <BrandMark size={30} withWordmark />
  )

  let desktopAuthContent: React.ReactNode = (
    <>
      <Link to='/sign-in' className='ed-btn ed-btn--ghost ed-btn--sm'>
        {t('Sign in')}
      </Link>
      <Link to='/sign-up' className='ed-btn ed-btn--sm'>
        {t('Start saving')}
        <ArrowRight aria-hidden='true' />
      </Link>
    </>
  )
  if (loading) {
    desktopAuthContent = <Skeleton className='h-8 w-20 rounded-full' />
  } else if (isAuthenticated) {
    desktopAuthContent = <ProfileDropdown />
  }

  const handleNavLinkClick = useCallback(
    (
      event: React.MouseEvent<HTMLAnchorElement>,
      link: TopNavLink,
      closeMobile = false
    ) => {
      if (link.disabled) {
        event.preventDefault()
        return
      }

      if (link.requiresAuth) {
        event.preventDefault()
        if (closeMobile) {
          setMobileOpen(false)
        }
        setAuthPromptSecondsLeft(AUTH_PROMPT_SECONDS)
        setAuthPromptTarget({
          title: t(link.title),
          href: link.href,
        })
        return
      }

      if (closeMobile) {
        setMobileOpen(false)
      }
    },
    [t]
  )

  const renderLink = (link: TopNavLink, closeMobile: boolean) => {
    const isActive = pathname === link.href
    const linkKey = `${link.href}-${link.title}`
    const className = cn('ed-navLink', isActive && 'is-active')
    if (link.external) {
      return (
        <a
          key={linkKey}
          href={link.href}
          target='_blank'
          rel='noopener noreferrer'
          aria-disabled={link.disabled}
          tabIndex={link.disabled ? -1 : undefined}
          onClick={(event) => handleNavLinkClick(event, link, closeMobile)}
          className={className}
        >
          {t(link.title)}
        </a>
      )
    }
    return (
      <Link
        key={linkKey}
        to={link.href}
        disabled={link.disabled}
        aria-current={isActive ? 'page' : undefined}
        onClick={(event) => handleNavLinkClick(event, link, closeMobile)}
        className={className}
      >
        {t(link.title)}
      </Link>
    )
  }

  return (
    <>
      <header className='ed-header'>
        <div className='ed-container ed-headerInner'>
          <Link
            to={homeUrl}
            className='ed-brand'
            aria-label={`${PRODUCT_NAME} home`}
          >
            {logoContent}
          </Link>

          <nav
            className={cn('ed-nav', mobileOpen && 'is-open')}
            aria-label={t('Main navigation')}
          >
            {links.map((link) => renderLink(link, false))}
            {mobileOpen ? (
              <div className='ed-mobileNav'>
                {links.map((link) => renderLink(link, true))}
                {showAuthButtons ? (
                  <div className='ed-mobileNavActions'>
                    {!isAuthenticated ? (
                      <Link
                        to='/sign-up'
                        className='ed-btn ed-btn--accent'
                        onClick={() => setMobileOpen(false)}
                      >
                        {t('Start saving')}
                      </Link>
                    ) : null}
                    <Link
                      to={isAuthenticated ? '/dashboard' : '/sign-in'}
                      className='ed-btn ed-btn--outline'
                      onClick={() => setMobileOpen(false)}
                    >
                      {isAuthenticated ? t('Go to Dashboard') : t('Sign in')}
                    </Link>
                  </div>
                ) : null}
              </div>
            ) : null}
          </nav>

          <div className='ed-headerActions'>
            <CommunityHelp variant='header' />
            {showLanguageSwitcher && <LanguageSwitcher />}
            {showThemeSwitch && <ThemeSwitch />}
            {shouldShowNotifications && (
              <NotificationPopover
                open={notifications.popoverOpen}
                onOpenChange={notifications.setPopoverOpen}
                unreadCount={notifications.unreadCount}
                activeTab={notifications.activeTab}
                onTabChange={notifications.setActiveTab}
                notice={notifications.notice}
                announcements={notifications.announcements}
                loading={notifications.loading}
              />
            )}
            {showAuthButtons && (
              <div className='ed-headerActions ed-headerActions--desktop'>
                <span className='ed-headerDivider' aria-hidden='true' />
                {desktopAuthContent}
              </div>
            )}
            {showAuthButtons && !loading && isAuthenticated ? (
              <span className='sm:hidden'>
                <ProfileDropdown />
              </span>
            ) : null}
            <Button
              type='button'
              variant='ghost'
              size='icon'
              className='ed-menuButton size-9 rounded-full'
              onClick={() => setMobileOpen((value) => !value)}
              aria-label={t('Toggle navigation menu')}
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X /> : <Menu />}
            </Button>
          </div>
        </div>
      </header>

      <Dialog
        open={!!authPromptTarget}
        onOpenChange={(open) => {
          if (!open) {
            closeAuthPrompt()
          }
        }}
        title={t('Sign in required')}
        description={t('Please sign in to view {{module}}.', {
          module: authPromptTarget?.title || '',
        })}
        contentClassName='sm:max-w-md'
        contentHeight='auto'
        footer={
          <>
            <Button variant='outline' onClick={closeAuthPrompt}>
              {t('Cancel')}
            </Button>
            <Button onClick={navigateToSignIn}>{t('Sign in now')}</Button>
          </>
        }
      >
        <div className='bg-muted/40 text-muted-foreground rounded-lg px-3 py-2 text-sm'>
          {t('Redirecting to sign in in {{seconds}} seconds.', {
            seconds: authPromptSecondsLeft,
          })}
        </div>
      </Dialog>
    </>
  )
}
