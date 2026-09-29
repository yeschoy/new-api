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
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { CashbackStrategyLabel } from '../components/cashback-strategy-label'

describe('cashback strategy display', () => {
  it('shows the fixed amount instead of a misleading zero percent for per-hundred rewards', () => {
    render(
      <CashbackStrategyLabel
        reward={{ strategy: 'per_hundred', fixed_per_hundred: 20, rate_bps: 0 }}
      />
    )
    expect(screen.getByText('Every 100 of top-up returns 20')).toBeVisible()
    expect(screen.queryByText('0.00%')).not.toBeInTheDocument()
  })

  it('keeps the historical percentage for records without a strategy', () => {
    render(<CashbackStrategyLabel reward={{ rate_bps: 1250 }} />)
    expect(screen.getByText('12.50%')).toBeVisible()
  })
})
