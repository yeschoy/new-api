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
import { Check, Copy } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Tag } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'

import { fillTemplate, type GuideValues } from './guide-runtime'
import type { GuideCode } from './guide-types'

/** Copies text and says so for two seconds. */
export function useCopy() {
  const [copied, setCopied] = useState<string | null>(null)
  useEffect(() => {
    if (copied === null) return
    const id = window.setTimeout(() => setCopied(null), 2000)
    return () => window.clearTimeout(id)
  }, [copied])
  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).then(
      () => setCopied(text),
      () => undefined
    )
  }
  return { copied, copy }
}

/**
 * A filled-in code sample with its file or shell name and a copy button. A
 * sample that names the model or group cannot be copied until both are
 * confirmed for the account, so nobody pastes a placeholder by mistake.
 */
export function CodeBlock(props: { code: GuideCode; values: GuideValues; verified: boolean }) {
  const { t } = useI18n()
  const { copied, copy } = useCopy()
  const filled = fillTemplate(props.code.template, props.values)
  const needsSelection = /\{(model|group)\}/.test(props.code.template)
  const copyLabel = props.code.copyLabel ? t(props.code.copyLabel) : t('复制代码')
  const done = copied === filled

  return (
    <figure className='border-or-line bg-or-card my-4 min-w-0 overflow-hidden rounded-[8px] border'>
      <figcaption className='border-or-line flex min-h-10 items-center gap-2 border-b py-1.5 pr-1.5 pl-3'>
        <span className='min-w-0 flex-1 truncate text-[12px] font-medium'>{t(props.code.label, props.values)}</span>
        <Tag>{props.code.language}</Tag>
        <button
          type='button'
          aria-label={copyLabel}
          title={copyLabel}
          disabled={needsSelection && !props.verified}
          onClick={() => copy(filled)}
          className='text-or-muted hover:bg-or-fill hover:text-or-fg flex h-7 items-center gap-1.5 rounded-[6px] px-2 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50'
        >
          {done ? <Check className='size-3.5' aria-hidden='true' /> : <Copy className='size-3.5' aria-hidden='true' />}
          {done ? t('已复制') : t('复制')}
        </button>
      </figcaption>
      <pre className='bg-or-fill font-geist max-w-full overflow-x-auto p-4 text-[12.5px] leading-6'>
        <code>{filled}</code>
      </pre>
      <span className='sr-only' aria-live='polite'>
        {done ? t('已复制到剪贴板') : ''}
      </span>
    </figure>
  )
}
