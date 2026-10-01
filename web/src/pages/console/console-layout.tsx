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
import { ChevronDown } from 'lucide-react'
import { Link, useNavigate } from 'react-router'

import { useI18n } from '@/i18n/i18n'
import { useAuth } from '@/lib/auth-store'
import { cn } from '@/lib/format'
import { useStatus } from '@/lib/queries'
import { RouterShell } from '@/sites/router/router-shell'

import { useSelf } from './console-hooks'
import { visibleConsoleNav, type ConsoleNavGroup, type ConsoleSection } from './console-nav'

export type { ConsoleSection } from './console-nav'

type LayoutProps = {
  active: ConsoleSection
  title: string
  description?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
}

/** The console pages this visitor may open: the admin's switches, their own preference and their role. */
function useConsoleNav(): ConsoleNavGroup[] {
  const auth = useAuth()
  const { data: status } = useStatus()
  const self = useSelf()
  return visibleConsoleNav({
    adminModules: status?.SidebarModulesAdmin,
    userModules: self.data?.sidebar_modules,
    role: auth.user?.role ?? 0,
    dataExport: status?.enable_data_export !== false,
  })
}

/** Signed-in console frame: page shell, grouped left menu (a picker on phones) and the page heading. */
export function ConsoleLayout(props: LayoutProps) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const groups = useConsoleNav()
  const current = groups.flatMap((group) => group.items).find((item) => item.id === props.active)

  return (
    <RouterShell footer={false}>
      <div className='mx-auto flex w-full max-w-[1348px] flex-col gap-6 px-6 py-8 md:flex-row md:gap-10'>
        <nav
          aria-label={t('设置导航')}
          className='hidden shrink-0 flex-col gap-5 md:sticky md:top-[88px] md:flex md:w-[200px] md:self-start xl:top-[110px]'
        >
          {groups.map((group) => (
            <div key={group.title ?? 'top'} className='flex flex-col gap-0.5'>
              {group.title ? <div className='text-or-dim px-3 pb-1 text-[12px] font-medium'>{t(group.title)}</div> : null}
              {group.items.map((item) => {
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
                    {t(item.label)}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>

        <label className='relative md:hidden'>
          <span className='sr-only'>{t('选择页面')}</span>
          <select
            value={current?.to ?? ''}
            onChange={(event) => navigate(event.target.value)}
            className='border-or-line bg-or-card text-or-fg h-10 w-full appearance-none rounded-[8px] border pr-9 pl-3 text-[14px] font-medium'
          >
            {groups.map((group) => (
              <optgroup key={group.title ?? 'top'} label={group.title ? t(group.title) : t('概览')}>
                {group.items.map((item) => (
                  <option key={item.id} value={item.to}>
                    {t(item.label)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <ChevronDown className='text-or-muted pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2' aria-hidden='true' />
        </label>

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
