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
import { Loader2 } from 'lucide-react'
import { useId } from 'react'

import { BrandMark } from '@/components/brand-mark'
import { cn } from '@/lib/format'
import { useSiteSkin } from '@/site/site-skin'
import { HubShell } from '@/sites/hub/hub-shell'
import { RouterShell } from '@/sites/router/router-shell'

export function AuthCard(props: { title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  const { skin } = useSiteSkin()
  if (skin === 'router') {
    return (
      <RouterShell footer={false}>
        <div className='flex justify-center px-6 pt-16 pb-24'>
          <div className='border-or-line bg-or-card w-full max-w-[400px] rounded-[8px] border px-10 py-8'>
            <h1 className='text-center text-[20px] leading-6 font-semibold'>{props.title}</h1>
            {props.subtitle ? <p className='text-or-muted mt-2 text-center text-[14px]'>{props.subtitle}</p> : null}
            <div className='mt-6'>{props.children}</div>
            {props.footer ? <div className='text-or-muted mt-6 text-center text-[14px]'>{props.footer}</div> : null}
          </div>
        </div>
      </RouterShell>
    )
  }
  return (
    <HubShell solidHeader>
      <div className='flex justify-center px-6 py-16'>
        <div className='w-full max-w-[420px] rounded-[16px] bg-white p-8 shadow-[0_2px_8px_rgba(0,0,0,0.1)]'>
          <div className='flex justify-center'>
            <BrandMark tone='blue' size={40} className='rounded-full' />
          </div>
          <h1 className='font-serif-display mt-4 text-center text-[24px] leading-8 font-bold text-[rgba(0,0,0,0.88)]'>{props.title}</h1>
          {props.subtitle ? <p className='mt-1 text-center text-[14px] text-[#626773]'>{props.subtitle}</p> : null}
          <div className='mt-6'>{props.children}</div>
          {props.footer ? <div className='mt-6 text-center text-[14px] text-[#626773]'>{props.footer}</div> : null}
        </div>
      </div>
    </HubShell>
  )
}

export function AuthField(props: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  autoComplete?: string
  required?: boolean
  placeholder?: string
}) {
  const id = useId()
  const { skin } = useSiteSkin()
  const router = skin === 'router'
  return (
    <div className='flex flex-col gap-1.5'>
      <label htmlFor={id} className={router ? 'text-or-fg text-[14px] leading-[14px]' : 'text-[14px] text-[rgba(0,0,0,0.88)]'}>
        {props.label}
      </label>
      <input
        id={id}
        type={props.type ?? 'text'}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        autoComplete={props.autoComplete}
        required={props.required}
        placeholder={props.placeholder}
        className={cn(
          'h-10 w-full px-3 text-[14px] outline-none transition-colors',
          router
            ? 'border-or-line bg-or-fg/4 text-or-fg placeholder:text-or-dim focus:border-or-fg/30 rounded-[6px] border'
            : 'focus:border-hub-link rounded-[8px] border border-[#d9d9d9] bg-white text-[rgba(0,0,0,0.88)] placeholder:text-black/25 focus:shadow-[0_0_0_2px_rgba(5,145,255,0.1)]'
        )}
      />
    </div>
  )
}

export function AuthSubmit(props: { busy?: boolean; children: React.ReactNode }) {
  const { skin } = useSiteSkin()
  return (
    <button
      type='submit'
      disabled={props.busy}
      className={cn(
        'flex w-full items-center justify-center gap-2 text-[14px] font-medium transition-opacity disabled:opacity-60',
        skin === 'router'
          ? 'bg-or-lime text-or-bg h-10 rounded-[6px]'
          : 'bg-hub-blue h-10 rounded-[8px] text-white hover:bg-[#1d4ed8]'
      )}
    >
      {props.busy ? <Loader2 className='size-4 animate-spin' /> : null}
      {props.children}
    </button>
  )
}
