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
import { useEffect, useState } from 'react'

import { useI18n } from '@/i18n/i18n'
import { errorMessage } from '@/lib/api'
import { isPasskeyCancel, passkeySupported } from '@/pages/account/webauthn'

import { passkeySignIn } from './auth-api'
import { AuthMessage } from './auth-parts'
import { ProviderMark } from './brand-icons'

/** An outlined, full-width "continue with …" button. */
export function ProviderButton(props: { mark: string; label: string; onClick: () => void; busy?: boolean; disabled?: boolean }) {
  return (
    <button
      type='button'
      onClick={props.onClick}
      disabled={props.disabled || props.busy}
      className='border-or-line text-or-fg hover:bg-or-fill flex h-10 w-full items-center justify-center gap-2 rounded-[6px] border text-[14px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60'
    >
      {props.busy ? <Loader2 className='size-4 animate-spin' aria-hidden='true' /> : <ProviderMark id={props.mark} className='size-4' />}
      {props.label}
    </button>
  )
}

/** Signs in with this device's passkey (status.passkey_login). */
export function PasskeySignIn(props: { disabled: boolean; onSignedIn: () => void }) {
  const { t } = useI18n()
  const [supported, setSupported] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    void passkeySupported().then((value) => {
      if (alive) setSupported(value)
    })
    return () => {
      alive = false
    }
  }, [])

  async function onClick() {
    setError('')
    setBusy(true)
    try {
      await passkeySignIn()
      props.onSignedIn()
    } catch (err) {
      setError(isPasskeyCancel(err) ? t('Passkey 登录已取消') : errorMessage(err, t('Passkey 登录失败')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <ProviderButton mark='passkey' label={t('使用 Passkey 登录')} busy={busy} disabled={props.disabled || supported === false} onClick={onClick} />
      {supported === false ? <p className='text-or-dim text-center text-[12px]'>{t('此设备不支持 Passkey')}</p> : null}
      {error ? <AuthMessage tone='error'>{error}</AuthMessage> : null}
    </>
  )
}
