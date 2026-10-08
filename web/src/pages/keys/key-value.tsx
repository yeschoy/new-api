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
import { Check, Copy, Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'

import { useI18n } from '@/i18n/i18n'
import { errorMessage } from '@/lib/api'
import { cn } from '@/lib/format'
import { withKeyPrefix } from '@/pages/console/console-helpers'

import type { FullKey } from './use-full-key'

export const ICON_BUTTON =
  'text-or-muted hover:bg-or-fill hover:text-or-fg flex size-7 shrink-0 items-center justify-center rounded-[6px] transition-colors disabled:cursor-not-allowed disabled:opacity-50'

/** The masked key, with buttons that show and copy the full key. */
export function KeyValue(props: { masked: string; full: FullKey }) {
  const { t } = useI18n()
  const [shown, setShown] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onReveal() {
    setError(null)
    if (shown) {
      setShown(false)
      return
    }
    try {
      await props.full.load()
      setShown(true)
    } catch (err) {
      setError(errorMessage(err, t('获取密钥失败')))
    }
  }

  async function onCopy() {
    setError(null)
    try {
      await navigator.clipboard.writeText(await props.full.load())
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch (err) {
      setError(errorMessage(err, t('复制失败')))
    }
  }

  return (
    <div className='min-w-0'>
      <div className='flex items-center gap-1'>
        <code className={cn('font-geist mr-1 min-w-0 text-[13px] break-all', !shown && 'text-or-muted')}>
          {shown && props.full.value ? props.full.value : withKeyPrefix(props.masked)}
        </code>
        <button
          type='button'
          onClick={onReveal}
          className={ICON_BUTTON}
          aria-label={shown ? t('隐藏密钥') : t('显示密钥')}
          title={shown ? t('隐藏') : t('显示')}
        >
          {shown ? <EyeOff className='size-3.5' aria-hidden='true' /> : <Eye className='size-3.5' aria-hidden='true' />}
        </button>
        <button type='button' onClick={onCopy} className={ICON_BUTTON} aria-label={t('复制密钥')} title={copied ? t('已复制') : t('复制')}>
          {copied ? <Check className='text-or-primary size-3.5' aria-hidden='true' /> : <Copy className='size-3.5' aria-hidden='true' />}
        </button>
      </div>
      {error ? <div className='text-or-red mt-1 text-[12px]'>{error}</div> : null}
    </div>
  )
}
