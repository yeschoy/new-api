/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { describe, expect, it } from 'vitest'

import type { SubscriptionPlan } from '../../types'
import {
  formValuesToPlanPayload,
  PLAN_FORM_DEFAULTS,
  planToFormValues,
} from '../plan-form'

describe('plan applicability form', () => {
  const plan: SubscriptionPlan = {
    id: 7,
    title: 'Scoped plan',
    price_amount: 10,
    currency: 'USD',
    duration_unit: 'month',
    duration_value: 1,
    quota_reset_period: 'never',
    enabled: true,
    sort_order: 0,
    allow_balance_pay: true,
    allow_wallet_overflow: false,
    max_purchase_per_user: 0,
    total_amount: 500000,
    upgrade_group: 'premium',
    applicable_group: 'deepflash',
  }

  it('defaults to unrestricted quota independently of the upgrade group', () => {
    expect(PLAN_FORM_DEFAULTS.applicable_group).toBe('')
    expect(planToFormValues(plan)).toMatchObject({
      upgrade_group: 'premium',
      applicable_group: 'deepflash',
    })
  })

  it('submits cleared applicability without changing the upgrade group', () => {
    const values = planToFormValues(plan)
    const payload = formValuesToPlanPayload({
      ...values,
      applicable_group: '',
    })
    expect(payload.plan.applicable_group).toBe('')
    expect(payload.plan.upgrade_group).toBe('premium')
  })
})
