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
import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { CommunityHelp } from '@/components/layout/components/community-help'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { SUPPORT_QQ_GROUP } from '@/lib/support-contact'

export function SupplierApplication(props: {
  providers: readonly { name: string }[]
}) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const clipboard = useCopyToClipboard({ notify: false })
  const schema = z.object({
    contact: z
      .string()
      .trim()
      .min(1, 'Enter contact details.')
      .max(200, 'Contact details are too long.'),
    provider: z
      .string()
      .refine(
        (value) => props.providers.some((provider) => provider.name === value),
        'Select a provider'
      ),
    capacity: z
      .string()
      .refine(
        (value) => Number.isFinite(Number(value)) && Number(value) > 0,
        'Enter a valid positive capacity amount.'
      ),
  })
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { contact: '', provider: '', capacity: '' },
  })
  const error =
    form.formState.errors.contact?.message ??
    form.formState.errors.provider?.message ??
    form.formState.errors.capacity?.message ??
    form.formState.errors.root?.message

  const onSubmit = form.handleSubmit(async (data) => {
    setCopied(false)
    form.clearErrors('root')
    const details = [
      t('Supplier application'),
      `${t('How can we reach you')}: ${data.contact}`,
      `${t('Provider')}: ${data.provider}`,
      `${t('Spare capacity in yuan')}: ¥${Number(data.capacity)}`,
    ].join('\n')
    const success = await clipboard.copyToClipboard(details)
    setCopied(success)
    if (!success) {
      form.setError('root', { message: 'Failed to copy to clipboard' })
    }
  })

  return (
    <form
      className='ci-sellerForm'
      aria-label={t('Sell capacity')}
      onSubmit={onSubmit}
    >
      <label htmlFor='seller-contact'>
        {t('How can we reach you')} <span className='ci-requiredMark'>*</span>
      </label>
      <input
        id='seller-contact'
        className='ci-input ci-input--sm'
        required
        placeholder={t('WeChat, phone, or email')}
        {...form.register('contact')}
      />
      <label htmlFor='seller-provider'>
        {t('Provider')} <span className='ci-requiredMark'>*</span>
      </label>
      <select
        id='seller-provider'
        className='ci-input ci-input--sm'
        required
        {...form.register('provider')}
      >
        <option value=''>{t('Select a provider')}</option>
        {props.providers.map((provider) => (
          <option key={provider.name} value={provider.name}>
            {provider.name}
          </option>
        ))}
      </select>
      <label htmlFor='seller-capacity'>
        {t('Spare capacity in yuan')} <span className='ci-requiredMark'>*</span>
      </label>
      <input
        id='seller-capacity'
        className='ci-input ci-input--sm'
        inputMode='decimal'
        required
        placeholder='¥'
        {...form.register('capacity')}
      />
      <button
        className='ci-button ci-button--default ci-button--size-sm ci-sellerSubmit'
        type='submit'
        disabled={form.formState.isSubmitting}
      >
        {t('Copy application details')}
      </button>
      {error ? (
        <p role='alert' className='ci-formNote'>
          {t(error)}
        </p>
      ) : null}
      <p className='ci-formNote' role={copied ? 'status' : undefined}>
        {copied
          ? t('Send the copied details to QQ group {{group}} to apply.', {
              group: SUPPORT_QQ_GROUP,
            })
          : t(
              'Copy your details, then send them to our support QQ group. This form does not submit automatically.'
            )}
      </p>
      <CommunityHelp />
    </form>
  )
}
