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

import { Button, toast } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { cn } from '@/lib/format'

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** Seconds left before an action may run again (resending a code, say). */
export function useCountdown() {
  const [left, setLeft] = useState(0)
  useEffect(() => {
    if (left <= 0) return
    const timer = window.setTimeout(() => setLeft((value) => value - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [left])
  return { left, start: setLeft }
}

/** A secret or code shown once, in mono, with a copy button. */
export function CopyField(props: { value: string; className?: string }) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)

  async function onCopy() {
    if (await copyText(props.value)) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } else {
      toast.error(t('复制失败'))
    }
  }

  return (
    <div className={cn('border-or-line bg-or-bg flex items-center gap-2 rounded-[6px] border p-3', props.className)}>
      <code className='font-geist min-w-0 flex-1 text-[13px] break-all'>{props.value}</code>
      <Button size='sm' onClick={onCopy}>
        {copied ? <Check className='size-3.5' aria-hidden='true' /> : <Copy className='size-3.5' aria-hidden='true' />}
        {copied ? t('已复制') : t('复制')}
      </Button>
    </div>
  )
}

/** A settings row: what it is on the left, its state or action on the right; stacks on phones. */
export function SettingRow(props: {
  title: React.ReactNode
  description?: React.ReactNode
  children?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6', props.className)}>
      <div className='min-w-0'>
        <div className='text-or-fg flex flex-wrap items-center gap-2 text-[14px] font-medium'>{props.title}</div>
        {props.description ? <div className='text-or-muted mt-1 text-[13px]'>{props.description}</div> : null}
      </div>
      {props.children ? <div className='flex shrink-0 flex-wrap items-center gap-2'>{props.children}</div> : null}
    </div>
  )
}
