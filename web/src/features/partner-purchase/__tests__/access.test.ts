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

import {
  forgetPurchaseEntry,
  freezePurchaseDraft,
  preparePurchaseEntry,
  purchaseStorageUnavailable,
  readPurchaseDraft,
  readPurchaseEntry,
  savePurchaseAccess,
} from '../lib/access'
import { isPartnerPublicPath, isPartnerPurchasePath } from '../lib/surface'
import { access, aliases, LAUNCH, negatives, SESSION_ID } from './fixtures'

afterEach(() => {
  forgetPurchaseEntry(SESSION_ID)
  sessionStorage.clear()
  window.history.replaceState(null, '', '/')
  vi.restoreAllMocks()
})
function enter(path = '/partner/purchase', fragment = `launch=${LAUNCH}`) {
  window.history.replaceState(
    null,
    '',
    `${path}?session_id=${SESSION_ID}#${fragment}`
  )
  preparePurchaseEntry()
}
describe('private purchase entry', () => {
  it.each(aliases)(
    'canonicalizes/scrubs %s and preserves a stable cryptographic nonce on reload',
    (path) => {
      enter(path)
      const entry = readPurchaseEntry(SESSION_ID)
      expect(entry).toMatchObject({ kind: 'launch', launchCode: LAUNCH })
      expect(entry?.kind === 'launch' && entry.nonce).toMatch(/^[a-f0-9]{64}$/)
      expect(window.location.pathname).toBe('/partner/purchase')
      expect(window.location.hash).toBe('')
      expect(window.location.search).toBe(`?session_id=${SESSION_ID}`)
      preparePurchaseEntry()
      expect(readPurchaseEntry(SESSION_ID)).toEqual(entry)
      expect(
        localStorage.getItem(`partner-purchase:v1:${SESSION_ID}`)
      ).toBeNull()
    }
  )
  it('keeps the same nonce and deadline if an unconfirmed launch URL is reopened in this tab', () => {
    enter()
    const original = readPurchaseEntry(SESSION_ID)
    enter()
    expect(readPurchaseEntry(SESSION_ID)).toEqual(original)
  })
  it.each(negatives)('does not widen public access to %s', (path) => {
    expect(isPartnerPurchasePath(path)).toBe(false)
    expect(isPartnerPublicPath(path)).toBe(false)
  })
  it.each([
    'launch=bad',
    `launch=${LAUNCH}&launch=${LAUNCH}`,
    `token=${LAUNCH}`,
    `launch=${LAUNCH}&other=1`,
  ])(
    'invalid fragment %s cannot revive saved access or another session',
    (fragment) => {
      savePurchaseAccess(access())
      savePurchaseAccess({ ...access(), sessionId: `PPS${'x'.repeat(32)}` })
      enter('/partner/purchase', fragment)
      expect(readPurchaseEntry(SESSION_ID)).toBeNull()
      expect(window.location.hash).toBe('')
    }
  )
  it('rejects ambiguous queries even with a formerly valid session', () => {
    savePurchaseAccess(access())
    window.history.replaceState(
      null,
      '',
      `/partner/purchase?session_id=${SESSION_ID}&session_id=${SESSION_ID}`
    )
    preparePurchaseEntry()
    expect(readPurchaseEntry(SESSION_ID)).toBeNull()
  })
  it('replaces temporary launch and nonce with purpose-separated access', () => {
    enter()
    const value = access()
    savePurchaseAccess(value)
    const raw =
      sessionStorage.getItem(`partner-purchase:v1:${SESSION_ID}`) ?? ''
    expect(raw).not.toContain(LAUNCH)
    expect(raw).not.toContain('nonce')
    expect(readPurchaseEntry(`PPS${'y'.repeat(32)}`)).toBeNull()
    expect(readPurchaseEntry(SESSION_ID)).toEqual(value)
  })
  it('freezes the first draft across retries and storage reads', () => {
    expect(
      freezePurchaseDraft(SESSION_ID, { plan_id: 42, payment_method: 'alipay' })
    ).toEqual({ plan_id: 42, payment_method: 'alipay' })
    expect(
      freezePurchaseDraft(SESSION_ID, { plan_id: 43, payment_method: 'wxpay' })
    ).toEqual(readPurchaseDraft(SESSION_ID))
    expect(readPurchaseDraft(SESSION_ID)?.plan_id).toBe(42)
  })
  it('uses only memory if storage is blocked and fails closed without secure randomness', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    enter()
    expect(readPurchaseEntry(SESSION_ID)?.kind).toBe('launch')
    savePurchaseAccess(access())
    expect(readPurchaseEntry(SESSION_ID)?.kind).toBe('access')
    expect(purchaseStorageUnavailable()).toBe(true)
    vi.spyOn(crypto, 'getRandomValues').mockImplementation(() => {
      throw new Error('no crypto')
    })
    enter()
    expect(readPurchaseEntry(SESSION_ID)).toBeNull()
  })
})
