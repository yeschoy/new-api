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
import { ArrowLeft, Moon, Sun } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { BrandMark } from '@/components/brand-mark'
import { LanguageSwitcher } from '@/components/language-switcher'
import { CommunityHelp } from '@/components/layout/components/community-help'
import { useTheme } from '@/context/theme-provider'
import { useTopNavLinks } from '@/hooks/use-top-nav-links'
import { PRODUCT_NAME } from '@/lib/product-brand'

type AccessAuthLayoutProps = {
  title?: React.ReactNode
  description?: string
  children: React.ReactNode
}

/** Two-column editorial frame shared by sign-in, sign-up and recovery. */
export function AccessAuthLayout(props: AccessAuthLayoutProps) {
  const { t } = useTranslation()
  const { resolvedTheme, setTheme } = useTheme()
  const links = useTopNavLinks({ surface: 'public' })
  const isDark = resolvedTheme === 'dark'

  return (
    <div className='ed-auth'>
      <header className='ed-authHeader'>
        <Link to='/' className='ed-brand' aria-label={PRODUCT_NAME}>
          <BrandMark size={30} withWordmark />
        </Link>
        <nav className='ed-authNav' aria-label={t('Main navigation')}>
          <Link to='/' className='ed-navLink'>
            <ArrowLeft size={15} aria-hidden='true' />
            <span>{t('Back to home')}</span>
          </Link>
          {links.map((link) => (
            <Link key={link.href} to={link.href} className='ed-navLink'>
              {link.title}
            </Link>
          ))}
          <CommunityHelp variant='header' />
          <span className='ed-headerDivider' aria-hidden='true' />
          <LanguageSwitcher />
          <button
            type='button'
            className='ed-iconBtn'
            aria-label={
              isDark ? t('Switch to light mode') : t('Switch to dark mode')
            }
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
          >
            {isDark ? (
              <Sun size={17} aria-hidden='true' />
            ) : (
              <Moon size={17} aria-hidden='true' />
            )}
          </button>
        </nav>
      </header>
      <main className='ed-authMain'>
        <section className='ed-authWelcome ed-rise'>
          <p className='ed-eyebrow'>{PRODUCT_NAME} API</p>
          {props.title ? <h1 className='ed-display'>{props.title}</h1> : null}
          <p className='ed-lede'>
            {props.description || t('One account for your AI workflow.')}
          </p>
        </section>
        <section
          className='ed-paper ed-authPanel ed-rise ed-rise--2'
          aria-label={t('Account access')}
        >
          {props.children}
        </section>
      </main>
    </div>
  )
}
