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
import { Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, NavLink } from 'react-router'

import { BrandMark } from '@/components/brand-mark'
import { MobileNav } from '@/components/mobile-nav'
import { UserMenu } from '@/components/user-menu'
import { useAuth } from '@/lib/auth-store'
import { cn } from '@/lib/format'
import { useBrand, useStatus } from '@/lib/queries'

import { RouterSearchDialog } from './router-search-dialog'

const kbd =
  'rounded-[4px] bg-or-fill px-1.5 py-0.5 font-geist text-[12px] leading-3 font-medium text-or-muted'

export function RouterHeader() {
  const brand = useBrand()
  const { data: status } = useStatus()
  const auth = useAuth()
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
    { label: '模型', to: '/models' },
    { label: '对话', to: '/chat' },
    { label: '排行榜', to: '/rankings' },
    { label: '定价', to: '/settings/credits' },
  ]
  if (status?.docs_link) {
    links.push({ label: '文档', to: status.docs_link, external: true })
  }

  const linkClass = 'flex h-8 items-center rounded-[6px] px-2 text-[14px] font-medium text-or-muted transition-colors hover:text-or-fg'

  return (
    <nav className='border-or-line bg-or-bg sticky top-0 z-50 border-b'>
      <div className='relative flex h-[55px] items-center px-4 md:px-6'>
        <Link
          to='/'
          className='text-or-fg flex h-8 items-center gap-2 rounded-[6px] px-2 text-[17px] font-semibold tracking-[-0.02em]'
        >
          <BrandMark tone='lime' size={22} />
          <span>{brand.name}</span>
        </Link>

        <button
          type='button'
          onClick={() => setSearchOpen(true)}
          className='bg-or-fg/4 ml-20 hidden h-8 w-60 items-center gap-2 rounded-[6px] px-3 text-left md:flex'
        >
          <Search className='text-or-fg/45 size-4' aria-hidden='true' />
          <span className='text-or-fg/45 flex-1 text-[14px]'>搜索</span>
          <span className='flex gap-0.5'>
            <kbd className={kbd}>⌘</kbd>
            <kbd className={kbd}>K</kbd>
          </span>
        </button>

        <div className='ml-auto flex items-center gap-1'>
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
          {auth.status === 'authenticated' ? (
            <UserMenu skin='router' />
          ) : (
            <Link
              to='/sign-up'
              className='bg-or-lime text-or-bg ml-1 flex h-8 items-center rounded-[6px] px-3 text-[14px] font-medium transition-opacity hover:opacity-90'
            >
              注册
            </Link>
          )}
          <MobileNav tone='dark' items={links} />
        </div>
      </div>
      <RouterSearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </nav>
  )
}
