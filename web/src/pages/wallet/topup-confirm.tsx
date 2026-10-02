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

import { useI18n } from '@/i18n/i18n'
import { errorMessage } from '@/lib/api'
import { useConsoleKey, useMoney } from '@/pages/console/console-hooks'

import { PayDialog, type PayRow } from './pay-dialog'
import { discountOff, type MethodChoice, type WalletInfo } from './topup-rules'
import { gatewayOf, quoteTopUp, startTopUp } from './wallet-api'
import { useCheckout, useCredit } from './wallet-hooks'

/** Confirms an amount top-up with the chosen method's own price, then opens its checkout. */
export function TopUpConfirm(props: { info: WalletInfo; choice: MethodChoice; amount: number; onClose: () => void }) {
  const { t } = useI18n()
  const money = useMoney()
  const credit = useCredit()
  const gateway = gatewayOf(props.choice.type)
  const quote = useQuery({
    queryKey: useConsoleKey('topup-quote', gateway, props.amount),
    queryFn: () => quoteTopUp(gateway, props.amount),
    retry: false,
  })
  const checkout = useCheckout(t('已打开支付页面，支付完成后余额会自动到账'), props.onClose)
  const rate = props.info.discount[props.amount] ?? 1
  const price = quote.data

  const rows: PayRow[] = [
    { label: t('支付方式'), value: props.choice.name },
    { label: t('充值数量'), value: props.amount },
    { label: t('到账额度'), value: money.format(credit(props.amount)) },
    { label: t('实付金额'), value: price === undefined ? '…' : price.toFixed(2) },
  ]
  if (price !== undefined && discountOff(rate) !== null) {
    rows.push({ label: t('已优惠'), value: (price / rate - price).toFixed(2) })
  }

  let error: string | null = null
  if (quote.isError) error = errorMessage(quote.error, t('获取支付金额失败'))
  if (checkout.isError) error = errorMessage(checkout.error, t('支付请求失败'))

  return (
    <PayDialog
      rows={rows}
      error={error}
      busy={checkout.isPending}
      ready={quote.isSuccess}
      onClose={props.onClose}
      onConfirm={() =>
        checkout.mutate(() => startTopUp({ type: props.choice.type, amount: props.amount, waffoIndex: props.choice.waffoIndex }))
      }
    />
  )
}
