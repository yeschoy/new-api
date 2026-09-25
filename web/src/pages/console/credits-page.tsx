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
import { useQuery } from '@tanstack/react-query'

import { tk, useI18n } from '@/i18n/i18n'
import { RequireAuth } from '@/components/require-auth'
import { errorMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth-store'
import { getTopUpInfo, listTopUps, type TopUpRecord } from '@/lib/console-api'
import { dateTime } from '@/lib/format'

import { useConsoleKey, useMoney, useSelf } from './console-hooks'
import { ConsoleLayout } from './console-layout'
import { Table, TableMessage, Td, Tr, type Column } from './console-table'
import { Panel, Tag, type TagTone } from './console-ui'
import { RedeemPanel } from './credits-redeem'

const TOPUP_COLUMNS: Column[] = [
  { label: tk('时间') },
  { label: tk('订单号') },
  { label: tk('支付方式') },
  { label: tk('充值额度'), right: true },
  { label: tk('支付金额'), right: true },
  { label: tk('状态'), right: true },
]

const TOPUP_STATUS: Record<string, { label: string; tone: TagTone }> = {
  success: { label: tk('成功'), tone: 'success' },
  pending: { label: tk('待支付'), tone: 'warning' },
  failed: { label: tk('失败'), tone: 'danger' },
  expired: { label: tk('已过期'), tone: 'neutral' },
}

const PAY_METHODS: Record<string, string> = {
  alipay: tk('支付宝'),
  wxpay: tk('微信支付'),
  stripe: 'Stripe',
  creem: 'Creem',
  waffo: 'Waffo',
  waffo_pancake: 'Waffo Pancake',
  balance: tk('余额'),
}

/** Balance, redeem-code top-up and recent top-up orders. */
export function CreditsPage() {
  return (
    <RequireAuth framed>
      <CreditsContent />
    </RequireAuth>
  )
}

function CreditsContent() {
  const { t } = useI18n()
  const money = useMoney()
  const auth = useAuth()
  const self = useSelf()
  const user = self.data ?? auth.user
  const info = useQuery({ queryKey: useConsoleKey('topup-info'), queryFn: getTopUpInfo, retry: false })
  const topups = useQuery({ queryKey: useConsoleKey('topups'), queryFn: () => listTopUps(1, 10), retry: false })
  const records = topups.data?.items ?? []

  return (
    <ConsoleLayout active='credits' title={t('充值额度')} description={t('余额用于支付模型调用费用，按实际用量实时扣除。')}>
      <div className='flex flex-col gap-4'>
        <Panel>
          <div className='flex flex-wrap items-end justify-between gap-6'>
            <div>
              <div className='text-or-muted text-[13px]'>{t('可用余额')}</div>
              <div className='mt-1 text-[40px] leading-[48px] font-semibold tracking-[-0.02em] tabular-nums'>
                {user ? money.format(user.quota) : '—'}
              </div>
            </div>
            <dl className='flex gap-10'>
              <Stat label={t('已用额度')} value={user ? money.format(user.used_quota) : '—'} />
              <Stat label={t('请求次数')} value={user ? (user.request_count ?? 0).toLocaleString('zh-CN') : '—'} />
            </dl>
          </div>
        </Panel>

        <RedeemPanel info={info.data} />

        <Panel title={t('充值记录')} flush>
          <Table columns={TOPUP_COLUMNS} minWidth={760}>
            {topups.isLoading ? <TableMessage colSpan={TOPUP_COLUMNS.length}>{t('加载中…')}</TableMessage> : null}
            {topups.isError ? (
              <TableMessage colSpan={TOPUP_COLUMNS.length}>{errorMessage(topups.error, t('充值记录加载失败'))}</TableMessage>
            ) : null}
            {topups.isSuccess && records.length === 0 ? (
              <TableMessage colSpan={TOPUP_COLUMNS.length}>{t('暂无在线充值记录')}</TableMessage>
            ) : null}
            {records.map((record) => (
              <TopUpRow key={record.id} record={record} format={money.formatUsd} />
            ))}
          </Table>
        </Panel>
      </div>
    </ConsoleLayout>
  )
}

function Stat(props: { label: string; value: string }) {
  return (
    <div>
      <dt className='text-or-muted text-[13px]'>{props.label}</dt>
      <dd className='mt-1 text-[18px] font-semibold tabular-nums'>{props.value}</dd>
    </div>
  )
}

function TopUpRow(props: { record: TopUpRecord; format: (usd: number) => string }) {
  const { t } = useI18n()
  const record = props.record
  const status = TOPUP_STATUS[record.status] ?? { label: record.status || tk('未知'), tone: 'neutral' as const }
  return (
    <Tr>
      <Td muted className='whitespace-nowrap'>{dateTime(record.create_time)}</Td>
      <Td mono>{record.trade_no || '—'}</Td>
      <Td>{t(PAY_METHODS[record.payment_method] ?? (record.payment_method || '—'))}</Td>
      <Td right>{props.format(record.amount)}</Td>
      <Td right>{Number(record.money || 0).toFixed(2)}</Td>
      <Td right>
        <Tag tone={status.tone}>{t(status.label)}</Tag>
      </Td>
    </Tr>
  )
}
