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
import { Link } from '@tanstack/react-router'
import {
  ArrowRight,
  BookOpen,
  Boxes,
  Menu,
  MonitorDown,
  Moon,
  Sun,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BrandMark } from '@/components/brand-mark'
import { LanguageSwitcher } from '@/components/language-switcher'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { useTheme } from '@/context/theme-provider'
import { PRODUCT_NAME } from '@/lib/product-brand'
import { cn } from '@/lib/utils'

import { CommunityHelp } from './community-help'

type MarketingHeaderProps = {
  isAuthenticated: boolean
  currentPage?: 'home' | 'client'
}

/** Sticky header for the public marketing pages. */
export function MarketingHeader(props: MarketingHeaderProps) {
  const { t } = useTranslation()
  const { resolvedTheme, setTheme } = useTheme()
  const [navOpen, setNavOpen] = useState(false)
  const primaryTo = props.isAuthenticated ? '/dashboard' : '/sign-up'
  const primaryLabel = props.isAuthenticated ? t('Overview') : t('Start saving')
  const isDark = resolvedTheme === 'dark'
  const closeNav = () => setNavOpen(false)

  const links = (
    <>
      <a className='ed-navLink' href='/#models' onClick={closeNav}>
        <Boxes className='size-4 sm:hidden' aria-hidden='true' />
        <span>{t('Models')}</span>
      </a>
      {props.isAuthenticated ? (
        <Link className='ed-navLink' to='/guide' onClick={closeNav}>
          <BookOpen className='size-4 sm:hidden' aria-hidden='true' />
          <span>{t('Docs')}</span>
        </Link>
      ) : null}
      <Link
        className='ed-navLink'
        to='/client'
        aria-current={props.currentPage === 'client' ? 'page' : undefined}
        onClick={closeNav}
      >
        <MonitorDown className='size-4 sm:hidden' aria-hidden='true' />
        <span>{t('Client')}</span>
      </Link>
    </>
  )

  return (
    <header className='ed-header'>
      <div className='ed-container ed-headerInner'>
        <a className='ed-brand' aria-label={`${PRODUCT_NAME} home`} href='/#top'>
          <BrandMark size={30} withWordmark />
        </a>

        <nav
          id='main-navigation'
          className={cn('ed-nav', navOpen && 'is-open')}
          aria-label={t('Main navigation')}
        >
          {links}
          {navOpen ? (
            <div className='ed-mobileNav'>
              {links}
              <div className='ed-mobileNavActions'>
                {!props.isAuthenticated ? (
                  <Link
                    to='/sign-in'
                    className='ed-btn ed-btn--outline'
                    onClick={closeNav}
                  >
                    {t('Sign in')}
                  </Link>
                ) : null}
                <Link
                  to={primaryTo}
                  className='ed-btn ed-btn--accent'
                  onClick={closeNav}
                >
                  {primaryLabel}
                </Link>
              </div>
            </div>
          ) : null}
        </nav>

        <div className='ed-headerActions'>
          <button
            className='ed-iconBtn'
            type='button'
            aria-label={
              isDark ? t('Switch to light theme') : t('Switch to dark theme')
            }
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
          >
            {isDark ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <LanguageSwitcher />
          <CommunityHelp variant='header' />
          {props.isAuthenticated ? <ProfileDropdown /> : null}
          <div className='ed-headerActions ed-headerActions--desktop'>
            <span className='ed-headerDivider' aria-hidden='true' />
            {!props.isAuthenticated ? (
              <Link to='/sign-in' className='ed-btn ed-btn--ghost ed-btn--sm'>
                {t('Sign in')}
              </Link>
            ) : null}
            <Link to={primaryTo} className='ed-btn ed-btn--sm'>
              {primaryLabel}
              <ArrowRight aria-hidden='true' />
            </Link>
          </div>
          <button
            className='ed-iconBtn ed-menuButton'
            type='button'
            aria-label={t('Open navigation')}
            aria-expanded={navOpen}
            aria-controls='main-navigation'
            onClick={() => setNavOpen((value) => !value)}
          >
            {navOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>
    </header>
  )
}
