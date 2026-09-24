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
import { Menu, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router'

export type NavItem = { label: string; to: string; external?: boolean }

const itemClass = 'text-or-fg hover:bg-or-fill block rounded-[6px] px-3 py-2.5 text-[15px]'

/** Hamburger + drop-down link list shown below the md breakpoint. */
export function MobileNav(props: { items: NavItem[] }) {
  const [open, setOpen] = useState(false)
  const location = useLocation()

  useEffect(() => setOpen(false), [location.pathname])

  return (
    <div className='md:hidden'>
      <button
        type='button'
        aria-label={open ? '关闭菜单' : '打开菜单'}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className='text-or-fg hover:bg-or-fill flex size-9 items-center justify-center rounded-[6px]'
      >
        {open ? <X className='size-5' /> : <Menu className='size-5' />}
      </button>
      {open ? (
        <nav className='border-or-line bg-or-bg absolute inset-x-0 top-full z-50 border-b px-4 py-3 shadow-lg'>
          {props.items.map((item) =>
            item.external ? (
              <a key={item.label} href={item.to} target='_blank' rel='noopener noreferrer' className={itemClass}>
                {item.label}
              </a>
            ) : (
              <Link key={item.label} to={item.to} className={itemClass}>
                {item.label}
              </Link>
            )
          )}
        </nav>
      ) : null}
    </div>
  )
}
