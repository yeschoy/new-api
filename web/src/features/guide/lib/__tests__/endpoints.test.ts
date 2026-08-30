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
import { describe, expect, test } from 'vitest'

import {
  getAddressValue,
  getRouteAddresses,
  isDoubleV1,
  matchOfficialRoute,
  visibleRouteIds,
} from '../endpoints'

describe('guide endpoint helpers', () => {
  test('builds mainland Base URL, host, path, and full Chat URL', () => {
    const addresses = getRouteAddresses('mainland', 'https://example.com')

    expect(addresses.host).toBe('https://yeschoy.com')
    expect(addresses.baseUrl).toBe('https://yeschoy.com/v1')
    expect(addresses.path).toBe('/v1/chat/completions')
    expect(addresses.fullUrl).toBe('https://yeschoy.com/v1/chat/completions')
  })

  test('builds global addresses from the Cloudflare host', () => {
    const addresses = getRouteAddresses('global', 'https://example.com')

    expect(getAddressValue(addresses, 'host')).toBe('https://api.yeschoy.com')
    expect(getAddressValue(addresses, 'baseUrl')).toBe(
      'https://api.yeschoy.com/v1'
    )
  })

  test('uses the current origin when the current route is selected', () => {
    const addresses = getRouteAddresses('current', 'https://local.yecao.test/')

    expect(addresses.baseUrl).toBe('https://local.yecao.test/v1')
    expect(addresses.fullUrl).toBe(
      'https://local.yecao.test/v1/chat/completions'
    )
  })

  test('matches official hosts and keeps unknown origins as current', () => {
    expect(matchOfficialRoute('https://yeschoy.com')).toBe('mainland')
    expect(matchOfficialRoute('https://www.yeschoy.com/')).toBe('mainland')
    expect(matchOfficialRoute('https://api.yeschoy.com')).toBe('global')
    expect(matchOfficialRoute('http://localhost:3000')).toBe('current')
  })

  test('hides the current-site line on official hosts', () => {
    expect(visibleRouteIds('https://yeschoy.com')).toEqual([
      'mainland',
      'global',
    ])
    expect(visibleRouteIds('http://localhost:5173')).toEqual([
      'current',
      'mainland',
      'global',
    ])
  })

  test('detects a duplicated /v1 path that beginners often paste', () => {
    expect(isDoubleV1('https://yeschoy.com/v1/v1/chat/completions')).toBe(true)
    expect(isDoubleV1('https://yeschoy.com/v1')).toBe(false)
  })
})
