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
import { Copy, ExternalLink, Gauge, Zap } from 'lucide-react'
import { useState } from 'react'

import { Button, Tag, toast, type TagTone } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'

import type { ApiInfoItem } from '../dashboard-api'
import { EmptyNote, Section } from '../dashboard-ui'

// The operator picks a colour name per route; these are its dot colours (accents, like a chart palette).
const ROUTE_COLORS: Record<string, string> = {
  blue: '#4d8dff',
  'light-blue': '#38bdf8',
  cyan: '#22d3ee',
  teal: '#14b8a6',
  green: '#22c55e',
  'light-green': '#4ade80',
  lime: '#84cc16',
  yellow: '#eab308',
  amber: '#f5a524',
  orange: '#f97316',
  red: '#f43f5e',
  pink: '#ec4899',
  purple: '#a855f7',
  violet: '#8b5cf6',
  indigo: '#6366f1',
  grey: '#94a3b8',
}

type Ping = { state: 'idle' } | { state: 'testing' } | { state: 'done'; ms: number } | { state: 'failed' }

/** Round trip of a no-cors HEAD request: enough to compare routes from this browser. */
async function measure(url: string): Promise<Ping> {
  try {
    const started = performance.now()
    await fetch(url, { method: 'HEAD', mode: 'no-cors', cache: 'no-cache' })
    return { state: 'done', ms: Math.round(performance.now() - started) }
  } catch {
    return { state: 'failed' }
  }
}

function latencyTone(ms: number): TagTone {
  if (ms < 200) return 'success'
  if (ms < 500) return 'warning'
  return 'danger'
}

/** The operator's API addresses with a latency check, an outside speed test and copy. */
export function ApiInfoPanel(props: { items: ApiInfoItem[] }) {
  const { t } = useI18n()
  return (
    <Section title={t('API 线路')} description={t('已配置的接口地址与延迟测试')} flush>
      {props.items.length === 0 ? <EmptyNote>{t('暂无 API 线路')}</EmptyNote> : null}
      <ul className='max-h-[320px] overflow-y-auto'>
        {props.items.map((item, index) => (
          <RouteRow key={`${item.url}-${index}`} item={item} />
        ))}
      </ul>
    </Section>
  )
}

function RouteRow(props: { item: ApiInfoItem }) {
  const { t } = useI18n()
  const item = props.item
  const [ping, setPing] = useState<Ping>({ state: 'idle' })

  const test = async () => {
    setPing({ state: 'testing' })
    setPing(await measure(item.url))
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(item.url)
      toast.success(t('已复制'))
    } catch {
      toast.error(t('复制失败'))
    }
  }

  return (
    <li className='border-or-line flex items-center justify-between gap-3 border-b px-5 py-3 last:border-b-0'>
      <div className='flex min-w-0 flex-1 items-start gap-2.5'>
        <span aria-hidden='true' className='mt-1.5 size-2 shrink-0 rounded-full' style={{ background: ROUTE_COLORS[item.color ?? ''] ?? ROUTE_COLORS.blue }} />
        <div className='min-w-0'>
          <div className='flex flex-wrap items-baseline gap-x-2'>
            <span className='text-[14px] font-medium'>{item.route}</span>
            {item.description ? <span className='text-or-muted text-[12px]'>{item.description}</span> : null}
          </div>
          <div className='text-or-dim font-geist truncate text-[12px]'>{item.url}</div>
        </div>
      </div>
      <div className='flex shrink-0 items-center gap-1'>
        <PingResult ping={ping} />
        <Button size='sm' variant='ghost' onClick={test} disabled={ping.state === 'testing'} ariaLabel={t('测速')} title={t('测速')}>
          <Zap className='size-3.5' aria-hidden='true' />
        </Button>
        <a
          href={`https://www.tcptest.cn/http/${encodeURIComponent(item.url)}`}
          target='_blank'
          rel='noreferrer'
          aria-label={t('外部测速')}
          title={t('外部测速')}
          className='text-or-muted hover:bg-or-fill hover:text-or-fg hidden size-7 items-center justify-center rounded-[6px] sm:flex'
        >
          <Gauge className='size-3.5' aria-hidden='true' />
        </a>
        <Button size='sm' variant='ghost' onClick={copy} ariaLabel={t('复制地址')} title={t('复制地址')}>
          <Copy className='size-3.5' aria-hidden='true' />
        </Button>
        <a
          href={item.url}
          target='_blank'
          rel='noreferrer'
          aria-label={t('新窗口打开')}
          title={t('新窗口打开')}
          className='text-or-muted hover:bg-or-fill hover:text-or-fg hidden size-7 items-center justify-center rounded-[6px] sm:flex'
        >
          <ExternalLink className='size-3.5' aria-hidden='true' />
        </a>
      </div>
    </li>
  )
}

function PingResult(props: { ping: Ping }) {
  const { t } = useI18n()
  if (props.ping.state === 'testing') return <Tag>{t('测速中…')}</Tag>
  if (props.ping.state === 'failed') return <Tag tone='danger'>{t('无法连接')}</Tag>
  if (props.ping.state === 'done') return <Tag tone={latencyTone(props.ping.ms)}>{`${props.ping.ms} ms`}</Tag>
  return null
}
