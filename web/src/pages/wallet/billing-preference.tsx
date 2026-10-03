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
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { Select, toast } from '@/components/ui'
import { t, tk, useI18n } from '@/i18n/i18n'
import { errorMessage } from '@/lib/api'

import { setBillingPreference, type BillingPreference } from './subscription-api'

const PREFERENCES: Array<{ value: BillingPreference; label: string; needsSubscription: boolean }> = [
  { value: 'subscription_first', label: tk('优先使用订阅'), needsSubscription: true },
  { value: 'wallet_first', label: tk('优先使用余额'), needsSubscription: false },
  { value: 'subscription_only', label: tk('仅使用订阅'), needsSubscription: true },
  { value: 'wallet_only', label: tk('仅使用余额'), needsSubscription: false },
]

function needsSubscription(preference: BillingPreference): boolean {
  return PREFERENCES.some((item) => item.value === preference && item.needsSubscription)
}

/**
 * Why the wallet pays although a subscription is preferred: the saved choice
 * needs an active subscription and there is none. Null when nothing to say.
 */
export function fallbackNote(preference: BillingPreference, hasActive: boolean): string | null {
  if (hasActive || !needsSubscription(preference)) return null
  const item = PREFERENCES.find((entry) => entry.value === preference)
  return t('已保存为「{preference}」，但当前没有生效的订阅，将自动使用钱包余额。', { preference: t(item?.label ?? preference) })
}

/** Which pays for requests first, the subscriptions or the balance. */
export function BillingPreferenceSelect(props: { preference: BillingPreference; hasActive: boolean }) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationFn: setBillingPreference,
    onSuccess: () => {
      toast.success(t('已保存'))
      void queryClient.invalidateQueries({ queryKey: ['console'] })
    },
    onError: (err) => toast.error(errorMessage(err, t('保存失败'))),
  })
  const saved = save.isPending ? save.variables : props.preference
  // Without an active subscription the wallet pays whatever was saved.
  const shown = !props.hasActive && needsSubscription(saved) ? 'wallet_first' : saved
  const options = PREFERENCES.map((item) => {
    const off = item.needsSubscription && !props.hasActive
    return {
      value: item.value,
      label: off ? t('{label}（无生效订阅）', { label: t(item.label) }) : t(item.label),
      disabled: off,
    }
  })

  return (
    <Select
      value={shown}
      onChange={(value) => save.mutate(value as BillingPreference)}
      options={options}
      ariaLabel={t('扣费方式')}
      disabled={save.isPending}
      className='min-w-0 flex-1 sm:w-[220px] sm:flex-none'
    />
  )
}
