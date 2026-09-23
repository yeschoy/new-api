import {
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'

import type { Redemption } from '../../types'
import { DataTableRowActions } from '../data-table-row-actions'
import { RedemptionsProvider } from '../redemptions-provider'

function ActionsFixture(props: { status: number; expiredTime?: number }) {
  const row: Redemption = {
    id: 1,
    user_id: 1,
    name: 'gift',
    key: '0123456789abcdef0123456789abcdef',
    status: props.status,
    quota: 0,
    plan_id: 7,
    created_time: 1,
    redeemed_time: 0,
    expired_time: props.expiredTime ?? 0,
    used_user_id: 0,
  }
  const table = useReactTable({
    data: [row],
    columns: [],
    getCoreRowModel: getCoreRowModel(),
  })
  return (
    <RedemptionsProvider>
      <DataTableRowActions row={table.getRowModel().rows[0]} />
    </RedemptionsProvider>
  )
}

afterEach(cleanup)

test.each([
  { status: 1, expiredTime: 0, editable: true },
  { status: 2, expiredTime: 0, editable: true },
  { status: 1, expiredTime: 1, editable: true },
  { status: 3, expiredTime: 0, editable: false },
])('code with status $status and expiry $expiredTime has edit access $editable', ({ status, expiredTime, editable }) => {
  render(<ActionsFixture status={status} expiredTime={expiredTime} />)
  expect(screen.getByRole('button', { name: 'Edit' })).toHaveProperty('disabled', !editable)
})
