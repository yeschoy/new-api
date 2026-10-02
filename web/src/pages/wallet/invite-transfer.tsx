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
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'

import { Button, Field, Modal, Notice, TextInput, toast } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { errorMessage } from '@/lib/api'
import { useCurrency } from '@/lib/queries'
import { quotaToUsd } from '@/pages/console/console-helpers'
import { useMoney } from '@/pages/console/console-hooks'

import { transferInviteReward } from './wallet-api'
import { useQuotaPerUnit } from './wallet-hooks'

/**
 * "转入余额": moves invite rewards into the balance. The server takes at least
 * one unit (quota_per_unit) and at most what is waiting.
 */
export function InviteTransfer(props: { available: number; onClose: () => void }) {
  const { t } = useI18n()
  const money = useMoney()
  const currency = useCurrency()
  const perUnit = useQuotaPerUnit()
  const queryClient = useQueryClient()
  const inputId = useId()
  const minQuota = Math.ceil(perUnit)
  const [amount, setAmount] = useState(() => String(Number((quotaToUsd(minQuota, perUnit) * currency.rate).toFixed(2))))
  const quota = money.toQuota(Number(amount))

  const transfer = useMutation({
    mutationFn: () => transferInviteReward(quota),
    onSuccess: (message) => {
      toast.success(message || t('已转入余额'))
      void queryClient.invalidateQueries({ queryKey: ['console'] })
      props.onClose()
    },
  })

  let problem: string | null = null
  if (quota < minQuota) problem = t('最少转入 {amount}', { amount: money.format(minQuota) })
  else if (quota > props.available) problem = t('超过可转入的奖励')

  return (
    <Modal
      title={t('转入余额')}
      onClose={props.onClose}
      footer={
        <>
          <Button onClick={props.onClose}>{t('取消')}</Button>
          <Button variant='primary' busy={transfer.isPending} disabled={problem !== null} onClick={() => transfer.mutate()}>
            {t('转入')}
          </Button>
        </>
      }
    >
      <div className='flex flex-col gap-4'>
        <div>
          <div className='text-or-muted text-[13px]'>{t('可转入')}</div>
          <div className='mt-1 text-[24px] leading-8 font-semibold tabular-nums'>{money.format(props.available)}</div>
        </div>
        <Field label={t('转入金额')} htmlFor={inputId}>
          <div className='relative'>
            <span className='text-or-muted pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[14px]'>{money.symbol}</span>
            <TextInput id={inputId} value={amount} onChange={setAmount} inputMode='decimal' className='pl-7 tabular-nums' />
          </div>
        </Field>
        {problem ? <p className='text-or-red text-[12px]'>{problem}</p> : null}
        {transfer.isError ? <Notice tone='error'>{errorMessage(transfer.error, t('转入失败'))}</Notice> : null}
      </div>
    </Modal>
  )
}
