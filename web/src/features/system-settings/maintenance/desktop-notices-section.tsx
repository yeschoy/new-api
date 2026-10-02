import type { TFunction } from 'i18next'
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
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Textarea } from '@/components/ui/textarea'

import { SettingsForm } from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'
import {
  DESKTOP_NOTICES_EXAMPLE,
  type DesktopNoticesValidationError,
  validateDesktopNotices,
} from './desktop-notices'

type DesktopNoticesFormValues = {
  DesktopNotices: string
}

type DesktopNoticesSectionProps = {
  defaultValue: string
}

function formatValidationError(
  t: TFunction,
  error: DesktopNoticesValidationError
): string {
  switch (error.kind) {
    case 'invalid-json':
      return t('Desktop notices must be valid JSON')
    case 'not-array':
      return t('Desktop notices must be a JSON array')
    case 'not-object':
      return t('Desktop notice #{{position}} must be a JSON object', {
        position: error.position,
      })
    case 'missing-title':
      return t('Desktop notice #{{position}} is missing a title', {
        position: error.position,
      })
    case 'duplicate-id':
      return t('Desktop notice #{{position}} reuses id "{{id}}"', {
        position: error.position,
        id: error.id,
      })
  }
}

export function DesktopNoticesSection(props: DesktopNoticesSectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const form = useForm<DesktopNoticesFormValues>({
    defaultValues: { DesktopNotices: props.defaultValue },
  })

  useEffect(() => {
    form.reset({ DesktopNotices: props.defaultValue })
  }, [props.defaultValue, form])

  const onSubmit = async (values: DesktopNoticesFormValues) => {
    const error = validateDesktopNotices(values.DesktopNotices)
    if (error) {
      form.setError('DesktopNotices', {
        message: formatValidationError(t, error),
      })
      return
    }
    if (values.DesktopNotices === props.defaultValue) {
      return
    }
    const result = await updateOption.mutateAsync({
      key: 'DesktopNotices',
      value: values.DesktopNotices,
    })
    if (!result.success) {
      form.setError('DesktopNotices', {
        message: result.message || t('Failed to update setting'),
      })
    }
  }

  return (
    <SettingsSection title={t('Desktop Notices')}>
      <Form {...form}>
        <SettingsForm onSubmit={form.handleSubmit(onSubmit)}>
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            isSaving={updateOption.isPending}
            saveLabel='Save desktop notices'
          />
          <FormField
            control={form.control}
            name='DesktopNotices'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Desktop notices JSON')}</FormLabel>
                <FormControl>
                  <Textarea
                    rows={14}
                    className='font-mono text-xs'
                    placeholder={DESKTOP_NOTICES_EXAMPLE}
                    spellCheck={false}
                    {...field}
                    onChange={(event) => {
                      field.onChange(event)
                      form.clearErrors('DesktopNotices')
                    }}
                  />
                </FormControl>
                <FormDescription>
                  {t(
                    'Announcements shown in the desktop app. A JSON array; each entry needs a title, ids must be unique, and expired entries are hidden automatically.'
                  )}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </SettingsForm>
      </Form>
    </SettingsSection>
  )
}
