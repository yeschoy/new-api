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
import { useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'

import { Button, Field, Notice, Panel, Switch, TextInput, toast } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { errorMessage } from '@/lib/api'
import { useCurrency, useStatus } from '@/lib/queries'
import { quotaToUsd } from '@/pages/console/console-helpers'
import { useMoney } from '@/pages/console/console-hooks'
import { ROLE_ADMIN } from '@/pages/console/console-nav'

import type { AccountUser } from './account-api'
import { SettingRow } from './account-ui'
import { MethodFields, MethodPicker, METHODS } from './notification-fields'
import { saveNotificationSettings, type NotificationSettings, type NotifyType } from './profile-api'

/** 500,000 quota units, $1 by default, as the old site. */
const DEFAULT_THRESHOLD = 500_000

function readSettings(setting: string | undefined): NotificationSettings {
  let saved: Partial<NotificationSettings> = {}
  try {
    saved = setting ? (JSON.parse(setting) as Partial<NotificationSettings>) : {}
  } catch {
    saved = {}
  }
  const type = METHODS.some((method) => method.id === saved.notify_type) ? (saved.notify_type as NotifyType) : 'email'
  return {
    notify_type: type,
    quota_warning_threshold: saved.quota_warning_threshold || DEFAULT_THRESHOLD,
    notification_email: saved.notification_email ?? '',
    webhook_url: saved.webhook_url ?? '',
    webhook_secret: saved.webhook_secret ?? '',
    bark_url: saved.bark_url ?? '',
    gotify_url: saved.gotify_url ?? '',
    gotify_token: saved.gotify_token ?? '',
    gotify_priority: saved.gotify_priority ?? 5,
    accept_unset_model_ratio_model: Boolean(saved.accept_unset_model_ratio_model),
    record_ip_log: Boolean(saved.record_ip_log),
    upstream_model_update_notify_enabled: Boolean(saved.upstream_model_update_notify_enabled),
  }
}

/** Low-balance alerts and account preferences (PUT /api/user/setting); the threshold is typed in the site's currency. */
export function NotificationPanel(props: { user: AccountUser }) {
  const { t } = useI18n()
  const money = useMoney()
  const currency = useCurrency()
  const { data: status } = useStatus()
  const queryClient = useQueryClient()
  const thresholdId = useId()
  const [settings, setSettings] = useState(() => readSettings(props.user.setting))
  const [amount, setAmount] = useState(() =>
    String(Number((quotaToUsd(settings.quota_warning_threshold, status?.quota_per_unit) * (currency.rate || 1)).toFixed(6)))
  )
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function update<K extends keyof NotificationSettings>(key: K, value: NotificationSettings[K]) {
    setSettings((previous) => ({ ...previous, [key]: value }))
  }

  async function onSave() {
    const threshold = money.toQuota(Number(amount))
    if (threshold <= 0) return setError(t('请输入大于 0 的预警额度'))
    setError('')
    setBusy(true)
    try {
      await saveNotificationSettings({ ...settings, quota_warning_threshold: threshold })
      toast.success(t('设置已保存'))
      await queryClient.invalidateQueries({ queryKey: ['console'] })
    } catch (err) {
      setError(errorMessage(err, t('保存失败')))
    } finally {
      setBusy(false)
    }
  }

  const preferences: Array<{ key: 'accept_unset_model_ratio_model' | 'record_ip_log' | 'upstream_model_update_notify_enabled'; title: string; text: string }> = [
    { key: 'accept_unset_model_ratio_model', title: t('接受未定价模型'), text: t('允许调用尚未设置价格的模型。') },
    { key: 'record_ip_log', title: t('记录请求 IP'), text: t('在使用记录和错误日志中保存请求的 IP 地址。') },
  ]
  if (props.user.role >= ROLE_ADMIN) {
    preferences.push({
      key: 'upstream_model_update_notify_enabled',
      title: t('接收上游模型更新通知'),
      text: t('定时检测发现上游模型变化或检测失败时，用上面的方式通知你。'),
    })
  }

  return (
    <Panel title={t('通知与偏好')}>
      <div className='flex flex-col gap-5'>
        <div className='flex flex-col gap-2'>
          <span className='text-or-fg text-[13px] font-medium'>{t('通知方式')}</span>
          <MethodPicker value={settings.notify_type} onChange={(value) => update('notify_type', value)} />
        </div>
        <Field label={t('余额预警阈值')} htmlFor={thresholdId} hint={t('余额低于这个数时发送提醒。')}>
          <div className='relative max-w-[240px]'>
            <span className='text-or-muted pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[14px]'>{money.symbol}</span>
            <TextInput id={thresholdId} inputMode='decimal' value={amount} onChange={setAmount} className='pl-7' />
          </div>
        </Field>
        <MethodFields settings={settings} update={update} />
        <div className='border-or-line flex flex-col gap-4 border-t pt-5'>
          {preferences.map((item) => (
            <SettingRow key={item.key} title={item.title} description={item.text}>
              <Switch checked={settings[item.key]} onChange={(value) => update(item.key, value)} label={item.title} hideLabel />
            </SettingRow>
          ))}
        </div>
        {error ? <Notice tone='error'>{error}</Notice> : null}
        <div className='flex justify-end'>
          <Button variant='primary' busy={busy} onClick={onSave}>
            {t('保存通知设置')}
          </Button>
        </div>
      </div>
    </Panel>
  )
}
