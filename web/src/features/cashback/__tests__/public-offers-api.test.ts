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
import { afterEach, expect, it } from 'vitest'

import { api } from '@/lib/api'

import { getPublicCashbackOffers } from '../api'

const originalAdapter = api.defaults.adapter

afterEach(() => {
  api.defaults.adapter = originalAdapter
})

it('reads anonymous active directions only through the public offer endpoint', async () => {
  let requested = ''
  api.defaults.adapter = async (config) => {
    requested = config.url ?? ''
    return {
      config,
      status: 200,
      statusText: 'OK',
      headers: {},
      data: {
        success: true,
        data: {
          active: true,
          currency: 'CNY',
          inviter: {
            strategy: 'tiered',
            tiers: [{ threshold_cents: 10050, reward_cents: 250 }],
          },
        },
      },
    }
  }
  await expect(getPublicCashbackOffers()).resolves.toMatchObject({
    active: true,
    inviter: { strategy: 'tiered' },
  })
  expect(requested).toBe('/api/cashback/public-offers')
})

it('rejects a failed or inconsistent public response instead of claiming activity', async () => {
  api.defaults.adapter = async (config) => ({
    config,
    status: 200,
    statusText: 'OK',
    headers: {},
    data: { success: true, data: { active: true, currency: 'CNY' } },
  })
  await expect(getPublicCashbackOffers()).rejects.toThrow(
    'Unable to read current cashback offers'
  )
})
