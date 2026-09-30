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
import { useLayoutEffect, useRef } from 'react'
import { useFieldArray, type UseFormReturn } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'

import type { Values } from './cashback-settings-form'

export function CashbackTierEditor(props: {
  direction: 'inviter' | 'invitee'
  form: UseFormReturn<Values>
  disabled: boolean
}) {
  const { t } = useTranslation()
  const name = props.direction === 'inviter' ? 'inviterTiers' : 'inviteeTiers'
  const { fields, append, remove } = useFieldArray({
    control: props.form.control,
    name,
  })
  const addButton = useRef<HTMLButtonElement>(null)
  const focusAfterRemoval = useRef(false)
  useLayoutEffect(() => {
    if (focusAfterRemoval.current) {
      addButton.current?.focus()
      focusAfterRemoval.current = false
    }
  }, [fields.length])
  const title =
    props.direction === 'inviter' ? t('Inviter tiers') : t('Payer tiers')

  return (
    <fieldset className='min-w-0 space-y-3 rounded-lg border p-4'>
      <legend className='px-1 font-medium'>{title}</legend>
      <p className='text-muted-foreground text-sm'>
        {t(
          'CNY per order. Only the highest reached tier pays; tiers do not stack.'
        )}
      </p>
      {fields.map((field, index) => (
        <div key={field.id} className='grid gap-2 sm:grid-cols-[1fr_1fr_auto]'>
          <FormField
            control={props.form.control}
            name={`${name}.${index}.threshold`}
            render={({ field: input }) => (
              <FormItem>
                <FormLabel>{t('Threshold (CNY)')}</FormLabel>
                <FormControl>
                  <Input
                    inputMode='decimal'
                    autoComplete='off'
                    disabled={props.disabled}
                    {...input}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={props.form.control}
            name={`${name}.${index}.reward`}
            render={({ field: input }) => (
              <FormItem>
                <FormLabel>{t('Reward (CNY)')}</FormLabel>
                <FormControl>
                  <Input
                    inputMode='decimal'
                    autoComplete='off'
                    disabled={props.disabled}
                    {...input}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button
            type='button'
            variant='outline'
            className='sm:self-end'
            disabled={props.disabled}
            aria-label={t('Remove tier {{number}} from {{direction}}', {
              number: index + 1,
              direction: title,
            })}
            onClick={() => {
              focusAfterRemoval.current = true
              remove(index)
            }}
          >
            {t('Remove')}
          </Button>
        </div>
      ))}
      <Button
        ref={addButton}
        type='button'
        variant='outline'
        disabled={props.disabled || fields.length >= 32}
        onClick={() => append({ threshold: '', reward: '' })}
      >
        {t('Add tier')}
      </Button>
      {props.form.formState.errors[name]?.message && (
        <p role='alert' className='text-destructive text-sm'>
          {props.form.formState.errors[name]?.message}
        </p>
      )}
    </fieldset>
  )
}
