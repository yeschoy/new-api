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
import { QueryClient } from '@tanstack/react-query'
import { screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { renderApp } from '@/test-utils/render-app'

import { AccessAuthLayout } from '../access-auth-layout'

let client: QueryClient
beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  client.setQueryData(['status'], {}, { updatedAt: Date.now() + 60000 })
})
afterEach(() => client.clear())
describe('auth live ticker', () => {
  it('shows real undiscounted models without fabricated offers', async () => {
    client.setQueryData(
      ['pricing', 'home', null],
      {
        vendors: [],
        data: [
          {
            id: 1,
            model_name: 'real-model',
            quota_type: 0,
            model_ratio: 1,
            completion_ratio: 2,
            enable_groups: ['default'],
          },
        ],
        group_ratio: { default: 1 },
      },
      { updatedAt: Date.now() + 60000 }
    )
    await renderApp(
      <AccessAuthLayout>
        <p>Login form</p>
      </AccessAuthLayout>,
      client
    )
    expect(screen.getAllByText('real-model').length).toBeGreaterThan(0)
    expect(screen.queryAllByText('gpt-5.6-luna')).toHaveLength(0)
    expect(screen.getAllByText('List price').length).toBeGreaterThan(0)
  })
  it('uses an honest empty state when no prices are accessible', async () => {
    client.setQueryData(['pricing', 'home', null], null, {
      updatedAt: Date.now() + 60000,
    })
    await renderApp(
      <AccessAuthLayout>
        <p>Login form</p>
      </AccessAuthLayout>,
      client
    )
    expect(screen.queryAllByText('gpt-5.6-luna')).toHaveLength(0)
    expect(screen.getByText('No models available')).toBeVisible()
  })
})
