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

import { RouterShell } from '@/sites/router/router-shell'

/** 400px card, 32/40 padding, centred 20px title (measured sign-in card). */
export function AuthCard(props: { title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode }) {
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
  return (
    <div className='flex flex-col gap-1.5'>
      <label htmlFor={id} className='text-or-fg text-[14px] leading-[14px]'>
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
        className='border-or-line bg-or-fg/4 text-or-fg placeholder:text-or-dim focus:border-or-fg/30 h-10 w-full rounded-[6px] border px-3 text-[14px] transition-colors outline-none'
      />
    </div>
  )
}

export function AuthSubmit(props: { busy?: boolean; children: React.ReactNode }) {
  return (
    <button
      type='submit'
      disabled={props.busy}
      className='bg-or-primary text-or-bg flex h-10 w-full items-center justify-center gap-2 rounded-[6px] text-[14px] font-medium transition-opacity disabled:opacity-60'
    >
      {props.busy ? <Loader2 className='size-4 animate-spin' /> : null}
      {props.children}
    </button>
  )
}
