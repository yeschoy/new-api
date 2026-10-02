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
import { Check, Copy, Globe2, RadioTower } from 'lucide-react'
import { useState } from 'react'

import { toast } from '@/components/ui'
import { tk, useI18n } from '@/i18n/i18n'

import { ICON_BUTTON } from './key-value'

// The two entry points of this deployment, as on the old keys page.
const ACCELERATION_URLS = [
  { label: tk('三网加速 URL'), url: 'https://yeschoy.com', icon: RadioTower },
  { label: tk('全球加速 URL'), url: 'https://api.yeschoy.com', icon: Globe2 },
]

/** Faster base URLs for mainland China and for everywhere else, each with a copy button. */
export function AccelerationUrls() {
  const { t } = useI18n()
  const [copied, setCopied] = useState<string | null>(null)

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(url)
      window.setTimeout(() => setCopied((current) => (current === url ? null : current)), 1500)
    } catch {
      toast.error(t('复制失败'))
    }
  }

  return (
    <div className='mb-4 grid gap-2 sm:grid-cols-2'>
      {ACCELERATION_URLS.map((item) => {
        const Icon = item.icon
        const label = t(item.label)
        return (
          <div key={item.url} className='border-or-line bg-or-card flex min-w-0 items-center gap-3 rounded-[8px] border px-3 py-2'>
            <Icon className='text-or-primary size-4 shrink-0' aria-hidden='true' />
            <div className='min-w-0 flex-1'>
              <div className='text-or-dim truncate text-[12px] leading-4'>{label}</div>
              <code className='font-geist text-or-fg block truncate text-[13px] leading-5' title={item.url}>
                {item.url}
              </code>
            </div>
            <button type='button' onClick={() => copy(item.url)} className={ICON_BUTTON} aria-label={t('复制{label}', { label })} title={t('复制')}>
              {copied === item.url ? <Check className='text-or-primary size-3.5' aria-hidden='true' /> : <Copy className='size-3.5' aria-hidden='true' />}
            </button>
          </div>
        )
      })}
    </div>
  )
}
