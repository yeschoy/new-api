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
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useId, useMemo } from 'react'

import { Field, Tag, TextInput } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { errorMessage } from '@/lib/api'
import { cn } from '@/lib/format'
import { useConsoleKey, useMoney } from '@/pages/console/console-hooks'

import { discountOff, minTopUp, presetAmounts, type WalletInfo } from './topup-rules'
import { quoteTopUp, type Gateway } from './wallet-api'
import { useCredit, useDebounced } from './wallet-hooks'

/** Preset amounts, the amount field, and what that amount credits and costs. */
export function AmountPicker(props: {
  info: WalletInfo
  amount: string
  onAmount: (amount: string) => void
  /** The gateway whose price is shown; null when no amount-based method is offered. */
  gateway: Gateway | null
}) {
  const { t } = useI18n()
  const money = useMoney()
  const credit = useCredit()
  const inputId = useId()
  const presets = useMemo(() => presetAmounts(props.info), [props.info])
  const min = minTopUp(props.info)
  const amount = Number(props.amount)

  return (
    <div className='flex flex-col gap-4'>
      <div className='grid grid-cols-2 gap-2 md:grid-cols-4'>
        {presets.map((preset) => {
          const off = discountOff(preset.discount)
          const selected = preset.value === amount
          return (
            <button
              key={preset.value}
              type='button'
              aria-pressed={selected}
              onClick={() => props.onAmount(String(preset.value))}
              className={cn(
                'flex min-h-14 items-center justify-between gap-2 rounded-[8px] border px-3 py-2 text-left transition-colors',
                selected ? 'border-or-primary bg-or-primary-soft' : 'border-or-line hover:bg-or-fill'
              )}
            >
              <span className='text-[16px] font-semibold tabular-nums'>{money.format(credit(preset.value))}</span>
              {off ? <Tag tone='success'>{`-${off}%`}</Tag> : null}
            </button>
          )
        })}
      </div>
      <Field label={t('充值数量')} htmlFor={inputId} hint={t('最低 {min}', { min })}>
        <TextInput
          id={inputId}
          value={props.amount}
          onChange={(value) => props.onAmount(value.replace(/\D/g, ''))}
          inputMode='decimal'
          placeholder={String(min)}
          className='tabular-nums sm:max-w-[240px]'
        />
      </Field>
      <dl className='flex flex-wrap gap-x-8 gap-y-1 text-[14px]'>
        <div className='flex items-baseline gap-2'>
          <dt className='text-or-muted'>{t('到账')}</dt>
          <dd className='font-semibold tabular-nums'>{amount >= min ? money.format(credit(amount)) : '—'}</dd>
        </div>
        <div className='flex items-baseline gap-2'>
          <dt className='text-or-muted'>{t('实付')}</dt>
          <dd className='font-semibold tabular-nums'>
            <Price gateway={props.gateway} amount={amount >= min ? amount : 0} />
          </dd>
        </div>
      </dl>
    </div>
  )
}

/** The gateway's price for the amount, asked once typing pauses. */
function Price(props: { gateway: Gateway | null; amount: number }) {
  const { t } = useI18n()
  const amount = useDebounced(props.amount, 300)
  const gateway = props.gateway
  const quote = useQuery({
    queryKey: useConsoleKey('topup-quote', gateway, amount),
    queryFn: () => quoteTopUp(gateway ?? 'epay', amount),
    enabled: gateway !== null && amount > 0,
    placeholderData: keepPreviousData,
    retry: false,
  })
  if (!gateway || props.amount <= 0) return '—'
  if (quote.isError) return <span className='text-or-red text-[13px] font-normal'>{errorMessage(quote.error, t('获取支付金额失败'))}</span>
  if (quote.data === undefined) return '…'
  return quote.data.toFixed(2)
}
