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
import type { TFunction } from 'i18next'
import { Code2, Plus, Save, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { getServerErrorMessage } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'

import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'
import {
  createEmptyDesktopNotice,
  datetimeLocalToEpochMs,
  type DesktopNotice,
  type DesktopNoticesValidationError,
  DESKTOP_NOTICES_EXAMPLE,
  epochMsToDatetimeLocal,
  parseDesktopNotices,
  serializeDesktopNotices,
  validateDesktopNotices,
} from './desktop-notices'

type DesktopNoticesSectionProps = {
  defaultValue: string
}

type NoticeFormValues = {
  id: string
  title: string
  body: string
  severity: 'info' | 'warning'
  publishedAt: string
  expiresAt: string
  banner: boolean
  actionKind: 'none' | 'wallet' | 'link'
  actionLabel: string
  actionUrl: string
}

const NOTICE_FORM_ID = 'desktop-notice-form'

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

function toFormValues(notice: DesktopNotice): NoticeFormValues {
  return {
    id: notice.id ?? '',
    title: notice.title ?? '',
    body: notice.body ?? '',
    severity: notice.severity === 'warning' ? 'warning' : 'info',
    publishedAt: epochMsToDatetimeLocal(notice.publishedAtEpochMs),
    expiresAt: epochMsToDatetimeLocal(notice.expiresAtEpochMs),
    banner: Boolean(notice.banner),
    actionKind: notice.action?.kind ?? 'none',
    actionLabel: notice.action?.label ?? '',
    actionUrl: notice.action?.url ?? '',
  }
}

function fromFormValues(values: NoticeFormValues): DesktopNotice {
  return {
    id: values.id.trim(),
    title: values.title.trim(),
    body: values.body,
    severity: values.severity,
    publishedAtEpochMs: datetimeLocalToEpochMs(values.publishedAt),
    expiresAtEpochMs: datetimeLocalToEpochMs(values.expiresAt),
    banner: values.banner,
    action:
      values.actionKind === 'none'
        ? null
        : {
            kind: values.actionKind,
            label: values.actionLabel,
            url: values.actionUrl,
          },
  }
}

function formatEpoch(ms?: number): string {
  if (!ms || ms <= 0) return '—'
  try {
    return new Date(ms).toLocaleString('zh-CN', { hour12: false })
  } catch {
    return '—'
  }
}

export function DesktopNoticesSection(props: DesktopNoticesSectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const [notices, setNotices] = useState<DesktopNotice[]>(() =>
    parseDesktopNotices(props.defaultValue)
  )
  const [jsonDraft, setJsonDraft] = useState(props.defaultValue || '[]')
  const [jsonError, setJsonError] = useState<string | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [bodyTab, setBodyTab] = useState<'edit' | 'preview'>('edit')
  const [saveError, setSaveError] = useState<string | null>(null)

  const form = useForm<NoticeFormValues>({
    defaultValues: toFormValues(createEmptyDesktopNotice()),
  })

  useEffect(() => {
    const parsed = parseDesktopNotices(props.defaultValue)
    setNotices(parsed)
    try {
      if (props.defaultValue.trim() === '') {
        setJsonDraft('[]')
      } else {
        JSON.parse(props.defaultValue)
        setJsonDraft(serializeDesktopNotices(parsed))
      }
    } catch {
      setJsonDraft(props.defaultValue)
    }
    setJsonError(null)
    setSaveError(null)
  }, [props.defaultValue])

  const savedSerialized = useMemo(
    () => serializeDesktopNotices(parseDesktopNotices(props.defaultValue || '[]')),
    [props.defaultValue]
  )
  const currentSerialized = useMemo(
    () => serializeDesktopNotices(notices),
    [notices]
  )
  const hasChanges = currentSerialized !== savedSerialized

  const openCreate = () => {
    setEditingIndex(null)
    form.reset(toFormValues(createEmptyDesktopNotice()))
    setBodyTab('edit')
    setDialogOpen(true)
  }

  const openEdit = (index: number) => {
    setEditingIndex(index)
    form.reset(toFormValues(notices[index] ?? createEmptyDesktopNotice()))
    setBodyTab('edit')
    setDialogOpen(true)
  }

  const removeNotice = (index: number) => {
    setNotices((prev) => prev.filter((_, i) => i !== index))
    setSaveError(null)
  }

  const onSubmitNotice = (values: NoticeFormValues) => {
    if (!values.title.trim()) {
      form.setError('title', { message: t('Title is required') })
      return
    }
    if (values.actionKind === 'link' && !/^https?:\/\//i.test(values.actionUrl.trim())) {
      form.setError('actionUrl', {
        message: t('Link action requires an http(s) URL'),
      })
      return
    }
    const next = fromFormValues(values)
    setNotices((prev) => {
      if (editingIndex === null) return [...prev, next]
      return prev.map((item, i) => (i === editingIndex ? next : item))
    })
    setDialogOpen(false)
    setSaveError(null)
  }

  const applyJsonDraft = () => {
    const error = validateDesktopNotices(jsonDraft)
    if (error) {
      setJsonError(formatValidationError(t, error))
      return
    }
    setNotices(parseDesktopNotices(jsonDraft.trim() === '' ? '[]' : jsonDraft))
    setJsonDraft(
      serializeDesktopNotices(
        parseDesktopNotices(jsonDraft.trim() === '' ? '[]' : jsonDraft)
      )
    )
    setJsonError(null)
    toast.success(t('JSON applied to the form list'))
  }

  const saveAll = async () => {
    const value = serializeDesktopNotices(notices)
    const error = validateDesktopNotices(value)
    if (error) {
      setSaveError(formatValidationError(t, error))
      return
    }
    if (value === savedSerialized) return
    try {
      await updateOption.mutateAsync({
        key: 'DesktopNotices',
        value,
      })
      setJsonDraft(value)
      setSaveError(null)
    } catch (err) {
      setSaveError(getServerErrorMessage(err, t('Failed to update setting')))
    }
  }

  const actionKind = form.watch('actionKind')
  const bodyValue = form.watch('body')

  return (
    <SettingsSection title={t('Desktop Notices')}>
      <div className='space-y-4'>
        <p className='text-muted-foreground text-sm'>
          {t(
            'Announcements shown in the desktop client. Prefer the form below; expired notices hide automatically.'
          )}
        </p>

        <div className='flex flex-wrap items-center gap-2'>
          <Button type='button' size='sm' onClick={openCreate}>
            <Plus className='mr-2 h-4 w-4' />
            {t('Add desktop notice')}
          </Button>
          <Button
            type='button'
            size='sm'
            variant='secondary'
            disabled={!hasChanges || updateOption.isPending}
            onClick={() => void saveAll()}
          >
            <Save className='mr-2 h-4 w-4' />
            {updateOption.isPending
              ? t('Saving...')
              : t('Save desktop notices')}
          </Button>
          <SettingsPageFormActions
            onSave={() => void saveAll()}
            isSaving={updateOption.isPending}
            saveLabel='Save desktop notices'
          />
        </div>

        {saveError ? (
          <p className='text-destructive text-sm' role='alert'>
            {saveError}
          </p>
        ) : null}

        {notices.length === 0 ? (
          <div className='text-muted-foreground rounded-lg border border-dashed p-6 text-sm'>
            {t('No desktop notices yet. Click "Add desktop notice" to create one.')}
          </div>
        ) : (
          <ul className='space-y-3'>
            {notices.map((notice, index) => (
              <li
                key={`${notice.id || 'row'}-${index}`}
                className='bg-card rounded-lg border p-4 shadow-xs'
              >
                <div className='flex flex-wrap items-start justify-between gap-3'>
                  <div className='min-w-0 flex-1 space-y-2'>
                    <div className='flex flex-wrap items-center gap-2'>
                      <h3 className='truncate text-sm font-medium'>
                        {notice.title || t('(Untitled)')}
                      </h3>
                      <StatusBadge
                        label={
                          notice.severity === 'warning'
                            ? t('Warning')
                            : t('Info')
                        }
                        variant={
                          notice.severity === 'warning' ? 'warning' : 'info'
                        }
                        copyable={false}
                      />
                      {notice.banner ? (
                        <StatusBadge
                          label={t('Banner')}
                          variant='success'
                          copyable={false}
                        />
                      ) : null}
                    </div>
                    {notice.body ? (
                      <p className='text-muted-foreground line-clamp-2 whitespace-pre-wrap text-sm'>
                        {notice.body}
                      </p>
                    ) : null}
                    <div className='text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs'>
                      {notice.id ? <span>ID: {notice.id}</span> : null}
                      <span>
                        {t('Published')}: {formatEpoch(notice.publishedAtEpochMs)}
                      </span>
                      <span>
                        {t('Expires')}:{' '}
                        {notice.expiresAtEpochMs
                          ? formatEpoch(notice.expiresAtEpochMs)
                          : t('Never')}
                      </span>
                      {notice.action?.kind ? (
                        <span>
                          {t('Action')}: {notice.action.kind}
                          {notice.action.label
                            ? ` · ${notice.action.label}`
                            : ''}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className='flex shrink-0 gap-2'>
                    <Button
                      type='button'
                      size='sm'
                      variant='outline'
                      onClick={() => openEdit(index)}
                    >
                      {t('Edit')}
                    </Button>
                    <Button
                      type='button'
                      size='sm'
                      variant='destructive'
                      onClick={() => removeNotice(index)}
                    >
                      <Trash2 className='h-4 w-4' />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
          <CollapsibleTrigger
            render={
              <Button
                type='button'
                variant='ghost'
                size='sm'
                className='px-0'
              />
            }
          >
            <Code2 className='mr-2 h-4 w-4' />
            {t('Advanced: edit JSON')}
          </CollapsibleTrigger>
          <CollapsibleContent className='mt-3 space-y-3'>
            <Textarea
              rows={12}
              className='font-mono text-xs'
              aria-label={t('Desktop notices JSON')}
              aria-invalid={Boolean(jsonError) || undefined}
              placeholder={DESKTOP_NOTICES_EXAMPLE}
              spellCheck={false}
              value={jsonDraft}
              onChange={(event) => {
                setJsonDraft(event.target.value)
                setJsonError(null)
              }}
            />
            {jsonError ? (
              <p className='text-destructive text-sm' role='alert'>
                {jsonError}
              </p>
            ) : (
              <p className='text-muted-foreground text-xs'>
                {t(
                  'Paste or tweak the raw JSON array, then apply it back to the form list before saving.'
                )}
              </p>
            )}
            <Button type='button' size='sm' variant='outline' onClick={applyJsonDraft}>
              {t('Apply JSON to list')}
            </Button>
          </CollapsibleContent>
        </Collapsible>
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={
          editingIndex === null
            ? t('Add desktop notice')
            : t('Edit desktop notice')
        }
        description={t(
          'Shown in the desktop app. Title is required; other fields are optional.'
        )}
        contentClassName='max-w-2xl'
        contentHeight='auto'
        bodyClassName='space-y-4'
        footer={
          <>
            <Button
              type='button'
              variant='outline'
              onClick={() => setDialogOpen(false)}
            >
              {t('Cancel')}
            </Button>
            <Button type='submit' form={NOTICE_FORM_ID}>
              {editingIndex === null ? t('Add') : t('Update')}
            </Button>
          </>
        }
      >
        <Form {...form}>
          <form
            id={NOTICE_FORM_ID}
            className='space-y-4'
            onSubmit={form.handleSubmit(onSubmitNotice)}
          >
            <div className='grid gap-4 sm:grid-cols-2'>
              <FormField
                control={form.control}
                name='title'
                render={({ field }) => (
                  <FormItem className='sm:col-span-2'>
                    <FormLabel>{t('Title')}</FormLabel>
                    <FormControl>
                      <Input
                        maxLength={120}
                        placeholder={t('e.g. Scheduled maintenance')}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='id'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Notice ID')}</FormLabel>
                    <FormControl>
                      <Input
                        maxLength={64}
                        placeholder='notice-2026-10-09'
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('Stable id so clients can mark a notice as read.')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='severity'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Severity')}</FormLabel>
                    <Select
                      items={[
                        { value: 'info', label: t('Info') },
                        { value: 'warning', label: t('Warning') },
                      ]}
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger className='w-full'>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value='info'>{t('Info')}</SelectItem>
                        <SelectItem value='warning'>{t('Warning')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name='body'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Body')}</FormLabel>
                  <Tabs
                    value={bodyTab}
                    onValueChange={(v) =>
                      setBodyTab(v === 'preview' ? 'preview' : 'edit')
                    }
                  >
                    <TabsList>
                      <TabsTrigger value='edit'>{t('Edit')}</TabsTrigger>
                      <TabsTrigger value='preview'>{t('Preview')}</TabsTrigger>
                    </TabsList>
                    <TabsContent value='edit' className='mt-2'>
                      <FormControl>
                        <Textarea
                          rows={6}
                          maxLength={2000}
                          placeholder={t(
                            'Plain text. Use a blank line to separate paragraphs.'
                          )}
                          {...field}
                        />
                      </FormControl>
                    </TabsContent>
                    <TabsContent value='preview' className='mt-2'>
                      <div
                        className={cn(
                          'bg-muted/40 min-h-32 rounded-md border p-3 text-sm whitespace-pre-wrap'
                        )}
                      >
                        {bodyValue?.trim()
                          ? bodyValue
                          : t('Nothing to preview yet.')}
                      </div>
                    </TabsContent>
                  </Tabs>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className='grid gap-4 sm:grid-cols-2'>
              <FormField
                control={form.control}
                name='publishedAt'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Published at')}</FormLabel>
                    <FormControl>
                      <Input type='datetime-local' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='expiresAt'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Expires at')}</FormLabel>
                    <FormControl>
                      <Input type='datetime-local' {...field} />
                    </FormControl>
                    <FormDescription>
                      {t('Leave empty for no expiry.')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name='banner'
              render={({ field }) => (
                <FormItem className='flex flex-row items-center gap-3 space-y-0'>
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={(checked) =>
                        field.onChange(Boolean(checked))
                      }
                    />
                  </FormControl>
                  <div>
                    <FormLabel className='font-normal'>
                      {t('Show as banner')}
                    </FormLabel>
                    <FormDescription>
                      {t('Highlight this notice at the top of the client.')}
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />

            <div className='grid gap-4 sm:grid-cols-2'>
              <FormField
                control={form.control}
                name='actionKind'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Button action')}</FormLabel>
                    <Select
                      items={[
                        { value: 'none', label: t('None') },
                        { value: 'wallet', label: t('Open wallet') },
                        { value: 'link', label: t('Open link') },
                      ]}
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger className='w-full'>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value='none'>{t('None')}</SelectItem>
                        <SelectItem value='wallet'>{t('Open wallet')}</SelectItem>
                        <SelectItem value='link'>{t('Open link')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='actionLabel'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Button label')}</FormLabel>
                    <FormControl>
                      <Input
                        disabled={actionKind === 'none'}
                        placeholder={t('e.g. Top up')}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {actionKind === 'link' ? (
                <FormField
                  control={form.control}
                  name='actionUrl'
                  render={({ field }) => (
                    <FormItem className='sm:col-span-2'>
                      <FormLabel>{t('Link URL')}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder='https://...'
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : null}
            </div>
          </form>
        </Form>
      </Dialog>
    </SettingsSection>
  )
}
