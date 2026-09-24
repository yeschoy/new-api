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
import { Bell } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import { useCatalog } from '@/lib/queries'

import { HubFooter } from './hub-footer'
import { HubHeader } from './hub-header'

/** Floating "Notice" bell listing the newest catalog additions. */
function NoticeButton() {
  const [open, setOpen] = useState(false)
  const { models } = useCatalog()
  const recent = [...models]
    .filter((m) => m.release_date)
    .sort((a, b) => (b.release_date ?? '').localeCompare(a.release_date ?? ''))
    .slice(0, 6)

  return (
    <div className='fixed right-6 bottom-20 z-50 flex flex-col items-end'>
      {open ? (
        <div className='mb-3 w-72 rounded-[12px] border border-[#e5e7eb] bg-white p-4 shadow-xl'>
          <div className='text-[14px] font-semibold text-[#1a1a1a]'>通知</div>
          <ul className='mt-2 flex flex-col gap-2'>
            {recent.length === 0 ? <li className='text-[13px] text-[#888]'>暂无通知</li> : null}
            {recent.map((m) => (
              <li key={m.model_name} className='text-[13px] text-[#555]'>
                {m.release_date}：新增模型{' '}
                <Link to={`/models?q=${encodeURIComponent(m.model_name)}`} className='text-hub-link'>
                  {m.model_name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <button
        type='button'
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className='flex flex-col items-center gap-1 text-[12px] text-[#1a1a1a]'
      >
        <span className='flex size-10 items-center justify-center rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.12)]'>
          <Bell className='size-[18px] fill-[#1a1a1a]' />
        </span>
        通知
      </button>
    </div>
  )
}

export function HubShell(props: { children: React.ReactNode; solidHeader?: boolean }) {
  return (
    <div className='bg-hub-bg text-hub-ink flex min-h-screen flex-col'>
      <HubHeader solid={props.solidHeader} />
      <main className='flex-1'>{props.children}</main>
      <HubFooter />
      <NoticeButton />
    </div>
  )
}
