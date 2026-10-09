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
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import * as z from 'zod'

import { RichContent } from '@/components/rich-content'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

import { SettingsForm } from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'

const noticeSchema = z.object({
  Notice: z.string().optional(),
})

type NoticeFormValues = z.infer<typeof noticeSchema>

type NoticeSectionProps = {
  defaultValue: string
}

export function NoticeSection({ defaultValue }: NoticeSectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const [tab, setTab] = useState<'edit' | 'preview'>('edit')
  const form = useForm<NoticeFormValues>({
    resolver: zodResolver(noticeSchema),
    defaultValues: {
      Notice: defaultValue ?? '',
    },
  })

  useEffect(() => {
    form.reset({ Notice: defaultValue ?? '' })
  }, [defaultValue, form])

  const noticeValue = form.watch('Notice') ?? ''

  const onSubmit = async (values: NoticeFormValues) => {
    const normalized = values.Notice ?? ''
    if (normalized === (defaultValue ?? '')) {
      return
    }
    await updateOption.mutateAsync({
      key: 'Notice',
      value: normalized,
    })
  }

  return (
    <SettingsSection title={t('System Notice')}>
      <Form {...form}>
        <SettingsForm onSubmit={form.handleSubmit(onSubmit)}>
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            isSaving={updateOption.isPending}
            saveLabel='Save notice'
          />
          <FormField
            control={form.control}
            name='Notice'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Announcement content')}</FormLabel>
                <FormDescription>
                  {t(
                    'Shown in the web console notice tab. Markdown is supported.'
                  )}
                </FormDescription>
                <Tabs
                  value={tab}
                  onValueChange={(value) =>
                    setTab(value === 'preview' ? 'preview' : 'edit')
                  }
                >
                  <TabsList>
                    <TabsTrigger value='edit'>{t('Edit')}</TabsTrigger>
                    <TabsTrigger value='preview'>{t('Preview')}</TabsTrigger>
                  </TabsList>
                  <TabsContent value='edit' className='mt-2'>
                    <FormControl>
                      <Textarea
                        rows={10}
                        placeholder={t(
                          'Planned maintenance on Friday at 22:00 UTC...'
                        )}
                        {...field}
                      />
                    </FormControl>
                  </TabsContent>
                  <TabsContent value='preview' className='mt-2'>
                    <div className='bg-muted/40 min-h-40 rounded-md border p-3 text-sm'>
                      {noticeValue.trim() ? (
                        <RichContent breaks content={noticeValue} />
                      ) : (
                        <span className='text-muted-foreground'>
                          {t('Nothing to preview yet.')}
                        </span>
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
                <FormMessage />
              </FormItem>
            )}
          />
        </SettingsForm>
      </Form>
    </SettingsSection>
  )
}
