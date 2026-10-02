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
import { useState } from 'react'

import { useI18n } from '@/i18n/i18n'
import { errorMessage } from '@/lib/api'
import { useMoney } from '@/pages/console/console-hooks'

import { PayDialog } from './pay-dialog'
import { priceLabel, type CreemProduct } from './topup-rules'
import { startCreemCheckout } from './wallet-api'
import { useCheckout } from './wallet-hooks'

/** Creem sells fixed packages: each credits its own quota at its own price. */
export function CreemProducts(props: { products: CreemProduct[] }) {
  const { t } = useI18n()
  const money = useMoney()
  const [picked, setPicked] = useState<CreemProduct | null>(null)

  return (
    <div className='flex flex-col gap-2'>
      <div className='text-or-fg text-[13px] font-medium'>Creem</div>
      <div className='grid grid-cols-2 gap-2 md:grid-cols-3'>
        {props.products.map((product) => (
          <button
            key={product.productId}
            type='button'
            onClick={() => setPicked(product)}
            className='border-or-line hover:bg-or-fill flex min-w-0 flex-col gap-1 rounded-[8px] border px-3 py-2.5 text-left transition-colors'
          >
            <span className='truncate text-[14px] font-medium'>{product.name}</span>
            <span className='text-[16px] font-semibold tabular-nums'>{priceLabel(product.price, product.currency)}</span>
            <span className='text-or-muted text-[12px]'>{t('到账 {amount}', { amount: money.format(product.quota) })}</span>
          </button>
        ))}
      </div>
      {picked ? <CreemConfirm product={picked} onClose={() => setPicked(null)} /> : null}
    </div>
  )
}

function CreemConfirm(props: { product: CreemProduct; onClose: () => void }) {
  const { t } = useI18n()
  const money = useMoney()
  const checkout = useCheckout(t('已打开支付页面，支付完成后余额会自动到账'), props.onClose)
  return (
    <PayDialog
      rows={[
        { label: t('商品'), value: props.product.name },
        { label: t('价格'), value: priceLabel(props.product.price, props.product.currency) },
        { label: t('到账额度'), value: money.format(props.product.quota) },
      ]}
      error={checkout.isError ? errorMessage(checkout.error, t('支付请求失败')) : null}
      busy={checkout.isPending}
      ready
      onClose={props.onClose}
      onConfirm={() => checkout.mutate(() => startCreemCheckout(props.product.productId))}
    />
  )
}
