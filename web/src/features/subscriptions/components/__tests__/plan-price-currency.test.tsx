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
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useSystemConfigStore } from '@/stores/system-config-store'

import { getAdminPlans } from '../../api'
import type { PlanRecord, SubscriptionPlan } from '../../types'
import { UserSubscriptionsDialog } from '../dialogs/user-subscriptions-dialog'
import { useSubscriptionsColumns } from '../subscriptions-columns'
import { SubscriptionsMutateDrawer } from '../subscriptions-mutate-drawer'

vi.mock('../../api', () => ({
  getGroups: vi.fn().mockResolvedValue({ success: true, data: ['default'] }),
  listWaffoPancakeSubscriptionProductOptions: vi.fn().mockResolvedValue({
    message: 'success',
    data: { products: [] },
  }),
  createPlan: vi.fn(),
  updatePlan: vi.fn(),
  createWaffoPancakeSubscriptionProduct: vi.fn(),
  getAdminPlans: vi.fn(),
  getUserSubscriptions: vi.fn().mockResolvedValue({ success: true, data: [] }),
  createUserSubscription: vi.fn(),
  invalidateUserSubscription: vi.fn(),
  deleteUserSubscription: vi.fn(),
  resetUserSubscriptionsByPlan: vi.fn(),
}))

vi.mock('../subscriptions-provider', () => ({
  useSubscriptions: () => ({ triggerRefresh: vi.fn() }),
}))

const initialCurrency = useSystemConfigStore.getState().config.currency
const plan: SubscriptionPlan = {
  id: 7,
  partner_tenant_id: 0,
  title: 'Scoped plan',
  currency: 'USD',
  price_amount: 9.99,
  duration_unit: 'month',
  duration_value: 1,
  quota_reset_period: 'monthly',
  enabled: true,
  sort_order: 0,
  allow_balance_pay: false,
  allow_wallet_overflow: false,
  max_purchase_per_user: 0,
  total_amount: 500000,
  applicable_group: 'default',
}

beforeEach(() => {
  useSystemConfigStore.getState().setConfig({
    currency: {
      ...initialCurrency,
      quotaDisplayType: 'USD',
      usdExchangeRate: 7,
    },
  })
})

afterEach(() => {
  useSystemConfigStore.getState().setConfig({ currency: initialCurrency })
})

function PriceCell({ record }: { record: PlanRecord }) {
  const table = useReactTable({
    data: [record],
    columns: useSubscriptionsColumns(),
    getCoreRowModel: getCoreRowModel(),
  })
  const cell = table
    .getRowModel()
    .rows[0].getAllCells()
    .find((cell) => cell.column.id === 'price')
  if (!cell) throw new Error('Missing subscription price column')
  return flexRender(cell.column.columnDef.cell, cell.getContext())
}

describe('admin subscription purchase currency', () => {
  it('shows each plan’s actual currency in the user subscription selector', async () => {
    vi.mocked(getAdminPlans).mockResolvedValue({
      success: true,
      data: [
        { plan },
        {
          plan: {
            ...plan,
            id: 8,
            partner_tenant_id: 42,
            title: 'Tenant plan',
            currency: 'CNY',
          },
        },
      ],
    })
    render(
      <UserSubscriptionsDialog
        open
        onOpenChange={() => {}}
        user={{ id: 1, username: 'admin-test' }}
      />
    )
    await userEvent.click(
      await screen.findByPlaceholderText('Select subscription plan')
    )
    expect(
      await screen.findByRole('option', { name: 'Scoped plan ($9.99)' })
    ).toBeVisible()
    expect(
      screen.getByRole('option', { name: 'Tenant plan (¥9.99)' })
    ).toBeVisible()
  })

  it.each([
    { partnerTenantId: 42, currency: 'CNY' },
    { partnerTenantId: 0, currency: 'USD' },
  ])(
    'labels $currency purchase price separately from USD quota',
    async ({ partnerTenantId, currency }) => {
      render(
        <SubscriptionsMutateDrawer
          open
          onOpenChange={() => {}}
          currentRow={{
            plan: { ...plan, partner_tenant_id: partnerTenantId, currency },
          }}
        />
      )

      expect(
        await screen.findByRole('spinbutton', {
          name: `Plan Price (${currency})`,
        })
      ).toHaveValue(9.99)
      expect(
        screen.getByRole('spinbutton', { name: 'Quota (USD)' })
      ).toHaveValue(1)
      expect(
        screen.queryByText(
          'Reference monthly price; the partner collects payment outside this platform.'
        )
      ).not.toBeInTheDocument()
      if (currency === 'CNY') {
        expect(
          screen.getByText(
            'Enter a positive CNY amount with up to 2 decimal places'
          )
        ).toBeVisible()
      }
    }
  )

  it('requires repricing an existing USD tenant plan in the CNY editor', async () => {
    render(
      <SubscriptionsMutateDrawer
        open
        onOpenChange={() => {}}
        currentRow={{ plan: { ...plan, partner_tenant_id: 42 } }}
      />
    )

    expect(
      await screen.findByRole('spinbutton', { name: 'Plan Price (CNY)' })
    ).toHaveValue(0)
    expect(
      screen.getByText(
        'Enter a positive CNY amount with up to 2 decimal places'
      )
    ).toBeVisible()
  })

  it.each([
    { partnerTenantId: 42, currency: 'CNY', expected: '¥9.99' },
    { partnerTenantId: 0, currency: 'USD', expected: '$9.99' },
    { partnerTenantId: 42, currency: 'USD', expected: '$9.99' },
  ])(
    'displays the persisted $currency price for tenant $partnerTenantId without conversion',
    ({ partnerTenantId, currency, expected }) => {
      useSystemConfigStore.getState().setConfig({
        currency: {
          ...initialCurrency,
          quotaDisplayType: 'CNY',
          usdExchangeRate: 7,
        },
      })
      render(
        <PriceCell
          record={{
            plan: { ...plan, partner_tenant_id: partnerTenantId, currency },
          }}
        />
      )
      expect(screen.getByText(expected)).toBeVisible()
    }
  )
})
