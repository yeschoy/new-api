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
import { Activity, CreditCard, KeyRound, UserRound } from 'lucide-react'
import { Link } from 'react-router'

import { cn } from '@/lib/format'
import { RouterShell } from '@/sites/router/router-shell'

export type ConsoleSection = 'credits' | 'keys' | 'activity' | 'profile'

const NAV: Array<{ id: ConsoleSection; label: string; to: string; icon: typeof CreditCard }> = [
  { id: 'credits', label: '充值额度', to: '/settings/credits', icon: CreditCard },
  { id: 'keys', label: 'API 密钥', to: '/settings/keys', icon: KeyRound },
  { id: 'activity', label: '使用记录', to: '/activity', icon: Activity },
  { id: 'profile', label: '账户设置', to: '/settings/profile', icon: UserRound },
]

type LayoutProps = {
  active: ConsoleSection
  title: string
  description?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
}

/** Signed-in settings frame: page shell + left settings nav + page heading. */
export function ConsoleLayout(props: LayoutProps) {
  return (
    <RouterShell footer={false}>
      <div className='mx-auto flex w-full max-w-[1348px] flex-col gap-6 px-6 py-8 md:flex-row md:gap-10'>
        <nav aria-label='设置导航' className='flex shrink-0 gap-1 overflow-x-auto md:sticky md:top-[88px] xl:top-[110px] md:w-[200px] md:flex-col md:self-start'>
          {NAV.map((item) => {
            const Icon = item.icon
            const active = item.id === props.active
            return (
              <Link
                key={item.id}
                to={item.to}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-8 shrink-0 items-center gap-2 rounded-[6px] px-3 text-[14px] font-medium transition-colors',
                  active ? 'bg-or-primary-soft text-or-primary' : 'text-or-muted hover:bg-or-fill hover:text-or-fg'
                )}
              >
                <Icon className='size-4' aria-hidden='true' />
                {item.label}
              </Link>
            )
          })}
        </nav>
        <div className='min-w-0 max-w-[1100px] flex-1'>
          <header className='mb-6 flex flex-wrap items-start justify-between gap-4'>
            <div className='min-w-0'>
              <h1 className='text-[24px] leading-8 font-semibold tracking-[-0.01em]'>{props.title}</h1>
              {props.description ? <div className='text-or-muted mt-1 text-[14px]'>{props.description}</div> : null}
            </div>
            {props.actions ? <div className='flex shrink-0 items-center gap-2'>{props.actions}</div> : null}
          </header>
          {props.children}
        </div>
      </div>
    </RouterShell>
  )
}
