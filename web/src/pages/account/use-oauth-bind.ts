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
import { useCallback, useEffect, useRef } from 'react'

import { toast } from '@/components/ui'
import { t } from '@/i18n/i18n'
import { errorMessage } from '@/lib/api'
import { createOAuthState } from '@/pages/auth/auth-api'
import { BIND_CALLBACK, BIND_HANDOFF, BIND_RESULT, BIND_RETURN, isBindReturnResult, markBindPopup, storageOf } from '@/pages/auth/oauth-flow'
import type { RedirectProvider } from '@/pages/auth/oauth-providers'

import { finishOAuthBind, redeemBindHandoff } from './bindings-api'

type Pending = { provider: string; state: string; popup: Window; stop: () => void }

/**
 * Binds a redirect provider in a popup: open it at once (popup blockers only
 * allow that during the click), stamp it, send it to the provider, then wait
 * for /oauth/:provider in it to post the code back — or, for a custom domain,
 * for the /oauth/handoff bridge to post a ticket.
 */
export function useOAuthBind(onBound: () => void) {
  const pending = useRef<Pending | null>(null)
  const bound = useRef(onBound)

  useEffect(() => {
    bound.current = onBound
  }, [onBound])

  const clear = useCallback((entry: Pending) => {
    if (pending.current !== entry) return
    entry.stop()
    pending.current = null
  }, [])

  const start = useCallback(
    async (provider: RedirectProvider) => {
      const previous = pending.current
      if (previous) {
        clear(previous)
        if (!previous.popup.closed) previous.popup.close()
      }
      const popup = window.open('', '_blank')
      if (!popup) return toast.error(t('浏览器拦截了弹出窗口，请允许弹窗后重试'))
      const entry: Pending = { provider: provider.id, state: '', popup, stop: () => undefined }
      const watch = window.setInterval(() => {
        if (popup.closed) clear(entry)
      }, 500)
      entry.stop = () => window.clearInterval(watch)
      pending.current = entry
      try {
        const state = await createOAuthState(provider.id, 'bind')
        if (pending.current !== entry || popup.closed) return
        if (!markBindPopup(storageOf(popup as unknown as { sessionStorage: Storage }), provider.id, state)) throw new Error('storage')
        entry.state = state
        popup.location.replace(provider.authorizeUrl(state))
      } catch {
        const current = pending.current === entry
        clear(entry)
        popup.close()
        if (current) toast.error(t('无法发起授权，请稍后重试'))
      }
    },
    [clear]
  )

  useEffect(() => {
    const onMessage = async (event: MessageEvent) => {
      const entry = pending.current
      if (event.origin !== window.location.origin || !entry || event.source !== entry.popup) return
      const data = (event.data ?? {}) as Record<string, unknown>
      if (data.provider !== entry.provider) return

      if (data.type === BIND_RETURN && isBindReturnResult(data.result)) {
        clear(entry)
        toast.error(t('授权失败'))
        entry.popup.close()
        return
      }
      if (data.type === BIND_HANDOFF && typeof data.ticket === 'string' && data.ticket) {
        clear(entry)
        try {
          await redeemBindHandoff(data.ticket)
          toast.success(t('绑定成功'))
          bound.current()
        } catch (err) {
          toast.error(errorMessage(err, t('授权失败')))
        } finally {
          if (!entry.popup.closed) entry.popup.close()
        }
        return
      }
      if (data.type !== BIND_CALLBACK || !entry.state || data.state !== entry.state) return

      clear(entry)
      let success = false
      let message = t('授权失败')
      try {
        await finishOAuthBind(entry.provider, { state: entry.state, code: data.code, error: data.error, errorDescription: data.errorDescription })
        success = true
        toast.success(t('绑定成功'))
        bound.current()
      } catch (err) {
        message = errorMessage(err, message)
        toast.error(message)
      }
      entry.popup.postMessage({ type: BIND_RESULT, provider: entry.provider, state: entry.state, success, message }, window.location.origin)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [clear])

  useEffect(
    () => () => {
      const entry = pending.current
      if (!entry) return
      clear(entry)
      if (!entry.popup.closed) entry.popup.close()
    },
    [clear]
  )

  return start
}
