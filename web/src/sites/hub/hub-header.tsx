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
import { Globe } from 'lucide-react'
import { Link, NavLink } from 'react-router'

import { BrandMark } from '@/components/brand-mark'
import { MobileNav } from '@/components/mobile-nav'
import { UserMenu } from '@/components/user-menu'
import { useAuth } from '@/lib/auth-store'
import { cn } from '@/lib/format'
import { useBrand, useStatus } from '@/lib/queries'

/** 64px bar, 50px side padding, links next to the logo, sign-in at right. */
export function HubHeader(props: { solid?: boolean }) {
  const brand = useBrand()
  const auth = useAuth()
  const { data: status } = useStatus()

  const links: Array<{ label: string; to: string; external?: boolean }> = [
    { label: '模型', to: '/models' },
    { label: '对话', to: '/chat' },
    { label: '排行榜', to: '/rankings' },
    { label: '充值', to: '/settings/credits' },
  ]
  if (status?.docs_link) links.push({ label: '文档', to: status.docs_link, external: true })
  links.push({ label: '控制台', to: '/settings/keys' })

  const linkClass =
    'rounded-[10px] px-[13px] py-2 text-[14px] leading-[14px] font-medium text-hub-text transition-colors hover:bg-black/[0.04]'

  return (
    <header
      className={cn(
        'relative z-40 flex h-16 items-center px-5 md:px-[50px]',
        props.solid && 'border-b border-black/[0.06] bg-hub-bg'
      )}
    >
      <Link to='/' className='text-hub-ink mr-6 flex items-center gap-2 text-[18px] font-bold tracking-[-0.01em]'>
        <BrandMark tone='blue' size={28} className='rounded-full' />
        {brand.name}
      </Link>
      <nav className='hidden items-center gap-1 md:flex'>
        {links.map((link) =>
          link.external ? (
            <a key={link.label} href={link.to} target='_blank' rel='noopener noreferrer' className={linkClass}>
              {link.label}
            </a>
          ) : (
            <NavLink
              key={link.label}
              to={link.to}
              className={({ isActive }) => cn(linkClass, isActive && 'bg-black/[0.06]')}
            >
              {link.label}
            </NavLink>
          )
        )}
      </nav>
      <div className='ml-auto flex items-center gap-4'>
        <span title='简体中文' className='text-hub-muted'>
          <Globe className='size-[18px]' aria-label='语言：简体中文' />
        </span>
        {auth.status === 'authenticated' ? (
          <UserMenu skin='hub' />
        ) : (
          <Link
            to='/sign-in'
            className='text-hub-link rounded-[6px] px-2 py-1.5 text-[14px] transition-opacity hover:opacity-80'
          >
            登录
          </Link>
        )}
        <MobileNav tone='light' items={links} />
      </div>
    </header>
  )
}
