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
import { logout } from '@/lib/services'

const ITEMS = [
  { label: '充值额度', to: '/settings/credits' },
  { label: 'API 密钥', to: '/settings/keys' },
  { label: '使用记录', to: '/activity' },
  { label: '账户设置', to: '/settings/profile' },
]

/** Avatar button with the account menu. */
export function UserMenu() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

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
    <div ref={rootRef} className='relative ml-1 xl:ml-1.5'>
      <button
        type='button'
        aria-haspopup='menu'
        aria-expanded={open}
        aria-label='账户菜单'
        onClick={() => setOpen((value) => !value)}
        className='bg-or-primary text-or-bg flex size-8 items-center justify-center rounded-full text-[13px] font-semibold xl:size-[45px] xl:text-[18px]'
      >
        {name.charAt(0).toUpperCase()}
      </button>
      {open ? (
        <div role='menu' className='border-or-line bg-or-card absolute right-0 z-50 mt-2 w-52 overflow-hidden rounded-[8px] border p-1 shadow-xl'>
          <div className='text-or-muted truncate px-3 py-2 text-[13px]'>{name}</div>
          {ITEMS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              role='menuitem'
              onClick={() => setOpen(false)}
              className='text-or-fg hover:bg-or-fill block rounded-[6px] px-3 py-2 text-[14px]'
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
            className='text-or-muted hover:bg-or-fill block w-full rounded-[6px] px-3 py-2 text-left text-[14px]'
          >
            退出登录
          </button>
        </div>
      ) : null}
    </div>
  )
}
