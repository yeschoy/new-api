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
import { useEffect, useRef } from 'react'

import { t } from '@/i18n/i18n'
import { api, errorMessage, type ApiEnvelope } from '@/lib/api'
import { authStore, isAuthBundle } from '@/lib/auth-store'

import { authFailure, telegramBindFailure } from './auth-api'
import { BIND_CALLBACK, BIND_RESULT, TELEGRAM_BIND_RESULT, browser, handoffTarget, takeSignInRedirect } from './oauth-flow'
import { safeRedirect } from './sign-in-page'
import { useFinishSignIn } from './use-finish-sign-in'

/** What a provider sent back on /oauth/:provider. */
export type ProviderCallback = { code: string; state: string; error: string; errorDescription: string }

export function readCallback(search: URLSearchParams): ProviderCallback {
  return {
    code: search.get('code') ?? '',
    state: search.get('state') ?? '',
    error: search.get('error') ?? '',
    errorDescription: search.get('error_description') ?? '',
  }
}

/** Sign-in: the backend checks the state, signs in, or names the custom domain to hand over to. */
export function useSignInCallback(active: boolean, provider: string, callback: ProviderCallback, onFailure: (message: string) => void) {
  const finish = useFinishSignIn()
  const started = useRef(false)

  useEffect(() => {
    // The code works once; StrictMode's second effect run must not spend it again.
    if (!active || started.current) return
    started.current = true
    if (!callback.code && !callback.error) return onFailure(t('授权未完成，请重新登录。'))
    const params: Record<string, string> = { ...(callback.code ? { code: callback.code } : {}), state: callback.state }
    if (callback.error) params.error = callback.error
    if (callback.errorDescription) params.error_description = callback.errorDescription
    void (async () => {
      try {
        const res = await api.get<ApiEnvelope<unknown>>(`/api/oauth/${encodeURIComponent(provider)}`, { params, validateStatus: () => true })
        const body = res.data
        const next = handoffTarget(body?.data, Boolean(body?.success))
        if (next) return browser.replace(next)
        if (body?.success && isAuthBundle(body.data)) {
          authStore.applyBundle(body.data)
          return finish(safeRedirect(takeSignInRedirect()))
        }
        onFailure(authFailure(body, t('授权失败')))
      } catch (err) {
        onFailure(errorMessage(err, t('授权失败')))
      }
    })()
  }, [active, provider, callback, finish, onFailure])
}

/** Binding: hand the code to the security page that opened this popup and wait for its verdict. */
export function useBindRelay(active: boolean, provider: string, callback: ProviderCallback, onFailure: (message: string) => void) {
  useEffect(() => {
    if (!active) return
    const opener = window.opener as Window | null
    if (!opener || opener.closed) return onFailure(t('发起绑定的页面已关闭，请回到账户安全重试。'))
    let closer: number | undefined
    const closeSoon = () => {
      closer = window.setTimeout(() => window.close(), 1500)
    }
    const deadline = window.setTimeout(() => {
      onFailure(t('绑定超时，请重试。'))
      closeSoon()
    }, 30_000)
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== opener) return
      const result = event.data as { type?: string; provider?: string; state?: string; success?: boolean; message?: string } | null
      if (result?.type !== BIND_RESULT || result.provider !== provider || result.state !== callback.state) return
      window.clearTimeout(deadline)
      if (result.success) return window.close()
      onFailure(result.message || t('授权失败'))
      closeSoon()
    }
    window.addEventListener('message', onMessage)
    opener.postMessage(
      { type: BIND_CALLBACK, provider, code: callback.code, state: callback.state, error: callback.error, errorDescription: callback.errorDescription },
      window.location.origin
    )
    return () => {
      window.removeEventListener('message', onMessage)
      window.clearTimeout(deadline)
      window.clearTimeout(closer)
    }
  }, [active, provider, callback, onFailure])
}

/**
 * Telegram binding: the backend sends Telegram's window here with the result
 * (/oauth/telegram?telegram_bind=…); pass it to the page that asked, or show it.
 */
export function useTelegramRelay(active: boolean, search: URLSearchParams, onFailure: (message: string) => void, onBound: () => void) {
  useEffect(() => {
    if (!active) return
    const flowToken = search.get('flow_token') ?? ''
    const success = search.get('telegram_bind') === 'success'
    const code = search.get('error_code') ?? undefined
    if (!flowToken) return onFailure(telegramBindFailure(undefined))
    const opener = window.opener as Window | null
    if (opener && !opener.closed) {
      opener.postMessage({ type: TELEGRAM_BIND_RESULT, flow_token: flowToken, success, code }, window.location.origin)
      return window.close()
    }
    if (success) onBound()
    else onFailure(telegramBindFailure(code))
  }, [active, search, onFailure, onBound])
}
