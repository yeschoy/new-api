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
import { useMemo, useState } from 'react'

import { Notice, Panel } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'

import { CreemProducts } from './creem-products'
import { AmountPicker } from './topup-amount'
import { TopUpConfirm } from './topup-confirm'
import { MethodPicker } from './topup-methods'
import { amountTopUpEnabled, methodChoices, minTopUp, type MethodChoice, type WalletInfo } from './topup-rules'
import { gatewayOf, type Gateway } from './wallet-api'

/** "在线充值": an amount paid through any configured gateway, or a Creem package. */
export function TopUpPanel(props: { info: WalletInfo }) {
  const { t } = useI18n()
  const info = props.info
  const choices = useMemo(() => methodChoices(info), [info])
  const [amount, setAmount] = useState(() => String(minTopUp(info)))
  const [gateway, setGateway] = useState<Gateway | null>(() => (choices[0] ? gatewayOf(choices[0].type) : null))
  const [picked, setPicked] = useState<MethodChoice | null>(null)
  const byAmount = amountTopUpEnabled(info)
  const creem = info.enable_creem_topup && info.creem_products.length > 0

  function onPick(choice: MethodChoice) {
    setGateway(gatewayOf(choice.type))
    setPicked(choice)
  }

  let closed: string | null = null
  if (!byAmount && !creem) {
    closed = info.enable_redemption ? t('本站未开启在线充值，可以使用兑换码充值。') : t('本站未开启在线充值，请联系管理员。')
  }

  return (
    <Panel title={t('在线充值')}>
      <div className='flex flex-col gap-6'>
        {byAmount ? (
          <>
            <AmountPicker info={info} amount={amount} onAmount={setAmount} gateway={gateway} />
            <MethodPicker choices={choices} amount={Number(amount)} onPick={onPick} />
          </>
        ) : null}
        {creem ? <CreemProducts products={info.creem_products} /> : null}
        {closed ? <Notice tone='info'>{closed}</Notice> : null}
      </div>
      {picked ? <TopUpConfirm info={info} choice={picked} amount={Number(amount)} onClose={() => setPicked(null)} /> : null}
    </Panel>
  )
}
