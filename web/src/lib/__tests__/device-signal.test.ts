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
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getDeviceSignal, shouldAttachDeviceSignal } from '../device-signal'

const originalCrypto = window.crypto

beforeAll(() => {
  window.localStorage.clear()
  Object.defineProperty(window, 'crypto', {
    configurable: true,
    value: {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.fill(1)
        return bytes
      },
      subtle: {
        digest: async () => new Uint8Array(32).fill(2).buffer,
      },
    },
  })
})

afterAll(() => {
  Object.defineProperty(window, 'crypto', {
    configurable: true,
    value: originalCrypto,
  })
  window.localStorage.clear()
})

describe('device signal', () => {
  it('creates a versioned hashed signal without exposing the local seed', async () => {
    const signal = await getDeviceSignal()

    expect(signal).toBe(`v1:${'02'.repeat(32)}`)
    expect(signal).not.toContain('01'.repeat(32))
  })

  it('attaches only to authentication and online top-up POST requests', () => {
    expect(shouldAttachDeviceSignal('post', '/api/user/login?turnstile=')).toBe(
      true
    )
    expect(shouldAttachDeviceSignal('POST', '/api/user/stripe/pay')).toBe(true)
    expect(
      shouldAttachDeviceSignal('POST', '/api/subscription/stripe/pay')
    ).toBe(false)
    expect(shouldAttachDeviceSignal('GET', '/api/user/login')).toBe(false)
  })
})
