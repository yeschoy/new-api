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
import { Check, Lock, Maximize2, Users } from 'lucide-react'

import { ProviderIcon } from '@/components/provider-icon'
import { useI18n } from '@/i18n/i18n'

/** Scattered provider marks, as in the "every modality" card. */
export function IconScatter(props: { icons: string[] }) {
  const icons = props.icons.slice(0, 24)
  return (
    <div className='grid w-full grid-cols-6 gap-x-6 gap-y-5 px-3 pt-4' aria-hidden='true'>
      {icons.map((icon, index) => (
        <span
          key={`${icon}-${index}`}
          className='border-or-line bg-or-bg flex size-6 items-center justify-center rounded-full border'
          style={{ marginLeft: index % 12 < 6 ? 0 : 18 }}
        >
          <ProviderIcon name={icon} size={13} />
        </span>
      ))}
    </div>
  )
}

/** A model slug fanning out to three upstream providers. */
export function FanOut(props: { slug: string; icons: string[] }) {
  return (
    <div className='flex w-full flex-col items-center pt-5' aria-hidden='true'>
      <span className='border-or-line bg-or-fill rounded-[6px] border px-3 py-1 text-[13px]'>
        {props.slug}
      </span>
      <svg viewBox='0 0 220 60' className='text-or-fg/25 h-[60px] w-[220px]'>
        <path d='M110 0 V56' stroke='currentColor' fill='none' />
        <path d='M110 6 C110 40, 20 22, 20 56' stroke='currentColor' fill='none' />
        <path d='M110 6 C110 40, 200 22, 200 56' stroke='currentColor' fill='none' />
      </svg>
      <div className='flex w-[240px] justify-between'>
        {props.icons.slice(0, 3).map((icon) => (
          <span key={icon} className='flex size-8 items-center justify-center rounded-[6px] bg-[#f4e4d6]'>
            <ProviderIcon name={icon} size={18} />
          </span>
        ))}
      </div>
    </div>
  )
}

function Pane(props: { title: string; className: string; children: React.ReactNode }) {
  return (
    <div className={`border-or-line bg-or-card absolute rounded-[6px] border p-2 ${props.className}`}>
      <div className='text-or-muted flex items-center justify-between text-[10px]'>
        {props.title}
        <Maximize2 className='size-2.5' />
      </div>
      {props.children}
    </div>
  )
}

/** Overlapping throughput / latency panes. */
export function PerfPanes() {
  const { t } = useI18n()
  return (
    <div className='relative h-[150px] w-[250px]' aria-hidden='true'>
      <Pane title={t('吞吐量')} className='top-2 left-0 h-[112px] w-[150px]'>
        <svg viewBox='0 0 130 60' className='mt-4 w-full'>
          <polyline points='0,32 14,30 26,36 40,28 54,34 68,30 82,33 96,27 110,31 130,29' fill='none' stroke='#4d8dff' strokeWidth='1.2' />
        </svg>
      </Pane>
      <Pane title={t('延迟')} className='top-9 right-0 h-[112px] w-[170px]'>
        <svg viewBox='0 0 150 60' className='mt-3 w-full'>
          <polyline points='0,22 12,30 24,18 36,34 48,20 60,28 72,16 84,30 96,22 108,26 120,18 150,24' fill='none' stroke='#f5a524' strokeWidth='1.2' />
          <polyline points='0,34 12,28 24,38 36,26 48,36 60,30 72,38 84,28 96,36 108,30 120,34 150,30' fill='none' style={{ stroke: 'var(--or-primary)' }} strokeWidth='1.2' />
          <polyline points='0,42 12,40 24,44 36,38 48,43 60,40 72,45 84,39 96,44 108,41 120,43 150,40' fill='none' stroke='#4d8dff' strokeWidth='1.2' />
        </svg>
      </Pane>
    </div>
  )
}

/** Shield guarding a team, with an approved check between two locks. */
export function PolicyShield() {
  return (
    <div className='relative flex h-[150px] w-[200px] items-center justify-center' aria-hidden='true'>
      <Lock className='text-or-muted absolute top-7 left-7 size-3.5' />
      <Lock className='text-or-muted absolute top-7 right-7 size-3.5' />
      <span className='bg-or-primary/15 text-or-primary absolute top-3 flex size-7 items-center justify-center rounded-full border border-or-primary/30'>
        <Check className='size-4' />
      </span>
      <svg viewBox='0 0 80 90' className='text-or-fg/60 mt-8 h-[84px] w-[76px]'>
        <path d='M40 4 L74 16 V44 C74 66 58 80 40 86 C22 80 6 66 6 44 V16 Z' fill='none' stroke='currentColor' strokeWidth='1.5' />
      </svg>
      <Users className='text-or-fg/60 absolute top-[82px] size-6' />
    </div>
  )
}
