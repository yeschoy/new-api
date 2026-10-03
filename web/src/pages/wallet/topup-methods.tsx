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
import { Notice } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'

import type { MethodChoice } from './topup-rules'

/** Operators may give a method an image; only https addresses are shown. */
function iconUrl(icon?: string): string | null {
  if (!icon) return null
  try {
    const url = new URL(icon)
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : null
  } catch {
    return null
  }
}

/** One button per way to pay; a method stays off while the amount is under its minimum. */
export function MethodPicker(props: { choices: MethodChoice[]; amount: number; onPick: (choice: MethodChoice) => void }) {
  const { t } = useI18n()
  if (!props.choices.length) return <Notice tone='info'>{t('暂无可用的支付方式，请联系管理员。')}</Notice>
  return (
    <div className='flex flex-col gap-2'>
      <div className='text-or-fg text-[13px] font-medium'>{t('支付方式')}</div>
      <div className='grid grid-cols-2 gap-2 sm:grid-cols-3'>
        {props.choices.map((choice) => {
          const short = props.amount < choice.min
          const icon = iconUrl(choice.icon)
          return (
            <button
              key={`${choice.type}-${choice.waffoIndex ?? ''}-${choice.name}`}
              type='button'
              disabled={short}
              onClick={() => props.onPick(choice)}
              className='border-or-line hover:bg-or-fill flex min-h-12 min-w-0 items-center gap-2 rounded-[8px] border px-3 py-2 text-left text-[14px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50'
            >
              {icon ? <img src={icon} alt='' className='size-5 shrink-0 object-contain' referrerPolicy='no-referrer' /> : null}
              <span className='flex min-w-0 flex-col'>
                <span className='truncate'>{choice.name}</span>
                {short ? <span className='text-or-muted text-[12px] font-normal'>{t('最低 {min}', { min: choice.min })}</span> : null}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
