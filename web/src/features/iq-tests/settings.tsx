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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { handleServerError } from '@/lib/handle-server-error'
import { getServerErrorStatus } from '@/lib/server-error-message'

import { getIQConfig, getIQConfigs, getIQTargets, saveIQConfig } from './api'
import { editableIQConfig, iqConfigSchema } from './config-schema'
import { iqKeys, iqQueryOptions, isCurrentIQScope } from './queries'
import { IQTargetSelector } from './target-selector'
import type { IQConfig, IQConfigInput, IQTarget } from './types'

export function IQSettings(props: {
  scope: string
  canWrite: boolean
  onClose: () => void
  group?: string
  creating?: boolean
}) {
  const { t } = useTranslation()
  const [selection, setSelection] = useState(props.group ?? '')
  const config = useQuery({
    ...iqQueryOptions,
    queryKey: iqKeys.configs(props.scope),
    queryFn: ({ signal }) => getIQConfigs(signal),
  })
  const targets = useQuery({
    ...iqQueryOptions,
    queryKey: iqKeys.targets(props.scope),
    queryFn: ({ signal }) => getIQTargets(signal),
  })
  const savedGroups = config.data?.tasks.map((task) => task.group) ?? []
  const groups = props.creating
    ? (targets.data?.map((target) => target.group) ?? []).filter(
        (group) => !savedGroups.includes(group)
      )
    : savedGroups
  const group = selection || (props.creating ? '' : groups[0]) || ''
  const selected = config.data?.tasks.find((task) => task.group === group)
  const task: IQConfig | undefined =
    selected ??
    (props.creating && config.data && group && groups.includes(group)
      ? {
          group,
          version: 0,
          prompt: config.data.default_prompt,
          prompts: [],
          reasoning_effort: '',
          targets: [],
          enabled: false,
          schedule_mode: 'interval',
          interval_hours: 24,
          daily_time: '09:00',
          timezone: 'Asia/Shanghai',
          next_run_at: 0,
          updated_at: 0,
          updated_by: 0,
        }
      : undefined)
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
      title={props.creating ? t('New plan') : t('IQ test settings')}
      description={t(
        'Save before running. Tests use site resources, not your balance.'
      )}
      showCloseButton={false}
      footer={
        <Button variant='outline' onClick={props.onClose}>
          {t('Close')}
        </Button>
      }
    >
      {(config.isError || targets.isError) && (
        <ErrorState
          onRetry={() => {
            void config.refetch()
            void targets.refetch()
          }}
        />
      )}
      {!config.isError &&
        !targets.isError &&
        (config.isPending || targets.isPending) && <LoadingState />}
      {!config.isError && !targets.isError && config.data && targets.data && (
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor='iq-task-group'>{t('Task group')}</FieldLabel>
            <NativeSelect
              id='iq-task-group'
              value={group}
              onChange={(event) => setSelection(event.target.value)}
            >
              {props.creating && (
                <NativeSelectOption value=''>
                  {t('Select a group')}
                </NativeSelectOption>
              )}
              {groups.map((name) => (
                <NativeSelectOption key={name} value={name}>
                  {name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <FieldDescription>
              {t(
                'Only saved plans appear in the gallery. Selecting a group does not create a plan.'
              )}
            </FieldDescription>
          </Field>
          {task ? (
            <IQConfigForm
              key={group}
              scope={props.scope}
              config={task}
              catalog={targets.data.filter((target) => target.group === group)}
              canWrite={props.canWrite}
              onSaved={props.creating ? props.onClose : undefined}
            />
          ) : (
            <p>{t('No compatible targets available')}</p>
          )}
        </FieldGroup>
      )}
    </Dialog>
  )
}

export function IQConfigForm(props: {
  scope: string
  config: IQConfig
  catalog: IQTarget[]
  canWrite: boolean
  onSaved?: () => void
}) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const [conflict, setConflict] = useState(false)
  const [promptKeys, setPromptKeys] = useState(() =>
    editableIQConfig(props.config).prompts.map(() => crypto.randomUUID())
  )
  const form = useForm<IQConfigInput>({
    resolver: zodResolver(iqConfigSchema),
    defaultValues: editableIQConfig(props.config),
  })
  const mode = useWatch({ control: form.control, name: 'schedule_mode' })
  const targets = useWatch({ control: form.control, name: 'targets' })
  const save = useMutation({
    mutationFn: saveIQConfig,
    retry: false,
    onSuccess: (config) => {
      if (!isCurrentIQScope(props.scope)) return
      client.setQueryData(
        iqKeys.config(props.scope, props.config.group),
        config
      )
      void client.invalidateQueries({ queryKey: iqKeys.configs(props.scope) })
      form.reset(editableIQConfig(config))
      setPromptKeys(
        editableIQConfig(config).prompts.map(() => crypto.randomUUID())
      )
      setConflict(false)
      void client.invalidateQueries({ queryKey: iqKeys.results(props.scope) })
      toast.success(t('Saved successfully'))
      props.onSaved?.()
    },
    onError: (error) => {
      if (getServerErrorStatus(error) === 409) setConflict(true)
      else handleServerError(error)
    },
  })
  async function reload() {
    try {
      const config = await getIQConfig(props.config.group)
      if (!isCurrentIQScope(props.scope)) return
      client.setQueryData(
        iqKeys.config(props.scope, props.config.group),
        config
      )
      form.reset(editableIQConfig(config))
      setPromptKeys(
        editableIQConfig(config).prompts.map(() => crypto.randomUUID())
      )
      setConflict(false)
      save.reset()
    } catch (error) {
      handleServerError(error)
    }
  }
  return (
    <form
      className='space-y-5'
      onSubmit={form.handleSubmit((input) =>
        save.mutate({ ...input, prompts: [input.prompt, ...input.prompts] })
      )}
    >
      <fieldset
        className='min-w-0 space-y-5'
        disabled={!props.canWrite || save.isPending}
      >
        <FieldGroup>
          <Field data-invalid={Boolean(form.formState.errors.prompt)}>
            <FieldLabel htmlFor='iq-prompt'>{t('Test prompt')}</FieldLabel>
            <Textarea
              id='iq-prompt'
              rows={6}
              {...form.register('prompt')}
              aria-invalid={Boolean(form.formState.errors.prompt)}
              aria-describedby='iq-prompts-help'
            />
            <FieldDescription id='iq-prompts-help'>
              {t(
                'One prompt is randomly selected for each run and shared by all models in this task. The existing project prompt is used by default.'
              )}
            </FieldDescription>
          </Field>
          <Controller
            name='prompts'
            control={form.control}
            render={({ field }) => (
              <FieldGroup>
                {field.value.map((prompt, index) => (
                  <Field
                    key={promptKeys[index]}
                    data-invalid={Boolean(
                      form.formState.errors.prompts?.[index]
                    )}
                  >
                    <FieldLabel htmlFor={`iq-prompt-${index}`}>
                      {t('Prompt {{number}}', { number: index + 2 })}
                    </FieldLabel>
                    <Textarea
                      id={`iq-prompt-${index}`}
                      rows={4}
                      value={prompt}
                      aria-invalid={Boolean(
                        form.formState.errors.prompts?.[index]
                      )}
                      onChange={(event) =>
                        field.onChange(
                          field.value.map((value, position) =>
                            position === index ? event.target.value : value
                          )
                        )
                      }
                    />
                    <Button
                      type='button'
                      variant='outline'
                      onClick={() => {
                        setPromptKeys((keys) =>
                          keys.filter((_, position) => position !== index)
                        )
                        field.onChange(
                          field.value.filter(
                            (_, position) => position !== index
                          )
                        )
                      }}
                    >
                      {t('Remove prompt')}
                    </Button>
                  </Field>
                ))}
                <Button
                  type='button'
                  variant='outline'
                  disabled={field.value.length >= 99}
                  onClick={() => {
                    setPromptKeys((keys) => [...keys, crypto.randomUUID()])
                    field.onChange([...field.value, ''])
                  }}
                >
                  {t('Add prompt')}
                </Button>
              </FieldGroup>
            )}
          />
        </FieldGroup>
        <FieldGroup>
          <Field data-invalid={Boolean(form.formState.errors.reasoning_effort)}>
            <FieldLabel htmlFor='iq-reasoning'>
              {t('Thinking level')}
            </FieldLabel>
            <NativeSelect
              id='iq-reasoning'
              aria-describedby='iq-reasoning-help'
              aria-invalid={Boolean(form.formState.errors.reasoning_effort)}
              {...form.register('reasoning_effort')}
            >
              <NativeSelectOption value=''>{t('Default')}</NativeSelectOption>
              <NativeSelectOption value='none'>{t('None')}</NativeSelectOption>
              <NativeSelectOption value='minimal'>
                {t('Minimal')}
              </NativeSelectOption>
              <NativeSelectOption value='low'>{t('Low')}</NativeSelectOption>
              <NativeSelectOption value='medium'>
                {t('Medium')}
              </NativeSelectOption>
              <NativeSelectOption value='high'>{t('High')}</NativeSelectOption>
              <NativeSelectOption value='xhigh'>
                {t('Extra high')}
              </NativeSelectOption>
              <NativeSelectOption value='max'>
                {t('Maximum')}
              </NativeSelectOption>
            </NativeSelect>
            <FieldDescription id='iq-reasoning-help'>
              {t(
                'Applies to all selected models. Default keeps model/channel settings; model modifiers take precedence. Supported levels depend on the model.'
              )}
            </FieldDescription>
          </Field>
        </FieldGroup>
        <div className='space-y-2'>
          <Label>{t('Groups and models')}</Label>
          <p className='text-muted-foreground text-sm'>
            {t(
              'Select up to 100 model/group pairs. Each pair is attempted once per run.'
            )}
          </p>
          <Controller
            name='targets'
            control={form.control}
            render={({ field }) => (
              <IQTargetSelector
                catalog={props.catalog.filter(
                  (target) => target.group === props.config.group
                )}
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
          <p className='text-sm'>
            {t('{{count}} selected pairs', {
              count: targets.reduce(
                (count, target) => count + target.models.length,
                0
              ),
            })}
          </p>
        </div>
        <div className='flex items-center gap-3'>
          <Controller
            name='enabled'
            control={form.control}
            render={({ field }) => (
              <Switch
                id='iq-enabled'
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            )}
          />
          <Label htmlFor='iq-enabled'>{t('Enable schedule')}</Label>
        </div>
        <div className='space-y-2'>
          <Label htmlFor='iq-schedule'>{t('Schedule')}</Label>
          <NativeSelect id='iq-schedule' {...form.register('schedule_mode')}>
            <NativeSelectOption value='interval'>
              {t('Every N hours')}
            </NativeSelectOption>
            <NativeSelectOption value='daily'>
              {t('Daily at a fixed time')}
            </NativeSelectOption>
          </NativeSelect>
        </div>
        {mode === 'interval' ? (
          <div key='interval' className='space-y-2'>
            <Label htmlFor='iq-hours'>{t('Interval (hours)')}</Label>
            <Input
              id='iq-hours'
              type='number'
              min={1}
              max={8760}
              {...form.register('interval_hours', { valueAsNumber: true })}
            />
          </div>
        ) : (
          <div key='daily' className='space-y-2'>
            <Label htmlFor='iq-time'>{t('Daily time (Beijing)')}</Label>
            <Input id='iq-time' type='time' {...form.register('daily_time')} />
          </div>
        )}
        <p className='text-muted-foreground text-sm'>
          {t(
            'Beijing time (Asia/Shanghai). Saving recalculates the next run; disabling does not cancel active work.'
          )}
        </p>
      </fieldset>
      {Object.keys(form.formState.errors).length > 0 && (
        <p role='alert' className='text-destructive'>
          {t('Check the prompt, selected targets and schedule values.')}
        </p>
      )}
      {conflict && (
        <div role='alert' className='text-destructive space-y-2'>
          <p>
            {t(
              'Configuration changed. Your edits are preserved; reload to reconcile before saving.'
            )}
          </p>
          <Button type='button' variant='outline' onClick={() => void reload()}>
            {t('Reload configuration (discard edits)')}
          </Button>
        </div>
      )}
      {props.canWrite && (
        <Button type='submit' disabled={save.isPending || conflict}>
          {save.isPending ? t('Saving...') : t('Save')}
        </Button>
      )}
    </form>
  )
}
