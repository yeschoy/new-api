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
import { useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import dayjs from 'dayjs'
import { useState } from 'react'
import { useForm, type Resolver } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

import { updateCashbackConfig } from '../api'
import {
  SettingsForm,
  SettingsSwitchContent,
  SettingsSwitchItem,
} from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import type { CashbackConfig, CashbackConfigUpdate } from '../types'

const MAX_WALLET_QUOTA = Number.MAX_SAFE_INTEGER

const fieldMap = {
  inviter_enabled: 'inviterEnabled',
  invitee_enabled: 'inviteeEnabled',
  inviter_rate_bps: 'inviterRatePercent',
  invitee_rate_bps: 'inviteeRatePercent',
  settlement_days: 'settlementDays',
  max_reward_quota: 'maxRewardQuota',
  daily_reward_quota: 'dailyRewardQuota',
  ip_account_threshold: 'ipAccountThreshold',
  device_account_threshold: 'deviceAccountThreshold',
  daily_topup_count_threshold: 'dailyTopUpCountThreshold',
} as const

type Values = {
  inviterEnabled: boolean
  inviteeEnabled: boolean
  inviterRatePercent: number
  inviteeRatePercent: number
  settlementDays: number
  maxRewardQuota: number
  dailyRewardQuota: number
  ipAccountThreshold: number
  deviceAccountThreshold: number
  dailyTopUpCountThreshold: number
}

type CashbackSettingsFormProps = {
  config: CashbackConfig
}

function configToValues(config: CashbackConfig): Values {
  return {
    inviterEnabled: config.inviter_enabled,
    inviteeEnabled: config.invitee_enabled,
    inviterRatePercent: config.inviter_rate_bps / 100,
    inviteeRatePercent: config.invitee_rate_bps / 100,
    settlementDays: config.settlement_days,
    maxRewardQuota: config.max_reward_quota,
    dailyRewardQuota: config.daily_reward_quota,
    ipAccountThreshold: config.ip_account_threshold,
    deviceAccountThreshold: config.device_account_threshold,
    dailyTopUpCountThreshold: config.daily_topup_count_threshold,
  }
}

function valuesToRequest(values: Values): CashbackConfigUpdate {
  return {
    inviter_enabled: values.inviterEnabled,
    invitee_enabled: values.inviteeEnabled,
    inviter_rate_bps: Math.round(values.inviterRatePercent * 100),
    invitee_rate_bps: Math.round(values.inviteeRatePercent * 100),
    settlement_days: values.settlementDays,
    max_reward_quota: values.maxRewardQuota,
    daily_reward_quota: values.dailyRewardQuota,
    ip_account_threshold: values.ipAccountThreshold,
    device_account_threshold: values.deviceAccountThreshold,
    daily_topup_count_threshold: values.dailyTopUpCountThreshold,
  }
}

export function CashbackSettingsForm(props: CashbackSettingsFormProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [confirmationOpen, setConfirmationOpen] = useState(false)
  const [pendingValues, setPendingValues] = useState<Values | null>(null)

  const percentage = z.coerce
    .number({ error: t('Enter a valid percentage') })
    .min(0, t('Percentage must be at least 0'))
    .max(100, t('Percentage must not exceed 100'))
    .refine(
      (value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-8,
      t('Use no more than two decimal places')
    )
  const positiveSafeInteger = z.coerce
    .number({ error: t('Enter a valid quota amount') })
    .int(t('Quota must be a whole number'))
    .min(0, t('Quota cannot be negative'))
    .max(MAX_WALLET_QUOTA, t('Quota exceeds the wallet safety limit'))
  const schema = z
    .object({
      inviterEnabled: z.boolean(),
      inviteeEnabled: z.boolean(),
      inviterRatePercent: percentage,
      inviteeRatePercent: percentage,
      settlementDays: z.coerce
        .number({ error: t('Enter valid settlement days') })
        .int()
        .min(1, t('Settlement days must be between 1 and 90'))
        .max(90, t('Settlement days must be between 1 and 90')),
      maxRewardQuota: positiveSafeInteger,
      dailyRewardQuota: positiveSafeInteger,
      ipAccountThreshold: z.coerce.number().int().min(2).max(100000),
      deviceAccountThreshold: z.coerce.number().int().min(2).max(100000),
      dailyTopUpCountThreshold: z.coerce.number().int().min(1).max(100000),
    })
    .superRefine((values, context) => {
      if (values.inviterEnabled && values.inviterRatePercent <= 0) {
        context.addIssue({
          code: 'custom',
          path: ['inviterRatePercent'],
          message: t('Enabled inviter cashback requires a positive rate'),
        })
      }
      if (values.inviteeEnabled && values.inviteeRatePercent <= 0) {
        context.addIssue({
          code: 'custom',
          path: ['inviteeRatePercent'],
          message: t('Enabled invitee cashback requires a positive rate'),
        })
      }
      if (values.inviterRatePercent + values.inviteeRatePercent > 100) {
        context.addIssue({
          code: 'custom',
          path: ['inviteeRatePercent'],
          message: t('Combined cashback rate cannot exceed 100%'),
        })
      }
      if (values.inviterEnabled || values.inviteeEnabled) {
        if (values.maxRewardQuota <= 0) {
          context.addIssue({
            code: 'custom',
            path: ['maxRewardQuota'],
            message: t('Set a positive single reward limit before enabling'),
          })
        }
        if (values.dailyRewardQuota <= 0) {
          context.addIssue({
            code: 'custom',
            path: ['dailyRewardQuota'],
            message: t('Set a positive daily reward limit before enabling'),
          })
        }
        if (!props.config.compliance_confirmed) {
          context.addIssue({
            code: 'custom',
            path: ['inviterEnabled'],
            message: t('Confirm payment compliance before enabling cashback'),
          })
        }
      }
    })

  const form = useForm<Values>({
    resolver: zodResolver(schema) as Resolver<Values>,
    defaultValues: configToValues(props.config),
  })
  const mutation = useMutation({
    mutationFn: updateCashbackConfig,
  })
  const enabled = form.watch('inviterEnabled') || form.watch('inviteeEnabled')

  async function persist(values: Values) {
    try {
      const response = await mutation.mutateAsync(valuesToRequest(values))
      if (!response.success || !response.data) {
        throw new Error(response.message || 'Failed to save cashback settings')
      }
      queryClient.setQueryData(['cashback', 'config'], response.data)
      form.reset(configToValues(response.data))
      toast.success(t('Cashback settings saved'))
    } catch (error: unknown) {
      const axiosError = axios.isAxiosError(error) ? error : undefined
      const field = axiosError?.response?.data?.field as string | undefined
      const serverMessage =
        axiosError?.response?.data?.message || t('Invalid cashback setting')
      if (field === 'config') {
        form.setError('root.server', { message: serverMessage })
      } else if (field && field in fieldMap) {
        form.setError(fieldMap[field as keyof typeof fieldMap], {
          message: serverMessage,
        })
      }
      let message: string | undefined
      if (axiosError) {
        message = axiosError.response?.data?.message
      } else if (error instanceof Error) {
        message = error.message
      }
      toast.error(message || t('Failed to save cashback settings'))
    }
  }

  function onSubmit(values: Values) {
    const firstEnable =
      props.config.first_enabled_at === 0 &&
      (values.inviterEnabled || values.inviteeEnabled)
    const highRate = values.inviterRatePercent + values.inviteeRatePercent >= 50
    if (firstEnable || highRate) {
      setPendingValues(values)
      setConfirmationOpen(true)
      return
    }
    void persist(values)
  }

  function handleConfirmationChange(open: boolean) {
    setConfirmationOpen(open)
    if (!open && !mutation.isPending) setPendingValues(null)
  }

  return (
    <SettingsSection title={t('Referral Cashback')}>
      <Form {...form}>
        <SettingsForm onSubmit={form.handleSubmit(onSubmit)} autoComplete='off'>
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            isSaving={mutation.isPending || form.formState.isSubmitting}
            isSaveDisabled={!form.formState.isDirty}
            saveLabel='Save cashback settings'
          />

          {form.formState.errors.root?.server?.message && (
            <p role='alert' className='text-destructive text-sm'>
              {form.formState.errors.root.server.message}
            </p>
          )}

          {!props.config.compliance_confirmed && (
            <Alert variant='destructive'>
              <AlertTitle>
                {t('Payment compliance is not confirmed')}
              </AlertTitle>
              <AlertDescription>
                {t(
                  'Cashback stays disabled until the payment compliance statement is confirmed.'
                )}
              </AlertDescription>
            </Alert>
          )}

          <div className='grid gap-4 lg:grid-cols-2'>
            <FormField
              control={form.control}
              name='inviterEnabled'
              render={({ field }) => (
                <SettingsSwitchItem>
                  <SettingsSwitchContent>
                    <FormLabel>{t('Reward the inviter')}</FormLabel>
                    <FormDescription>
                      {t('Create a separate reward for the referring user.')}
                    </FormDescription>
                    <FormMessage />
                  </SettingsSwitchContent>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={mutation.isPending}
                    />
                  </FormControl>
                </SettingsSwitchItem>
              )}
            />
            <FormField
              control={form.control}
              name='inviteeEnabled'
              render={({ field }) => (
                <SettingsSwitchItem>
                  <SettingsSwitchContent>
                    <FormLabel>{t('Reward the invited user')}</FormLabel>
                    <FormDescription>
                      {t('Create a separate reward for the user who tops up.')}
                    </FormDescription>
                    <FormMessage />
                  </SettingsSwitchContent>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={mutation.isPending}
                    />
                  </FormControl>
                </SettingsSwitchItem>
              )}
            />
          </div>

          <div className='grid gap-6 sm:grid-cols-2'>
            <FormField
              control={form.control}
              name='inviterRatePercent'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Inviter cashback rate (%)')}</FormLabel>
                  <FormControl>
                    <Input
                      type='number'
                      min={0}
                      max={100}
                      step={0.01}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    {t('Applied to the selected top-up face value.')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='inviteeRatePercent'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Invited user cashback rate (%)')}</FormLabel>
                  <FormControl>
                    <Input
                      type='number'
                      min={0}
                      max={100}
                      step={0.01}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    {t(
                      'The combined rate for both directions cannot exceed 100%.'
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='settlementDays'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Settlement delay (days)')}</FormLabel>
                  <FormControl>
                    <Input type='number' min={1} max={90} step={1} {...field} />
                  </FormControl>
                  <FormDescription>
                    {t(
                      'Each day is a full 24-hour hold after payment succeeds.'
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormItem>
              <Label htmlFor='cashback-first-enabled-at'>
                {t('First enabled at')}
              </Label>
              <Input
                id='cashback-first-enabled-at'
                aria-describedby='cashback-first-enabled-at-description'
                readOnly
                value={
                  props.config.first_enabled_at > 0
                    ? dayjs
                        .unix(props.config.first_enabled_at)
                        .format('YYYY-MM-DD HH:mm:ss')
                    : t('Not enabled yet')
                }
              />
              <p
                id='cashback-first-enabled-at-description'
                className='text-muted-foreground text-sm'
              >
                {t(
                  'Orders created before this time can never receive cashback.'
                )}
              </p>
            </FormItem>
          </div>

          <div className='grid gap-6 sm:grid-cols-2'>
            <FormField
              control={form.control}
              name='maxRewardQuota'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Single reward quota limit')}</FormLabel>
                  <FormControl>
                    <Input
                      type='number'
                      min={0}
                      max={MAX_WALLET_QUOTA}
                      step={1}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='dailyRewardQuota'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Beneficiary 24-hour reward limit')}</FormLabel>
                  <FormControl>
                    <Input
                      type='number'
                      min={0}
                      max={MAX_WALLET_QUOTA}
                      step={1}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className='grid gap-6 sm:grid-cols-3'>
            <FormField
              control={form.control}
              name='ipAccountThreshold'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Shared IP account threshold')}</FormLabel>
                  <FormControl>
                    <Input
                      type='number'
                      min={2}
                      max={100000}
                      step={1}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='deviceAccountThreshold'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Shared device account threshold')}</FormLabel>
                  <FormControl>
                    <Input
                      type='number'
                      min={2}
                      max={100000}
                      step={1}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='dailyTopUpCountThreshold'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('User 24-hour top-up threshold')}</FormLabel>
                  <FormControl>
                    <Input
                      type='number'
                      min={1}
                      max={100000}
                      step={1}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {enabled && (
            <Alert>
              <AlertTitle>
                {t('Every reward requires manual review')}
              </AlertTitle>
              <AlertDescription>
                {t(
                  'Approval never shortens the configured hold, and issued rewards enter the site-only quota balance.'
                )}
              </AlertDescription>
            </Alert>
          )}
        </SettingsForm>
      </Form>

      <AlertDialog
        open={confirmationOpen}
        onOpenChange={handleConfirmationChange}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('Confirm cashback risk settings')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'Enabling cashback or using a high combined rate creates wallet exposure. Confirm the limits and review workflow before saving.'
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>
              {t('Cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={mutation.isPending || !pendingValues}
              onClick={() => {
                if (pendingValues) void persist(pendingValues)
                setConfirmationOpen(false)
              }}
            >
              {t('Confirm and save')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsSection>
  )
}
