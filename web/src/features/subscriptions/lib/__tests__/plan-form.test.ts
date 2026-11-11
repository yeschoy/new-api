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
import i18next from 'i18next'
import { describe, expect, it } from 'vitest'

import type { SubscriptionPlan } from '../../types'
import {
  formValuesToPlanPayload,
  getPlanFormSchema,
  PLAN_FORM_DEFAULTS,
  planToFormValues,
} from '../plan-form'

describe('plan applicability form', () => {
  const plan: SubscriptionPlan = {
    id: 7,
    partner_tenant_id: 0,
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
      partner_tenant_id: 0,
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
    expect(payload.plan.partner_tenant_id).toBe(0)
  })

  it('locks partner plans to a one-month term, monthly reset, and no wallet fallback', () => {
    const payload = formValuesToPlanPayload({
      ...PLAN_FORM_DEFAULTS,
      partner_tenant_id: 42,
      duration_unit: 'year',
      duration_value: 2,
      quota_reset_period: 'never',
      allow_balance_pay: true,
      allow_wallet_overflow: true,
      upgrade_group: 'premium',
      downgrade_group: 'default',
      applicable_group: 'partner-a',
    })

    expect(payload.plan).toMatchObject({
      partner_tenant_id: 42,
      duration_unit: 'month',
      duration_value: 1,
      quota_reset_period: 'monthly',
      allow_balance_pay: false,
      allow_wallet_overflow: false,
      upgrade_group: '',
      downgrade_group: '',
      applicable_group: 'partner-a',
    })
  })

  it.each([
    { partnerTenantId: 42, currency: 'CNY' },
    { partnerTenantId: 0, currency: 'USD' },
  ])(
    'submits $currency purchase prices without converting price or quota',
    ({ partnerTenantId, currency }) => {
      const values = planToFormValues({
        ...plan,
        partner_tenant_id: partnerTenantId,
        currency,
        price_amount: 9.99,
      })
      expect(values.price_amount).toBe(9.99)
      expect(formValuesToPlanPayload(values).plan).toMatchObject({
        partner_tenant_id: partnerTenantId,
        currency,
        price_amount: 9.99,
        total_amount: plan.total_amount,
      })
    }
  )

  it('requires a new CNY price instead of relabelling a non-CNY partner price', () => {
    const values = planToFormValues({ ...plan, partner_tenant_id: 42 })
    const schema = getPlanFormSchema(i18next.t)

    expect(values.price_amount).toBe(0)
    expect(schema.safeParse({ ...values, title: 'Renamed plan' }).success).toBe(
      false
    )

    const repriced = schema.parse({ ...values, price_amount: 69.99 })
    expect(formValuesToPlanPayload(repriced).plan).toMatchObject({
      currency: 'CNY',
      price_amount: 69.99,
      total_amount: plan.total_amount,
    })
  })

  it.each([0, -1, 1.001])(
    'rejects the invalid CNY partner price %s before submission',
    (priceAmount) => {
      const result = getPlanFormSchema(i18next.t).safeParse({
        ...PLAN_FORM_DEFAULTS,
        partner_tenant_id: 42,
        title: 'Tenant CNY plan',
        price_amount: priceAmount,
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(
          result.error.issues.some((issue) => issue.path[0] === 'price_amount')
        ).toBe(true)
      }
    }
  )

  it.each([0.01, 0.29, 9.99])(
    'accepts the exact-cent CNY price %s',
    (priceAmount) => {
      expect(
        getPlanFormSchema(i18next.t).safeParse({
          ...PLAN_FORM_DEFAULTS,
          partner_tenant_id: 42,
          title: 'Tenant CNY plan',
          price_amount: priceAmount,
        }).success
      ).toBe(true)
    }
  )

  it('keeps ordinary zero-price plans valid', () => {
    expect(
      getPlanFormSchema(i18next.t).safeParse({
        ...PLAN_FORM_DEFAULTS,
        title: 'Ordinary plan',
        price_amount: 0,
      }).success
    ).toBe(true)
  })

  it('preserves partner plan request limits in the form and payload', () => {
    const values = planToFormValues({ ...plan, requests_per_minute: 25 })
    expect(values.requests_per_minute).toBe(25)
    expect(formValuesToPlanPayload(values).plan.requests_per_minute).toBe(25)
  })
})
