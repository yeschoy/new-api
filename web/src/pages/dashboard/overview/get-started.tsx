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
import { Check, Copy } from 'lucide-react'

import { Button, toast } from '@/components/ui'
import { tk, useI18n } from '@/i18n/i18n'
import { useAuth } from '@/lib/auth-store'
import { cn } from '@/lib/format'
import { useStatus } from '@/lib/queries'
import { listKeys } from '@/lib/services'
import { useConsoleKey, useSelf } from '@/pages/console/console-hooks'

import { LinkButton, Section } from '../dashboard-ui'

/** Whether the account has any API key (the first page of keys is enough). */
function useKeysPeek() {
  return useQuery({
    queryKey: useConsoleKey('dashboard', 'keys-peek'),
    queryFn: () => listKeys(1, 10),
    retry: false,
  })
}

const STEPS = [
  { title: tk('充值余额'), body: tk('让请求可以扣费。'), action: tk('去充值'), to: '/settings/credits' },
  { title: tk('创建 API 密钥'), body: tk('用密钥调用本站接口。'), action: tk('创建密钥'), to: '/settings/keys' },
  { title: tk('发起第一次请求'), body: tk('在对话页试试，或用密钥从你的应用调用。'), action: tk('去对话'), to: '/chat' },
]

/** Three checked steps for a new account; gone once all three are done. */
export function GetStarted() {
  const { t } = useI18n()
  const auth = useAuth()
  const self = useSelf()
  const keys = useKeysPeek()
  // Wait for fresh figures so a returning account never sees the steps flash.
  if (!self.isSuccess || !keys.isSuccess) return null
  const user = self.data ?? auth.user
  const done = [(user?.quota ?? 0) > 0, (keys.data.items ?? []).length > 0, (user?.request_count ?? 0) > 0]
  const count = done.filter(Boolean).length
  if (count === done.length) return null
  const current = done.indexOf(false)

  return (
    <Section
      title={t('开始使用')}
      description={t('完成 {done}/3 步', { done: count })}
      extra={
        <LinkButton to={STEPS[current].to} variant='primary'>
          {t(STEPS[current].action)}
        </LinkButton>
      }
    >
      <ol className='grid gap-3 md:grid-cols-3'>
        {STEPS.map((step, index) => (
          <li
            key={step.title}
            aria-current={index === current ? 'step' : undefined}
            className={cn('rounded-[8px] border p-4', index === current ? 'border-or-primary/40 bg-or-primary-soft' : 'border-or-line')}
          >
            <div className='flex items-center gap-2 text-[14px] font-medium'>
              <span
                className={cn(
                  'flex size-5 shrink-0 items-center justify-center rounded-full text-[12px]',
                  done[index] ? 'bg-or-primary text-or-bg' : 'border-or-line text-or-muted border'
                )}
              >
                {done[index] ? <Check className='size-3' aria-label={t('已完成')} /> : index + 1}
              </span>
              {t(step.title)}
            </div>
            <p className='text-or-muted mt-1.5 text-[13px]'>{t(step.body)}</p>
          </li>
        ))}
      </ol>
    </Section>
  )
}

/** The base URL to put in a client, with where to get a key and the guide. */
export function QuickConnect() {
  const { t } = useI18n()
  const { data: status } = useStatus()
  const keys = useKeysPeek()
  const baseUrl = `${(status?.server_address || window.location.origin).replace(/\/+$/, '')}/v1`
  const keyAction = (keys.data?.items ?? []).length > 0 ? t('管理密钥') : t('创建第一个密钥')

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(baseUrl)
      toast.success(t('已复制'))
    } catch {
      toast.error(t('复制失败'))
    }
  }

  return (
    <Section title={t('快速接入')} description={t('完全兼容 OpenAI SDK，替换接口地址和密钥即可。')}>
      <div className='flex flex-col gap-4 md:flex-row md:items-end md:justify-between'>
        <div className='min-w-0 flex-1'>
          <div className='text-or-muted text-[13px]'>{t('接口地址')}</div>
          <div className='mt-1.5 flex min-w-0 items-center gap-2'>
            <code className='border-or-line bg-or-fill font-geist min-w-0 flex-1 truncate rounded-[6px] border px-3 py-2 text-[13px]'>
              {baseUrl}
            </code>
            <Button onClick={copy} ariaLabel={t('复制接口地址')} title={t('复制接口地址')}>
              <Copy className='size-4' aria-hidden='true' />
            </Button>
          </div>
        </div>
        <div className='flex flex-wrap gap-2'>
          {keys.isSuccess ? <LinkButton to='/settings/keys'>{keyAction}</LinkButton> : null}
          <LinkButton to='/beginner-guide'>{t('新手指南')}</LinkButton>
        </div>
      </div>
    </Section>
  )
}
