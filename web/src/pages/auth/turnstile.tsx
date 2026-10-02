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
import { useEffect, useRef, useState } from 'react'

import { useAuthStatus } from './auth-status'

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: Record<string, unknown>) => string | undefined
      remove?: (widgetId: string) => void
    }
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

let loading: Promise<void> | null = null

function loadScript(): Promise<void> {
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = SCRIPT_SRC
      script.async = true
      script.onload = () => resolve()
      script.onerror = () => {
        loading = null
        reject(new Error('turnstile'))
      }
      document.head.appendChild(script)
    })
  }
  return loading
}

/** Cloudflare's human check; reports its token, or '' once it expires. */
function TurnstileWidget(props: { siteKey: string; onToken: (token: string) => void }) {
  const box = useRef<HTMLDivElement>(null)
  const onToken = useRef(props.onToken)

  useEffect(() => {
    onToken.current = props.onToken
  }, [props.onToken])

  useEffect(() => {
    let widgetId: string | undefined
    let gone = false
    const draw = () => {
      if (gone || !box.current || !window.turnstile) return
      widgetId = window.turnstile.render(box.current, {
        sitekey: props.siteKey,
        callback: (token: string) => onToken.current(token),
        'expired-callback': () => onToken.current(''),
        'error-callback': () => onToken.current(''),
      })
    }
    if (window.turnstile) draw()
    else loadScript().then(draw, () => undefined)
    return () => {
      gone = true
      if (widgetId) window.turnstile?.remove?.(widgetId)
    }
  }, [props.siteKey])

  return <div ref={box} className='flex min-h-[65px] justify-center' />
}

/**
 * The site's human check when the administrator turned it on: the widget to
 * place in a form, its token (sent as ?turnstile=) and a reset, since every
 * token works only once.
 */
export function useTurnstile() {
  const status = useAuthStatus()
  const siteKey = status?.turnstile_check ? (status.turnstile_site_key ?? '') : ''
  const [token, setToken] = useState('')
  const [round, setRound] = useState(0)
  return {
    /** No widget can show: the check is on but the site key is missing. */
    misconfigured: Boolean(status?.turnstile_check) && !siteKey,
    ready: !siteKey || Boolean(token),
    token,
    widget: siteKey ? <TurnstileWidget key={round} siteKey={siteKey} onToken={setToken} /> : null,
    reset: () => {
      if (!siteKey) return
      setToken('')
      setRound((value) => value + 1)
    },
  }
}
