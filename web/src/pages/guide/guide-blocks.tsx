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
import { ArrowRight, Info, TriangleAlert } from 'lucide-react'
import { Link } from 'react-router'

import { tk, useI18n } from '@/i18n/i18n'
import { cn } from '@/lib/format'

import { CodeBlock } from './guide-code'
import type { GuideValues } from './guide-runtime'
import type { GuideBlock, GuidePlatform } from './guide-types'

type BlockProps = { block: GuideBlock; values: GuideValues; verified: boolean; platform: GuidePlatform; contextLength?: number }

// There is no amber token; the warning tone uses a shade that reads in both palettes, like the console's warning tag.
const CALLOUT_TONES = {
  info: { box: 'border-or-line bg-or-fill', icon: 'text-or-muted', Icon: Info },
  warning: { box: 'border-amber-500/40 bg-amber-500/10', icon: 'text-amber-600 dark:text-amber-300', Icon: TriangleAlert },
}

function Callout(props: { tone: 'info' | 'warning'; title: string; text: string }) {
  const tone = CALLOUT_TONES[props.tone]
  return (
    <div className={cn('my-5 flex gap-3 rounded-[8px] border p-4', tone.box)}>
      <tone.Icon className={cn('mt-0.5 size-4 shrink-0', tone.icon)} aria-hidden='true' />
      <div className='min-w-0'>
        <p className='text-[14px] font-semibold'>{props.title}</p>
        <p className='text-or-muted mt-1 text-[14px] leading-6'>{props.text}</p>
      </div>
    </div>
  )
}

/** Codex can be told about a 1M window; only offered when the chosen model declares one. */
function ContextWindow(props: BlockProps & { block: Extract<GuideBlock, { type: 'context-window' }> }) {
  const { t } = useI18n()
  const length = props.contextLength ?? 0
  if (length < 1_000_000) {
    return <Callout tone='info' title={t(props.block.unavailableTitle, props.values)} text={t(props.block.unavailableText, props.values)} />
  }
  const template = `model_context_window = ${length}\nmodel_auto_compact_token_limit = ${Math.floor(length * 0.9)}`
  return (
    <div className='my-5'>
      <Callout tone='info' title={t(props.block.supportedTitle, props.values)} text={t(props.block.supportedText, props.values)} />
      <CodeBlock
        code={{ label: '~/.codex/config.toml', language: 'toml', copyLabel: tk('复制大上下文配置'), template }}
        values={props.values}
        verified={props.verified}
      />
    </div>
  )
}

/** One block of an article, its texts in the current language with this site's values filled in. */
export function DocBlock(props: BlockProps) {
  const { t } = useI18n()
  const block = props.block
  const show = (text: string) => t(text, props.values)

  if (block.type === 'paragraph') return <p className='my-4 text-[15px] leading-7'>{show(block.text)}</p>
  if (block.type === 'code') return <CodeBlock code={block} values={props.values} verified={props.verified} />
  if (block.type === 'callout') return <Callout tone={block.tone} title={show(block.title)} text={show(block.text)} />
  if (block.type === 'context-window') return <ContextWindow {...props} block={block} />
  if (block.type === 'platform') {
    return (
      <div>
        {(block.platforms[props.platform] ?? []).map((inner, index) => (
          <DocBlock key={`${props.platform}-${index}`} {...props} block={inner} />
        ))}
      </div>
    )
  }
  if (block.type === 'table') {
    return (
      <div className='border-or-line my-5 max-w-full overflow-x-auto rounded-[8px] border'>
        <table className='w-full min-w-[36rem] border-collapse text-left text-[14px]'>
          <thead className='bg-or-fill text-or-muted'>
            <tr>
              {block.columns.map((column) => (
                <th key={column} scope='col' className='border-or-line border-b px-4 py-3 font-medium'>
                  {show(column)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row) => (
              <tr key={row.join('|')} className='border-or-line border-b last:border-b-0'>
                {row.map((cell, index) => (
                  <td key={`${index}-${cell}`} className='px-4 py-3 align-top leading-6 break-words'>
                    {show(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }
  return (
    <ol className='my-5 flex flex-col gap-5'>
      {block.items.map((item, index) => (
        <li key={item.title} className='grid min-w-0 grid-cols-[1.75rem_minmax(0,1fr)] gap-3'>
          <span className='bg-or-primary-soft text-or-primary mt-0.5 flex size-7 items-center justify-center rounded-full text-[13px] font-semibold'>
            {index + 1}
          </span>
          <div className='min-w-0'>
            <h3 className='text-[15px] leading-7 font-semibold'>{show(item.title)}</h3>
            {item.text ? <p className='text-or-muted mt-1 text-[14px] leading-6'>{show(item.text)}</p> : null}
            {item.code ? <CodeBlock code={item.code} values={props.values} verified={props.verified} /> : null}
            {item.action ? (
              <Link
                to={item.action.to}
                className='border-or-line bg-or-bg hover:bg-or-fill mt-3 inline-flex h-8 items-center gap-1.5 rounded-[6px] border px-3 text-[13px] font-medium transition-colors'
              >
                {show(item.action.label)}
                <ArrowRight className='size-3.5' aria-hidden='true' />
              </Link>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  )
}
