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
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'

import { useAuth } from '@/lib/auth-store'
import { cn } from '@/lib/format'
import { logout } from '@/lib/services'
import type { SiteSkin } from '@/site/site-skin'

const ITEMS = [
  { label: '充值额度', to: '/settings/credits' },
  { label: 'API 密钥', to: '/settings/keys' },
  { label: '使用记录', to: '/activity' },
  { label: '账户设置', to: '/settings/profile' },
]

/** Avatar button with the account menu, styled per design. */
export function UserMenu(props: { skin: SiteSkin }) {
  const auth = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const router = props.skin === 'router'

  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onPointer)
    return () => window.removeEventListener('mousedown', onPointer)
  }, [open])

  const name = auth.user?.display_name || auth.user?.username || '?'

  return (
    <div ref={rootRef} className='relative ml-1'>
      <button
        type='button'
        aria-haspopup='menu'
        aria-expanded={open}
        aria-label='账户菜单'
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'flex size-8 items-center justify-center rounded-full text-[13px] font-semibold',
          router ? 'bg-or-lime text-or-bg' : 'bg-hub-blue text-white'
        )}
      >
        {name.charAt(0).toUpperCase()}
      </button>
      {open ? (
        <div
          role='menu'
          className={cn(
            'absolute right-0 z-50 mt-2 w-52 overflow-hidden p-1 shadow-xl',
            router
              ? 'border-or-line bg-or-card rounded-[8px] border'
              : 'rounded-[8px] border border-black/5 bg-white'
          )}
        >
          <div
            className={cn(
              'truncate px-3 py-2 text-[13px]',
              router ? 'text-or-muted' : 'text-hub-muted'
            )}
          >
            {name}
          </div>
          {ITEMS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              role='menuitem'
              onClick={() => setOpen(false)}
              className={cn(
                'block rounded-[6px] px-3 py-2 text-[14px]',
                router ? 'text-or-fg hover:bg-or-fill' : 'text-hub-ink hover:bg-hub-fill'
              )}
            >
              {item.label}
            </Link>
          ))}
          <button
            type='button'
            role='menuitem'
            onClick={async () => {
              setOpen(false)
              await logout()
              navigate('/')
            }}
            className={cn(
              'block w-full rounded-[6px] px-3 py-2 text-left text-[14px]',
              router ? 'text-or-muted hover:bg-or-fill' : 'text-hub-muted hover:bg-hub-fill'
            )}
          >
            退出登录
          </button>
        </div>
      ) : null}
    </div>
  )
}
