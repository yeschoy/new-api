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
import { ExternalLink, Ticket } from 'lucide-react'
import { useId, useState } from 'react'

import { useI18n } from '@/i18n/i18n'
import { errorMessage } from '@/lib/api'
import { unwrap, type TopUpInfo } from '@/lib/console-api'
import { redeemCode } from '@/lib/services'

import { useMoney } from './console-hooks'
import { Button, Notice, Panel, TextInput } from './console-ui'

/** "兑换码" card: the code form, or a notice while /api/user/topup/info has codes switched off. */
export function RedeemPanel(props: { info?: TopUpInfo }) {
  const { t } = useI18n()
  const money = useMoney()
  const queryClient = useQueryClient()
  const inputId = useId()
  const [code, setCode] = useState('')
  const [result, setResult] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const closed = props.info?.enable_redemption === false

  const redeem = useMutation({
    mutationFn: async (key: string) => unwrap(await redeemCode(key), t('兑换失败')),
    onSuccess: (quota) => {
      setCode('')
      setResult({ tone: 'success', text: t('兑换成功，已到账 {amount}', { amount: money.format(quota) }) })
      void queryClient.invalidateQueries({ queryKey: ['console'] })
    },
    onError: (err) => setResult({ tone: 'error', text: errorMessage(err, t('兑换失败')) }),
  })

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    const key = code.trim()
    if (!key) {
      setResult({ tone: 'error', text: t('请输入兑换码') })
      return
    }
    setResult(null)
    redeem.mutate(key)
  }

  const link = props.info?.topup_link
  if (closed) {
    return (
      <Panel title={t('兑换码')}>
        <Notice tone='info'>{t('本站暂未开放兑换码充值，请联系管理员。')}</Notice>
      </Panel>
    )
  }
  return (
    <Panel
      title={t('兑换码')}
      extra={
        link ? (
          <a href={link} target='_blank' rel='noopener noreferrer' className='text-or-primary flex items-center gap-1 text-[13px] hover:underline'>
            {t('获取兑换码')} <ExternalLink className='size-3.5' aria-hidden='true' />
          </a>
        ) : null
      }
    >
      <form onSubmit={onSubmit} className='flex flex-col gap-3'>
        <label htmlFor={inputId} className='text-or-muted text-[13px]'>
          {t('输入兑换码，额度将立即计入账户余额。')}
        </label>
        <div className='flex flex-col gap-2 sm:flex-row'>
          <TextInput id={inputId} value={code} onChange={setCode} placeholder={t('兑换码')} className='font-geist' />
          <Button type='submit' variant='primary' busy={redeem.isPending}>
            <Ticket className='size-4' aria-hidden='true' />
            {t('兑换')}
          </Button>
        </div>
        {result ? <Notice tone={result.tone}>{result.text}</Notice> : null}
      </form>
    </Panel>
  )
}
