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
import { useEffect, useState } from 'react'

import {
  CashierError,
  getCashierOrder,
  type CashierErrorKind,
  type CashierOrder,
} from '../api'
import {
  forgetCashierAccess,
  readCashierAccess,
  saveCashierAccess,
} from '../lib/access'

interface CashierState {
  order?: CashierOrder
  error?: CashierErrorKind
  loading: boolean
}

export function useCashier(orderNo: string) {
  const [state, setState] = useState<CashierState>({ loading: true })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const access = readCashierAccess(orderNo)
    if (!access) {
      setState({ loading: false, error: 'invalid' })
      return
    }
    let disposed = false
    let stopped = false
    let failures = 0
    let pollTimer: ReturnType<typeof setTimeout> | undefined
    let expiryTimer: ReturnType<typeof setTimeout> | undefined
    let requestTimer: ReturnType<typeof setTimeout> | undefined
    let controller: AbortController | undefined
    setState((previous) => ({ ...previous, loading: true, error: undefined }))

    const expire = () => {
      stopped = true
      controller?.abort()
      clearTimeout(pollTimer)
      clearTimeout(requestTimer)
      forgetCashierAccess(orderNo)
      setState((previous) => ({
        ...previous,
        loading: false,
        error: 'expired',
      }))
    }
    const armExpiry = () => {
      clearTimeout(expiryTimer)
      expiryTimer = setTimeout(
        expire,
        Math.max(0, access.expiresAt - Date.now())
      )
    }
    armExpiry()

    const poll = async () => {
      if (disposed || stopped) return
      controller = new AbortController()
      requestTimer = setTimeout(() => controller?.abort(), 10000)
      try {
        const order = await getCashierOrder(access, controller.signal)
        if (disposed || stopped) return
        access.expiresAt = Math.min(access.expiresAt, order.expires_at * 1000)
        saveCashierAccess(access)
        if (access.expiresAt <= Date.now()) {
          setState({ order, loading: false, error: 'expired' })
          expire()
          return
        }
        armExpiry()
        failures = 0
        setState({ order, loading: false })
        if (
          order.payment_status === 'failed' ||
          order.payment_status === 'expired' ||
          (order.payment_status === 'paid' &&
            order.fulfillment_status === 'fulfilled')
        ) {
          stopped = true
          clearTimeout(expiryTimer)
          // Retain short-lived per-order access so same-tab reload can still
          // display the final result; readCashierAccess enforces its expiry.
          return
        }
      } catch (error) {
        if (disposed || stopped) return
        const kind = error instanceof CashierError ? error.kind : 'retry'
        setState((previous) => ({ ...previous, loading: false, error: kind }))
        failures += 1
        if (kind !== 'retry') {
          stopped = true
          clearTimeout(expiryTimer)
          forgetCashierAccess(orderNo)
          return
        }
      } finally {
        clearTimeout(requestTimer)
      }
      // Schedule AFTER completion: requests never overlap. Bound automatic
      // failures; the user may retry status, never create/confirm a payment.
      if (!disposed && !stopped && failures < 5) {
        pollTimer = setTimeout(() => void poll(), 3000)
      }
    }
    void poll()
    return () => {
      disposed = true
      controller?.abort()
      clearTimeout(pollTimer)
      clearTimeout(expiryTimer)
      clearTimeout(requestTimer)
    }
  }, [orderNo, attempt])

  return { ...state, retry: () => setAttempt((value) => value + 1) }
}
