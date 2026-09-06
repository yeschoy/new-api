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
import { afterEach, describe, expect, it, vi } from 'vitest'

describe('API client deployment origin', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('keeps browser API requests same-origin when a backend proxy target is configured', async () => {
    vi.stubEnv('VITE_REACT_APP_SERVER_URL', 'https://api.example.com/')

    const { resolveApiRequestURL } = await import('../api-base-url')
    const { api } = await import('../http-client')

    expect(api.defaults.baseURL).toBe('')
    expect(resolveApiRequestURL('/api/status')).toBe('/api/status')
  })
})
