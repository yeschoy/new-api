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
import { useCallback, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'

import { AuthCard } from '@/components/auth-card'
import { useI18n } from '@/i18n/i18n'

import { AUTH_LINK, AuthMessage } from './auth-parts'
import { useAuthStatus } from './auth-status'
import { readCallback, useBindRelay, useSignInCallback, useTelegramRelay } from './oauth-callback-flows'
import { callbackMode, storageOf } from './oauth-flow'
import { providerName } from './oauth-providers'

type Mode = 'login' | 'bind' | 'telegram'

/**
 * Where providers send the browser back (/oauth/:provider): a sign-in in the
 * visitor's tab, a binding in the popup the security page opened, or the
 * result of a Telegram binding.
 */
export function OAuthCallbackPage() {
  const { t } = useI18n()
  const provider = useParams().provider ?? ''
  const [search] = useSearchParams()
  const status = useAuthStatus()
  const callback = useMemo(() => readCallback(search), [search])
  const [mode] = useState<Mode>(() => {
    const telegramBind = search.get('telegram_bind')
    if (provider === 'telegram' && (telegramBind === 'success' || telegramBind === 'error')) return 'telegram'
    return callbackMode(provider, callback.state, { opener: window.opener as Window | null, storage: storageOf(window) })
  })
  const [failure, setFailure] = useState('')
  const [bound, setBound] = useState(false)
  const markBound = useCallback(() => setBound(true), [])

  useSignInCallback(mode === 'login', provider, callback, setFailure)
  useBindRelay(mode === 'bind', provider, callback, setFailure)
  useTelegramRelay(mode === 'telegram', search, setFailure, markBound)

  const name = provider === 'wechat' ? t('微信') : providerName(provider, status)
  const back =
    mode === 'login' ? (
      <Link to='/sign-in' className={AUTH_LINK}>
        {t('返回登录')}
      </Link>
    ) : (
      <Link to='/settings/security' className={AUTH_LINK}>
        {t('前往账户安全')}
      </Link>
    )

  if (failure) {
    return (
      <AuthCard title={mode === 'login' ? t('登录失败') : t('绑定失败')} footer={back}>
        <AuthMessage tone='error'>{failure}</AuthMessage>
      </AuthCard>
    )
  }

  if (bound) {
    return (
      <AuthCard title={t('绑定成功')} subtitle={t('{provider} 账号已绑定。', { provider: name })} footer={back}>
        {null}
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title={mode === 'login' ? t('正在通过 {provider} 登录', { provider: name }) : t('正在绑定 {provider} 账号', { provider: name })}
      subtitle={mode === 'login' ? t('完成后会自动跳转。') : t('绑定完成后此窗口会自动关闭。')}
    >
      <div className='text-or-muted flex items-center justify-center gap-2 text-[14px]' role='status'>
        <Loader2 className='size-4 animate-spin' aria-hidden='true' />
        {t('正在处理授权结果…')}
      </div>
    </AuthCard>
  )
}
