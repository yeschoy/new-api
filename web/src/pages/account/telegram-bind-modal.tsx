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

import { Button, Modal, Notice, toast } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { errorMessage } from '@/lib/api'
import { telegramBindFailure } from '@/pages/auth/auth-api'
import { TELEGRAM_BIND_RESULT } from '@/pages/auth/oauth-flow'
import { TelegramWidget } from '@/pages/auth/telegram-widget'

import { startTelegramBind, type TelegramBindFlow } from './bindings-api'

/**
 * Binding Telegram: the widget sends Telegram's window to this binding's
 * callback, and /oauth/telegram there posts the result back to this page.
 */
export function TelegramBindModal(props: { botName: string; onBound: () => void; onClose: () => void }) {
  const { t } = useI18n()
  const [flow, setFlow] = useState<TelegramBindFlow | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const onBound = props.onBound
  const onClose = props.onClose

  useEffect(() => {
    let alive = true
    setFlow(null)
    setError('')
    startTelegramBind().then(
      (value) => {
        if (alive) setFlow(value)
      },
      (err) => {
        if (alive) setError(errorMessage(err, t('Telegram 绑定失败，请重试。')))
      }
    )
    return () => {
      alive = false
    }
  }, [attempt, t])

  useEffect(() => {
    if (!flow) return
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      const data = event.data as { type?: string; flow_token?: string; success?: boolean; code?: string } | null
      if (data?.type !== TELEGRAM_BIND_RESULT || data.flow_token !== flow.flow_token) return
      if (!data.success) return setError(telegramBindFailure(data.code))
      toast.success(t('绑定成功'))
      onBound()
      onClose()
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [flow, onBound, onClose, t])

  const bot = props.botName.replace(/^@/, '')
  return (
    <Modal title={t('绑定 {provider} 账号', { provider: 'Telegram' })} onClose={props.onClose}>
      <div className='flex flex-col gap-4'>
        <p className='text-or-muted text-[14px]'>{t('点击下方按钮，在 Telegram 中授权机器人 @{bot}，完成后会自动绑定。', { bot })}</p>
        {flow ? <TelegramWidget botName={bot} authUrl={new URL(flow.callback_url, window.location.origin).toString()} /> : null}
        {error ? (
          <>
            <Notice tone='error'>{error}</Notice>
            <div className='flex justify-end'>
              <Button onClick={() => setAttempt((value) => value + 1)}>{t('重试')}</Button>
            </div>
          </>
        ) : null}
      </div>
    </Modal>
  )
}
