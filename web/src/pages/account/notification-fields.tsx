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
import { useId } from 'react'

import { Field, TextInput } from '@/components/ui'
import { tk, useI18n } from '@/i18n/i18n'
import { cn } from '@/lib/format'

import type { NotificationSettings, NotifyType } from './profile-api'

export const METHODS: Array<{ id: NotifyType; label: string }> = [
  { id: 'email', label: tk('邮件') },
  { id: 'webhook', label: 'Webhook' },
  { id: 'bark', label: 'Bark' },
  { id: 'gotify', label: 'Gotify' },
]

/** The four ways to be notified, as a radio group of buttons. */
export function MethodPicker(props: { value: NotifyType; onChange: (value: NotifyType) => void }) {
  const { t } = useI18n()
  return (
    <div role='radiogroup' aria-label={t('通知方式')} className='grid grid-cols-2 gap-2 sm:grid-cols-4'>
      {METHODS.map((method) => {
        const selected = method.id === props.value
        return (
          <button
            key={method.id}
            type='button'
            role='radio'
            aria-checked={selected}
            onClick={() => props.onChange(method.id)}
            className={cn(
              'h-9 rounded-[6px] border px-3 text-[14px] font-medium transition-colors',
              selected ? 'border-or-primary bg-or-primary-soft text-or-primary' : 'border-or-line text-or-muted hover:bg-or-fill hover:text-or-fg'
            )}
          >
            {t(method.label)}
          </button>
        )
      })}
    </div>
  )
}

type Update = <K extends keyof NotificationSettings>(key: K, value: NotificationSettings[K]) => void

/** The address, keys or server of the chosen method. */
export function MethodFields(props: { settings: NotificationSettings; update: Update }) {
  const { t } = useI18n()
  const ids = { a: useId(), b: useId(), c: useId() }
  const settings = props.settings
  switch (settings.notify_type) {
    case 'webhook':
      return (
        <>
          <Field label={t('Webhook 地址')} htmlFor={ids.a}>
            <TextInput id={ids.a} value={settings.webhook_url} onChange={(value) => props.update('webhook_url', value)} placeholder='https://example.com/webhook' />
          </Field>
          <Field label={t('签名密钥')} htmlFor={ids.b} hint={t('可选，用于校验请求来源。')}>
            <TextInput id={ids.b} type='password' value={settings.webhook_secret} onChange={(value) => props.update('webhook_secret', value)} />
          </Field>
        </>
      )
    case 'bark':
      return (
        <Field label={t('推送地址')} htmlFor={ids.a} hint={t('支持变量：{vars}', { vars: '{{title}}, {{content}}' })}>
          <TextInput id={ids.a} value={settings.bark_url} onChange={(value) => props.update('bark_url', value)} placeholder='https://api.day.app/yourkey/{{title}}/{{content}}' />
        </Field>
      )
    case 'gotify':
      return (
        <>
          <Field label={t('服务器地址')} htmlFor={ids.a}>
            <TextInput id={ids.a} value={settings.gotify_url} onChange={(value) => props.update('gotify_url', value)} placeholder='https://gotify.example.com' />
          </Field>
          <Field label={t('应用令牌')} htmlFor={ids.b} hint={t('在 Gotify 中创建一个应用，把它的令牌填在这里。')}>
            <TextInput id={ids.b} type='password' value={settings.gotify_token} onChange={(value) => props.update('gotify_token', value)} />
          </Field>
          <Field label={t('消息优先级')} htmlFor={ids.c} hint={t('0 最低，10 最高，默认 5。')}>
            <TextInput
              id={ids.c}
              inputMode='decimal'
              value={String(settings.gotify_priority)}
              onChange={(value) => props.update('gotify_priority', Math.min(10, Math.max(0, Math.round(Number(value) || 0))))}
              className='w-24'
            />
          </Field>
          <a href='https://gotify.net/' target='_blank' rel='noopener noreferrer' className='text-or-primary text-[13px] hover:underline'>
            {t('Gotify 文档')}
          </a>
        </>
      )
    default:
      return (
        <Field label={t('通知邮箱')} htmlFor={ids.a}>
          <TextInput
            id={ids.a}
            type='email'
            value={settings.notification_email}
            onChange={(value) => props.update('notification_email', value)}
            placeholder={t('留空则使用账户邮箱')}
          />
        </Field>
      )
  }
}
