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
import { Copy } from 'lucide-react'

import { ConfirmButton, Tag, Td, Tr, toast, type TagTone } from '@/components/ui'
import { tk, useI18n } from '@/i18n/i18n'
import { dateTime } from '@/lib/format'
import { useMoney } from '@/pages/console/console-hooks'

import type { TopUpOrder } from './wallet-api'

const STATUS: Record<string, { label: string; tone: TagTone }> = {
  success: { label: tk('成功'), tone: 'success' },
  pending: { label: tk('待支付'), tone: 'warning' },
  failed: { label: tk('失败'), tone: 'danger' },
  expired: { label: tk('已过期'), tone: 'neutral' },
}

const METHODS: Record<string, string> = {
  alipay: tk('支付宝'),
  wxpay: tk('微信支付'),
  stripe: 'Stripe',
  creem: 'Creem',
  waffo: 'Waffo',
  waffo_pancake: 'Waffo Pancake',
  balance: tk('余额'),
}

const ICON_BUTTON = 'text-or-muted hover:bg-or-fill hover:text-or-fg flex size-7 shrink-0 items-center justify-center rounded-[6px] transition-colors'

/** One top-up order; administrators also see its user and can complete it while pending. */
export function TopUpOrderRow(props: { order: TopUpOrder; admin: boolean; completing: boolean; onComplete: (tradeNo: string) => void }) {
  const { t } = useI18n()
  const money = useMoney()
  const order = props.order
  const status = STATUS[order.status]
  const method = METHODS[order.payment_method]

  // Creem orders store the quota they credit; the others store USD units. Plan purchases credit nothing.
  let credited = '—'
  if (order.amount > 0) credited = order.payment_method === 'creem' ? money.format(order.amount) : money.formatUsd(order.amount)

  async function copy() {
    try {
      await navigator.clipboard.writeText(order.trade_no)
      toast.success(t('已复制'))
    } catch {
      toast.error(t('复制失败'))
    }
  }

  return (
    <Tr>
      <Td muted className='whitespace-nowrap'>{dateTime(order.create_time)}</Td>
      <Td>
        <div className='flex items-center gap-1'>
          <span className='font-geist text-[13px] break-all'>{order.trade_no || '—'}</span>
          {order.trade_no ? (
            <button type='button' onClick={copy} aria-label={t('复制订单号')} title={t('复制')} className={ICON_BUTTON}>
              <Copy className='size-3.5' aria-hidden='true' />
            </button>
          ) : null}
        </div>
      </Td>
      {props.admin ? <Td muted>{order.user_id}</Td> : null}
      <Td>{method ? t(method) : order.payment_method || '—'}</Td>
      <Td right>{credited}</Td>
      <Td right>{Number(order.money || 0).toFixed(2)}</Td>
      <Td right>
        <Tag tone={status?.tone ?? 'neutral'}>{status ? t(status.label) : order.status || t('未知')}</Tag>
      </Td>
      {props.admin ? (
        <Td right>
          {order.status === 'pending' ? (
            <ConfirmButton question={t('确认补单？')} variant='primary' busy={props.completing} onConfirm={() => props.onComplete(order.trade_no)}>
              {t('补单')}
            </ConfirmButton>
          ) : null}
        </Td>
      ) : null}
    </Tr>
  )
}
