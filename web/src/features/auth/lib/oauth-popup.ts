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
import { AuthOperationError } from '@/lib/secure-verification'

import {
  OAUTH_BIND_HANDOFF_MESSAGE,
  OAUTH_BIND_RETURN_MESSAGE,
  OAUTH_POPUP_CALLBACK_MESSAGE,
  OAUTH_POPUP_RESULT_MESSAGE,
} from '../constants'
import { isDomainBindReturnResult, type DomainBindReturnResult } from './domain-oauth-handoff'
import { watchOAuthPopupClosed } from './oauth-bind-window'
import { getOAuthSessionStorage, markOAuthPopup } from './oauth-callback-mode'

export interface OAuthPopupCallback {
  provider: string
  state: string
  code?: string
  error?: string
  errorDescription?: string
  handoffTicket?: string
  bindReturnResult?: DomainBindReturnResult
}

export interface OAuthPopupExchange {
  callback: OAuthPopupCallback
  signal: AbortSignal
  finish: (result: { success: boolean; message?: string }) => void
}

interface OAuthPopupOptions {
  provider: string
  intent: 'bind' | 'verify'
  signal: AbortSignal
  prepare: (signal: AbortSignal) => Promise<{ state: string; url: string }>
}

// Window transport only: account binding and security verification each submit
// their own authenticated callback request after receiving the exchange.
export function openOAuthPopup(
  options: OAuthPopupOptions
): Promise<OAuthPopupExchange> {
  if (options.signal.aborted) return Promise.reject(options.signal.reason)
  const popup = window.open('', '_blank')
  if (!popup) {
    return Promise.reject(new AuthOperationError('OAuth pop-up was blocked'))
  }
  const controller = new AbortController()
  return new Promise((resolve, reject) => {
    let state = ''
    let received = false
    let finished = false
    let stopCloseWatcher: () => void = () => undefined

    const cleanup = () => {
      window.removeEventListener('message', onMessage)
      options.signal.removeEventListener('abort', onAbort)
      stopCloseWatcher()
      clearTimeout(deadline)
    }
    const fail = (error: unknown) => {
      if (finished) return
      finished = true
      const failure = AuthOperationError.from(error)
      controller.abort(failure)
      cleanup()
      if (!popup.closed) popup.close()
      reject(failure)
    }
    const onAbort = () => fail(options.signal.reason)
    const finish: OAuthPopupExchange['finish'] = (result) => {
      if (finished) return
      finished = true
      cleanup()
      if (!popup.closed) {
        popup.postMessage(
          {
            type: OAUTH_POPUP_RESULT_MESSAGE,
            intent: options.intent,
            provider: options.provider,
            state,
            ...result,
          },
          window.location.origin
        )
        popup.close()
      }
    }
    const onMessage = (event: MessageEvent<unknown>) => {
      if (
        received ||
        finished ||
        !state ||
        event.origin !== window.location.origin ||
        event.source !== popup
      ) {
        return
      }
      const message = event.data as
        | (Partial<OAuthPopupCallback> & { type?: string; intent?: string; ticket?: unknown; result?: unknown })
        | null
      if (!message || message.provider !== options.provider) return
      const handoff = options.intent === 'bind' &&
        message.type === OAUTH_BIND_HANDOFF_MESSAGE &&
        typeof message.ticket === 'string' && message.ticket.length > 0
      const bindReturn = options.intent === 'bind' &&
        message.type === OAUTH_BIND_RETURN_MESSAGE &&
        isDomainBindReturnResult(message.result)
      const callback = message.type === OAUTH_POPUP_CALLBACK_MESSAGE &&
        message.intent === options.intent && message.state === state &&
        (typeof message.code === 'string' || typeof message.error === 'string')
      if (!handoff && !bindReturn && !callback) return
      received = true
      stopCloseWatcher()
      clearTimeout(deadline)
      window.removeEventListener('message', onMessage)
      resolve({
        callback: {
          provider: options.provider,
          state,
          code: message.code,
          error: message.error,
          errorDescription:
            typeof message.errorDescription === 'string'
              ? message.errorDescription
              : undefined,
          handoffTicket: handoff ? message.ticket as string : undefined,
          bindReturnResult: bindReturn ? message.result as DomainBindReturnResult : undefined,
        },
        signal: controller.signal,
        finish,
      })
    }

    window.addEventListener('message', onMessage)
    options.signal.addEventListener('abort', onAbort, { once: true })
    stopCloseWatcher = watchOAuthPopupClosed(popup, () =>
      fail(
        new AuthOperationError(
          'OAuth authorization was cancelled.',
          'AUTH_CANCELLED'
        )
      )
    )
    const deadline = setTimeout(
      () =>
        fail(
          new AuthOperationError(
            'OAuth authorization timed out. Please try again.'
          )
        ),
      10 * 60_000
    )
    void options
      .prepare(controller.signal)
      .then((authorization) => {
        if (finished || popup.closed) return
        state = authorization.state
        if (
          !markOAuthPopup(
            getOAuthSessionStorage(popup),
            options.provider,
            state,
            options.intent
          )
        ) {
          throw new AuthOperationError('OAuth popup storage is unavailable.')
        }
        popup.location.replace(authorization.url)
      })
      .catch(fail)
  })
}
