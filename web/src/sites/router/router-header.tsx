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
import { Moon, Search, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, NavLink } from 'react-router'

import { BrandMark } from '@/components/brand-mark'
import { LanguageMenu } from '@/components/language-menu'
import { MobileNav } from '@/components/mobile-nav'
import { UserMenu } from '@/components/user-menu'
import { useI18n } from '@/i18n/i18n'
import { useAuth } from '@/lib/auth-store'
import { cn } from '@/lib/format'
import { useBrand, useStatus } from '@/lib/queries'
import { useTheme } from '@/site/theme'

import { RouterSearchDialog } from './router-search-dialog'

// From xl (1280px) the bar and everything in it is 1.4 times the size.
export function RouterHeader() {
  const brand = useBrand()
  const { t } = useI18n()
  const { data: status } = useStatus()
  const auth = useAuth()
  const theme = useTheme()
  const [searchOpen, setSearchOpen] = useState(false)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const links: Array<{ label: string; to: string; external?: boolean }> = [
    { label: t('模型'), to: '/models' },
    { label: t('对话'), to: '/chat' },
    { label: t('排行榜'), to: '/rankings' },
    { label: t('定价'), to: '/settings/credits' },
  ]
  if (status?.docs_link) {
    links.push({ label: t('文档'), to: status.docs_link, external: true })
  }

  const linkClass =
    'flex h-8 items-center rounded-[6px] px-2 text-[14px] font-medium text-or-muted transition-colors hover:text-or-fg xl:h-[45px] xl:rounded-[8px] xl:px-[11px] xl:text-[20px]'

  return (
    <nav className='border-or-line bg-or-bg sticky top-0 z-50 border-b'>
      <div className='relative flex h-[55px] items-center px-4 md:px-6 xl:h-[77px] xl:px-[34px]'>
        <Link
          to='/'
          className='text-or-fg flex h-8 shrink-0 items-center gap-2 rounded-[6px] px-2 text-[17px] font-semibold tracking-[-0.02em] xl:h-[45px] xl:gap-[11px] xl:rounded-[8px] xl:px-[11px] xl:text-[24px]'
        >
          <BrandMark size={31} className='size-[22px] xl:size-[31px]' />
          <span>{brand.name}</span>
        </Link>

        <button
          type='button'
          onClick={() => setSearchOpen(true)}
          className='bg-or-fg/4 ml-20 hidden h-8 w-60 min-w-0 items-center gap-2 rounded-[6px] px-3 text-left md:flex xl:ml-28 xl:h-[45px] xl:w-[336px] xl:gap-[11px] xl:rounded-[8px] xl:px-[17px]'
        >
          <Search className='text-or-fg/45 size-4 shrink-0 xl:size-[22px]' aria-hidden='true' />
          <span className='text-or-fg/45 flex-1 truncate text-[14px] xl:text-[20px]'>{t('搜索')}</span>
        </button>

        <div className='ml-auto flex shrink-0 items-center gap-1 pl-4 xl:gap-1.5'>
          {links.map((link) =>
            link.external ? (
              <a
                key={link.label}
                href={link.to}
                target='_blank'
                rel='noopener noreferrer'
                className={cn(linkClass, 'hidden md:flex')}
              >
                {link.label}
              </a>
            ) : (
              <NavLink
                key={link.label}
                to={link.to}
                className={({ isActive }) =>
                  cn(linkClass, 'hidden md:flex', isActive && 'text-or-fg')
                }
              >
                {link.label}
              </NavLink>
            )
          )}
          <LanguageMenu
            className='text-or-muted hover:text-or-fg hover:bg-or-fill flex size-8 items-center justify-center rounded-[6px] transition-colors xl:size-[45px] xl:rounded-[8px]'
            iconClassName='xl:size-[22px]'
          />
          <button
            type='button'
            onClick={theme.toggle}
            aria-label={theme.theme === 'dark' ? t('切换到白天') : t('切换到夜晚')}
            title={theme.theme === 'dark' ? t('切换到白天') : t('切换到夜晚')}
            className='text-or-muted hover:text-or-fg hover:bg-or-fill flex size-8 items-center justify-center rounded-[6px] transition-colors xl:size-[45px] xl:rounded-[8px]'
          >
            {theme.theme === 'dark' ? <Sun className='size-4 xl:size-[22px]' /> : <Moon className='size-4 xl:size-[22px]' />}
          </button>
          {auth.status === 'authenticated' ? (
            <UserMenu />
          ) : (
            <Link
              to='/sign-up'
              className='bg-or-primary text-or-bg ml-1 flex h-8 items-center rounded-[6px] px-3 text-[14px] font-medium transition-opacity hover:opacity-90 xl:ml-1.5 xl:h-[45px] xl:rounded-[8px] xl:px-[17px] xl:text-[20px]'
            >
              {t('注册')}
            </Link>
          )}
          <MobileNav items={links} />
        </div>
      </div>
      <RouterSearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </nav>
  )
}
