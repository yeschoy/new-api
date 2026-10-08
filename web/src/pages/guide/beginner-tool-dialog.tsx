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

import { Modal } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { cn } from '@/lib/format'

import { STATUS_META } from './beginner-catalog'
import type { BeginnerTool } from './beginner-types'
import type { GuideAddress } from './guide-address'
import { useCopy } from './guide-code'
import { fillTemplate } from './guide-runtime'

function Snippet(props: { label: string; code: string }) {
  const { t } = useI18n()
  const { copied, copy } = useCopy()
  const done = copied === props.code
  return (
    <div className='mt-5'>
      <div className='mb-2 flex items-center justify-between gap-3'>
        <p className='min-w-0 truncate text-[14px] font-semibold'>{props.label}</p>
        <button
          type='button'
          aria-label={t('复制{label}', { label: props.label })}
          onClick={() => copy(props.code)}
          className='border-or-line hover:bg-or-fill flex h-7 shrink-0 items-center gap-1.5 rounded-[6px] border px-2.5 text-[12px] font-medium transition-colors'
        >
          {done ? <Check className='size-3.5' aria-hidden='true' /> : <Copy className='size-3.5' aria-hidden='true' />}
          {done ? t('已复制') : t('复制')}
        </button>
      </div>
      <pre className='border-or-line bg-or-fill font-geist overflow-x-auto rounded-[8px] border p-4 text-[12.5px] leading-6'>{props.code}</pre>
    </div>
  )
}

/** A tool's setup steps with this site's address filled in, then its caveats and config sample. */
export function ToolDialog(props: { tool: BeginnerTool; address: GuideAddress; onClose: () => void }) {
  const { t } = useI18n()
  const status = STATUS_META[props.tool.status]
  return (
    <Modal
      size='lg'
      onClose={props.onClose}
      title={
        <span className='flex flex-wrap items-center gap-2.5'>
          {t(props.tool.name)}
          <span className={cn('rounded-full px-2.5 py-0.5 text-[12px] font-semibold', status.pill)}>{t(status.label)}</span>
        </span>
      }
    >
      <div className='break-words'>
        <p className='text-or-muted text-[14px] leading-6'>{t(props.tool.summary)}</p>
        <ol className='mt-4 flex flex-col gap-3'>
          {props.tool.steps.map((step, index) => (
            <li key={step} className='flex items-start gap-3'>
              <span className='bg-or-primary-soft text-or-primary flex size-6 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold'>
                {index + 1}
              </span>
              <span className='min-w-0 pt-0.5 text-[14px] leading-6'>{t(step, props.address)}</span>
            </li>
          ))}
        </ol>
        {props.tool.tips?.length ? (
          <div className='mt-5 rounded-[8px] border border-amber-500/40 bg-amber-500/10 p-4'>
            <p className='text-[14px] font-semibold'>{t('注意')}</p>
            <ul className='mt-1.5 flex list-disc flex-col gap-1 pl-4'>
              {props.tool.tips.map((tip) => (
                <li key={tip} className='text-[13px] leading-5'>
                  {t(tip, props.address)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {props.tool.snippet ? <Snippet label={t(props.tool.snippet.label)} code={fillTemplate(props.tool.snippet.code, props.address)} /> : null}
      </div>
    </Modal>
  )
}
