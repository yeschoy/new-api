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
import { Link, useNavigate } from 'react-router'

import { useI18n } from '@/i18n/i18n'
import { RouterShell } from '@/sites/router/router-shell'

const PRIMARY =
  'bg-or-primary text-or-bg flex h-11 items-center justify-center rounded-[6px] px-8 text-[14px] font-medium transition-opacity hover:opacity-90'
const SECONDARY =
  'border-or-line bg-or-bg hover:bg-or-fill flex h-11 items-center justify-center rounded-[6px] border px-6 text-[14px] font-medium transition-colors'

/** A status code with what it means, laid out like the 404 page. */
export function ErrorScreen(props: { code: number; title: string; lines: string[]; actions?: React.ReactNode }) {
  return (
    <RouterShell>
      <div className='flex flex-col items-center px-6 py-32 text-center'>
        <p className='text-[56px] leading-none font-bold tracking-[-1.4px]'>{props.code}</p>
        <h1 className='mt-4 text-[20px] font-semibold'>{props.title}</h1>
        {props.lines.map((line) => (
          <p key={line} className='text-or-muted mt-2 max-w-[480px] text-[15px] leading-6'>
            {line}
          </p>
        ))}
        {props.actions ? <div className='mt-8 flex flex-wrap justify-center gap-3'>{props.actions}</div> : null}
      </div>
    </RouterShell>
  )
}

/** 返回 goes back one page; 返回首页 goes home. */
export function BackActions(props: { children?: React.ReactNode }) {
  const { t } = useI18n()
  const navigate = useNavigate()
  return (
    <>
      <button type='button' onClick={() => void navigate(-1)} className={SECONDARY}>
        {t('返回')}
      </button>
      {props.children}
      <Link to='/' className={PRIMARY}>
        {t('返回首页')}
      </Link>
    </>
  )
}

export function ExternalAction(props: { href: string; children: React.ReactNode }) {
  return (
    <a href={props.href} target='_blank' rel='noopener noreferrer' className={SECONDARY}>
      {props.children}
    </a>
  )
}
