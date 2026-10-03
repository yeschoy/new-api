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
import { ChevronDown } from 'lucide-react'
import { useId, useState } from 'react'

import { Field, Notice, Switch, TextInput, Textarea } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { cn } from '@/lib/format'
import { useMoney } from '@/pages/console/console-hooks'

import { ExpiryField } from './expiry-field'
import { GroupField } from './group-field'
import type { KeyForm } from './key-form'
import { ModelLimitPicker } from './model-limit-picker'
import type { KeyDialogData } from './use-key-dialog-data'

type BodyProps = {
  form: KeyForm
  editing: boolean
  data: KeyDialogData
  error: string | null
  onChange: (patch: Partial<KeyForm>) => void
  onGroup: (group: string) => void
}

function QuotaField(props: BodyProps) {
  const { t } = useI18n()
  const money = useMoney()
  const id = useId()
  const unlimited = props.form.unlimited
  return (
    <Field
      label={props.editing ? t('剩余额度') : t('额度上限')}
      htmlFor={id}
      hint={unlimited ? t('该密钥可使用账户的全部余额。') : t('用完后该密钥将停止工作，账户余额不受影响。')}
    >
      <Switch id={unlimited ? id : undefined} checked={unlimited} onChange={(checked) => props.onChange({ unlimited: checked })} label={t('不限额度')} />
      {unlimited ? null : (
        <div className='relative mt-1'>
          <span className='text-or-muted pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[14px]'>{money.symbol}</span>
          <TextInput id={id} value={props.form.amount} onChange={(amount) => props.onChange({ amount })} inputMode='decimal' placeholder='10' className='pl-7' />
        </div>
      )}
    </Field>
  )
}

function AdvancedFields(props: BodyProps) {
  const { t } = useI18n()
  const modelsId = useId()
  const ipsId = useId()
  // An edited key that already has limits opens with them in view.
  const [open, setOpen] = useState(props.form.models.length > 0 || props.form.allowIps.trim() !== '')
  return (
    <div className='border-or-line rounded-[8px] border'>
      <button
        type='button'
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className='flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-[14px] font-medium'
      >
        {t('高级设置')}
        <ChevronDown className={cn('text-or-muted size-4 transition-transform', open && 'rotate-180')} aria-hidden='true' />
      </button>
      {open ? (
        <div className='border-or-line flex flex-col gap-4 border-t p-3'>
          <Field label={t('模型限制')} htmlFor={modelsId} hint={t('不勾选则可使用全部模型。')}>
            <ModelLimitPicker
              id={modelsId}
              models={props.data.models.data ?? []}
              loading={props.data.models.isLoading}
              value={props.form.models}
              onChange={(models) => props.onChange({ models })}
            />
          </Field>
          <Field label={t('IP 白名单')} htmlFor={ipsId} hint={t('请勿过度依赖此功能，IP 可能被伪造，请配合 nginx、CDN 等网关使用。')}>
            <Textarea
              id={ipsId}
              rows={3}
              mono
              value={props.form.allowIps}
              onChange={(allowIps) => props.onChange({ allowIps })}
              placeholder={t('每行一个 IP，支持 CIDR，留空不限制')}
            />
          </Field>
        </div>
      ) : null}
    </div>
  )
}

/** Every field of a key: name, group, expiry, how many, credit and the advanced limits. */
export function KeyFormBody(props: BodyProps) {
  const { t } = useI18n()
  const nameId = useId()
  const countId = useId()
  return (
    <div className='flex flex-col gap-4'>
      <Field label={t('名称')} htmlFor={nameId}>
        <TextInput id={nameId} value={props.form.name} onChange={(name) => props.onChange({ name })} placeholder={t('例如：生产环境')} maxLength={50} autoFocus />
      </Field>
      <GroupField form={props.form} groups={props.data.groups.data ?? []} auto={props.data.auto.data} onGroup={props.onGroup} onChange={props.onChange} />
      <ExpiryField value={props.form.expires} onChange={(expires) => props.onChange({ expires })} />
      {props.editing ? null : (
        <Field label={t('数量')} htmlFor={countId} hint={t('一次创建多个密钥，后面的名称会自动加上随机后缀。')}>
          <TextInput id={countId} value={props.form.count} onChange={(count) => props.onChange({ count })} inputMode='decimal' className='sm:max-w-[120px]' />
        </Field>
      )}
      <QuotaField {...props} />
      <AdvancedFields {...props} />
      {props.error ? <Notice tone='error'>{props.error}</Notice> : null}
    </div>
  )
}
