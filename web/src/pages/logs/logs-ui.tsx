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

import { toast } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { cn } from '@/lib/format'

/** A labelled box of label / value rows inside a detail dialog. */
export function DetailSection(props: { title: string; icon?: React.ReactNode; danger?: boolean; children: React.ReactNode }) {
  return (
    <section className='min-w-0'>
      <h3 className={cn('mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold', props.danger && 'text-or-red')}>
        {props.icon}
        {props.title}
      </h3>
      <div
        className={cn(
          'min-w-0 rounded-[6px] border px-3 py-1.5',
          props.danger ? 'border-or-red/30 bg-or-red/5' : 'border-or-line bg-or-fill'
        )}
      >
        {props.children}
      </div>
    </section>
  )
}

/** One label / value row, inside a DetailSection or on its own. */
export function DetailRow(props: { label: React.ReactNode; children: React.ReactNode; mono?: boolean }) {
  return (
    <dl className='grid min-w-0 grid-cols-[96px_minmax(0,1fr)] gap-3 py-1 text-[13px] sm:grid-cols-[136px_minmax(0,1fr)]'>
      <dt className='text-or-muted min-w-0'>{props.label}</dt>
      <dd className={cn('min-w-0 break-words', props.mono && 'font-geist text-[12px] break-all')}>{props.children}</dd>
    </dl>
  )
}

/** Copies text and briefly shows a tick; names itself for screen readers. */
export function CopyButton(props: { text: string; label?: string; className?: string }) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1500)
    return () => window.clearTimeout(timer)
  }, [copied])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(props.text)
      setCopied(true)
    } catch {
      toast.error(t('复制失败'))
    }
  }

  return (
    <button
      type='button'
      onClick={copy}
      aria-label={props.label ?? t('复制')}
      title={copied ? t('已复制') : (props.label ?? t('复制'))}
      className={cn('text-or-muted hover:bg-or-fill hover:text-or-fg inline-flex size-6 shrink-0 items-center justify-center rounded-[4px]', props.className)}
    >
      {copied ? <Check className='size-3.5' aria-hidden='true' /> : <Copy className='size-3.5' aria-hidden='true' />}
    </button>
  )
}

/** A block of long text (content, prompts, errors) with a copy button. */
export function TextBlock(props: { title: string; text: string; mono?: boolean }) {
  return (
    <section className='min-w-0'>
      <h3 className='mb-1.5 text-[13px] font-semibold'>{props.title}</h3>
      <div className='border-or-line bg-or-fill relative rounded-[6px] border p-3 pr-9'>
        <CopyButton text={props.text} className='absolute top-2 right-2' />
        <p className={cn('text-[13px] leading-relaxed break-words whitespace-pre-wrap', props.mono && 'font-geist text-[12px] break-all')}>{props.text}</p>
      </div>
    </section>
  )
}

/** Muted dash for empty cells. */
export function Dash() {
  return <span className='text-or-dim'>—</span>
}
