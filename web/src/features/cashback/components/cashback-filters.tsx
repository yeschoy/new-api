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
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import type { CashbackRewardFilters } from '../types'

type CashbackFiltersProps = {
  value: CashbackRewardFilters
  onChange: (value: CashbackRewardFilters) => void
  onApply: () => void
  onReset: () => void
}

type FilterOption = { label: string; value: string }

function FilterSelect(props: {
  id: string
  label: string
  value: string
  options: FilterOption[]
  onChange: (value: string) => void
}) {
  return (
    <div className='space-y-1.5'>
      <Label htmlFor={props.id}>{props.label}</Label>
      <Select
        items={props.options}
        value={props.value || 'all'}
        onValueChange={(value) =>
          props.onChange(value === null || value === 'all' ? '' : value)
        }
      >
        <SelectTrigger id={props.id} className='w-full'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          <SelectGroup>
            {props.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  )
}

export function CashbackFilters(props: CashbackFiltersProps) {
  const { t } = useTranslation()
  const directionOptions = [
    { value: 'all', label: t('All directions') },
    { value: 'inviter', label: t('Inviter') },
    { value: 'invitee', label: t('Invited user') },
  ]
  const reviewOptions = [
    { value: 'all', label: t('All review states') },
    { value: 'pending', label: t('Pending review') },
    { value: 'approved', label: t('Approved') },
    { value: 'rejected', label: t('Rejected') },
  ]
  const settlementOptions = [
    { value: 'all', label: t('All settlement states') },
    { value: 'frozen', label: t('Frozen') },
    { value: 'issued', label: t('Issued') },
    { value: 'canceled', label: t('Canceled') },
    { value: 'reclaimed', label: t('Reclaimed') },
    { value: 'debt', label: t('Debt') },
  ]
  const riskOptions = [
    { value: 'all', label: t('All risk levels') },
    { value: 'low', label: t('Low risk') },
    { value: 'medium', label: t('Medium risk') },
    { value: 'high', label: t('High risk') },
    { value: 'severe', label: t('Severe risk') },
  ]

  return (
    <form
      className='grid gap-3 rounded-xl border p-4 md:grid-cols-2 xl:grid-cols-4'
      onSubmit={(event) => {
        event.preventDefault()
        props.onApply()
      }}
    >
      <div className='space-y-1.5'>
        <Label htmlFor='cashback-trade-no'>{t('Order number')}</Label>
        <Input
          id='cashback-trade-no'
          value={props.value.tradeNo}
          onChange={(event) =>
            props.onChange({ ...props.value, tradeNo: event.target.value })
          }
          placeholder={t('Enter an exact order number')}
        />
      </div>
      <div className='space-y-1.5'>
        <Label htmlFor='cashback-user-id'>{t('Related user ID')}</Label>
        <Input
          id='cashback-user-id'
          inputMode='numeric'
          value={props.value.userId}
          onChange={(event) =>
            props.onChange({ ...props.value, userId: event.target.value })
          }
          placeholder={t('Invitee, inviter, or beneficiary')}
        />
      </div>
      <FilterSelect
        id='cashback-direction'
        label={t('Direction')}
        value={props.value.direction}
        options={directionOptions}
        onChange={(direction) =>
          props.onChange({
            ...props.value,
            direction: direction as CashbackRewardFilters['direction'],
          })
        }
      />
      <FilterSelect
        id='cashback-review-status'
        label={t('Review status')}
        value={props.value.reviewStatus}
        options={reviewOptions}
        onChange={(reviewStatus) =>
          props.onChange({
            ...props.value,
            reviewStatus: reviewStatus as CashbackRewardFilters['reviewStatus'],
          })
        }
      />
      <FilterSelect
        id='cashback-settlement-status'
        label={t('Settlement status')}
        value={props.value.settlementStatus}
        options={settlementOptions}
        onChange={(settlementStatus) =>
          props.onChange({
            ...props.value,
            settlementStatus:
              settlementStatus as CashbackRewardFilters['settlementStatus'],
          })
        }
      />
      <FilterSelect
        id='cashback-risk-level'
        label={t('Risk level')}
        value={props.value.riskLevel}
        options={riskOptions}
        onChange={(riskLevel) =>
          props.onChange({
            ...props.value,
            riskLevel: riskLevel as CashbackRewardFilters['riskLevel'],
          })
        }
      />
      <div className='flex items-end gap-2 md:col-span-2'>
        <Button type='submit'>{t('Apply filters')}</Button>
        <Button type='button' variant='outline' onClick={props.onReset}>
          {t('Reset')}
        </Button>
      </div>
    </form>
  )
}
