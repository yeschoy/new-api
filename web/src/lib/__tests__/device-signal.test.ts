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
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

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
        digest: async (_algorithm: string, data: BufferSource) => {
          const input = new Uint8Array(data as ArrayBuffer)
          const output = new Uint8Array(32)
          input.forEach((byte, index) => {
            output[index % output.length] =
              (output[index % output.length] + byte + index) % 256
          })
          return output.buffer
        },
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

    expect(signal).toMatch(/^v1:[0-9a-f]{64}$/)
    expect(signal).not.toContain('01'.repeat(32))
  })

  it('stays stable when mutable browser properties change', async () => {
    const originalUserAgent = window.navigator.userAgent
    const originalLanguage = window.navigator.language
    try {
      Object.defineProperties(window.navigator, {
        userAgent: { configurable: true, value: 'browser-version-a' },
        language: { configurable: true, value: 'en-US' },
      })
      vi.resetModules()
      const firstModule = await import('../device-signal')
      const first = await firstModule.getDeviceSignal()

      Object.defineProperties(window.navigator, {
        userAgent: { configurable: true, value: 'browser-version-b' },
        language: { configurable: true, value: 'fr-FR' },
      })
      vi.resetModules()
      const secondModule = await import('../device-signal')
      const second = await secondModule.getDeviceSignal()

      expect(second).toBe(first)
    } finally {
      Object.defineProperties(window.navigator, {
        userAgent: { configurable: true, value: originalUserAgent },
        language: { configurable: true, value: originalLanguage },
      })
    }
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
