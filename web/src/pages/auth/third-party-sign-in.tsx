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
import { useState } from 'react'

import { Modal, Notice } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { errorMessage } from '@/lib/api'

import { createOAuthState, telegramAuthorization, telegramSignIn, wechatSignIn } from './auth-api'
import { AuthMessage } from './auth-parts'
import type { AuthStatus } from './auth-status'
import { browser, rememberSignInRedirect } from './oauth-flow'
import { redirectProviders, type RedirectProvider } from './oauth-providers'
import { PasskeySignIn, ProviderButton } from './passkey-sign-in'
import { TelegramWidget } from './telegram-widget'
import { WeChatCodeModal } from './wechat-code-modal'

/**
 * Every sign-in besides the password, each shown only when the site switched
 * it on: passkey, WeChat, the redirect providers, Telegram and custom OAuth.
 */
export function ThirdPartySignIn(props: {
  status: AuthStatus | undefined
  redirect: string
  /** Waiting for the visitor to accept the terms. */
  disabled: boolean
  passkey: boolean
  onSignedIn: () => void
}) {
  const { t } = useI18n()
  const status = props.status
  const providers = redirectProviders(status)
  const [leaving, setLeaving] = useState('')
  const [error, setError] = useState('')
  const [dialog, setDialog] = useState<'wechat' | 'telegram' | null>(null)

  async function leaveFor(provider: RedirectProvider) {
    setError('')
    setLeaving(provider.id)
    try {
      const state = await createOAuthState(provider.id, 'login')
      rememberSignInRedirect(props.redirect)
      browser.assign(provider.authorizeUrl(state))
    } catch (err) {
      setLeaving('')
      setError(errorMessage(err, t('无法发起授权，请稍后重试')))
    }
  }

  const redirectButton = (provider: RedirectProvider) => (
    <ProviderButton
      key={provider.id}
      mark={provider.custom ? 'custom' : provider.id}
      label={t('使用 {provider} 继续', { provider: provider.name })}
      busy={leaving === provider.id}
      disabled={props.disabled || Boolean(leaving)}
      onClick={() => leaveFor(provider)}
    />
  )

  return (
    <div className='flex flex-col gap-2'>
      {props.passkey && status?.passkey_login ? <PasskeySignIn disabled={props.disabled} onSignedIn={props.onSignedIn} /> : null}
      {status?.wechat_login ? (
        <ProviderButton mark='wechat' label={t('使用微信继续')} disabled={props.disabled} onClick={() => setDialog('wechat')} />
      ) : null}
      {providers.filter((provider) => !provider.custom).map(redirectButton)}
      {status?.telegram_oauth && status.telegram_bot_name ? (
        <ProviderButton
          mark='telegram'
          label={t('使用 {provider} 继续', { provider: 'Telegram' })}
          disabled={props.disabled}
          onClick={() => setDialog('telegram')}
        />
      ) : null}
      {providers.filter((provider) => provider.custom).map(redirectButton)}
      {error ? <AuthMessage tone='error'>{error}</AuthMessage> : null}

      {dialog === 'wechat' ? (
        <WeChatCodeModal
          title={t('微信登录')}
          qrcode={status?.wechat_qrcode ?? ''}
          submitLabel={t('登录')}
          onSubmit={async (code) => {
            await wechatSignIn(code)
            props.onSignedIn()
          }}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog === 'telegram' ? (
        <TelegramSignIn botName={status?.telegram_bot_name ?? ''} onSignedIn={props.onSignedIn} onClose={() => setDialog(null)} />
      ) : null}
    </div>
  )
}

function TelegramSignIn(props: { botName: string; onSignedIn: () => void; onClose: () => void }) {
  const { t } = useI18n()
  const [error, setError] = useState('')

  async function onAuth(user: unknown) {
    const authorization = telegramAuthorization(user)
    if (!authorization) return setError(t('登录失败'))
    setError('')
    try {
      await telegramSignIn(authorization)
      props.onSignedIn()
    } catch (err) {
      setError(errorMessage(err, t('登录失败')))
    }
  }

  return (
    <Modal title={t('{provider} 登录', { provider: 'Telegram' })} onClose={props.onClose}>
      <div className='flex flex-col gap-4'>
        <p className='text-or-muted text-[14px]'>{t('点击下方按钮，在 Telegram 中确认登录。')}</p>
        <TelegramWidget botName={props.botName} onAuth={onAuth} />
        {error ? <Notice tone='error'>{error}</Notice> : null}
      </div>
    </Modal>
  )
}
