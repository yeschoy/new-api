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
import { Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { useI18n } from '@/i18n/i18n'

const WIDGET_SRC = 'https://telegram.org/js/telegram-widget.js?22'

let sequence = 0

/**
 * Telegram's login button. With `onAuth` it hands the signed user back in
 * this page; with `authUrl` Telegram sends the browser there instead (binding).
 */
export function TelegramWidget(props: { botName: string; onAuth?: (user: unknown) => void; authUrl?: string }) {
  const { t } = useI18n()
  const box = useRef<HTMLDivElement>(null)
  const onAuth = useRef(props.onAuth)
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')

  useEffect(() => {
    onAuth.current = props.onAuth
  }, [props.onAuth])

  useEffect(() => {
    const container = box.current
    const bot = props.botName.trim().replace(/^@/, '')
    if (!container || !bot) return
    const globals = window as unknown as Record<string, unknown>
    const script = document.createElement('script')
    script.async = true
    script.src = WIDGET_SRC
    script.dataset.telegramLogin = bot
    script.dataset.size = 'large'
    script.dataset.radius = '8'
    let callback = ''
    if (props.authUrl) {
      script.dataset.authUrl = props.authUrl
      script.dataset.requestAccess = 'write'
    } else {
      sequence += 1
      callback = `yeschoyTelegramAuth${sequence}`
      globals[callback] = (user: unknown) => onAuth.current?.(user)
      script.dataset.onauth = `${callback}(user)`
    }
    script.onload = () => setState('ready')
    script.onerror = () => setState('failed')
    container.replaceChildren(script)
    return () => {
      container.replaceChildren()
      if (callback) delete globals[callback]
    }
  }, [props.botName, props.authUrl])

  return (
    <div className='flex min-h-12 flex-col items-center justify-center gap-2'>
      {state === 'loading' ? <Loader2 className='text-or-muted size-5 animate-spin' aria-hidden='true' /> : null}
      {state === 'failed' ? <p className='text-or-red text-[13px]'>{t('Telegram 组件加载失败，请检查网络后重试。')}</p> : null}
      <div ref={box} />
    </div>
  )
}
