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
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import { USE_CASES } from '../constants'
import { ALL_APPS_ICON, USE_CASE_ICONS } from '../lib/use-case-icons'
import type { UseCaseId } from '../types'

type UseCasePickerProps = {
  value: UseCaseId | 'all'
  onChange: (value: UseCaseId | 'all') => void
}

export function UseCasePicker(props: UseCasePickerProps) {
  const { t } = useTranslation()

  return (
    <div>
      <div className='mb-3'>
        <h2 className='font-serif text-2xl tracking-tight'>
          {t('What do you want to do?')}
        </h2>
        <p className='text-muted-foreground mt-1 text-sm'>
          {t('Pick a use case first. We will only show matching apps.')}
        </p>
      </div>
      <div
        className='grid gap-2 sm:grid-cols-2 lg:grid-cols-3'
        role='radiogroup'
        aria-label={t('What do you want to do?')}
      >
        <UseCaseChip
          selected={props.value === 'all'}
          label={t('Show every app')}
          hint={t('Browse the full list when you already know the name')}
          icon={<ALL_APPS_ICON className='size-4' aria-hidden='true' />}
          onSelect={() => props.onChange('all')}
          testId='all'
        />
        {USE_CASES.map((useCase) => {
          const Icon = USE_CASE_ICONS[useCase.id]
          return (
            <UseCaseChip
              key={useCase.id}
              selected={props.value === useCase.id}
              label={t(useCase.labelKey)}
              hint={t(useCase.hintKey)}
              icon={<Icon className='size-4' aria-hidden='true' />}
              onSelect={() => props.onChange(useCase.id)}
              testId={useCase.id}
            />
          )
        })}
      </div>
    </div>
  )
}

function UseCaseChip(props: {
  selected: boolean
  label: string
  hint: string
  icon?: ReactNode
  onSelect: () => void
  testId: string
}) {
  return (
    <button
      type='button'
      role='radio'
      aria-checked={props.selected}
      data-use-case={props.testId}
      onClick={props.onSelect}
      className={cn(
        'rounded-2xl border px-4 py-3 text-left transition-colors',
        props.selected
          ? 'border-primary bg-primary/8 shadow-xs'
          : 'border-border bg-card/70 hover:border-primary/40'
      )}
    >
      <span className='flex items-center gap-2 text-sm font-medium'>
        {props.icon}
        <span>{props.label}</span>
      </span>
      <span className='text-muted-foreground mt-1 block text-xs leading-relaxed'>
        {props.hint}
      </span>
    </button>
  )
}
