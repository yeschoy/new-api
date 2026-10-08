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
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { Button, ConfirmButton, Notice, Panel, Tag, toast } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { errorMessage } from '@/lib/api'
import { useAuthStatus } from '@/pages/auth/auth-status'
import { useConsoleKey } from '@/pages/console/console-hooks'

import { relativeTime } from './account-format'
import { SettingRow } from './account-ui'
import { getPasskeyStatus, proofByPasskey, registerPasskey, removePasskey, type ProofScope } from './passkey-api'
import { ProofModal } from './proof-modal'
import { useTwoFactorStatus } from './two-factor-panel'
import { isPasskeyCancel, passkeySupported } from './webauthn'

/**
 * Passkey sign-in for this account. Adding one needs an authenticator code when
 * two-step verification is on; removing one needs that code, or else the passkey.
 */
export function PasskeyPanel() {
  const { t } = useI18n()
  const status = useAuthStatus()
  const queryClient = useQueryClient()
  const passkey = useQuery({ queryKey: useConsoleKey('passkey'), queryFn: getPasskeyStatus })
  const twoFactor = useTwoFactorStatus()
  const [supported, setSupported] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [proofFor, setProofFor] = useState<ProofScope | null>(null)
  const enabled = Boolean(passkey.data?.enabled)

  useEffect(() => {
    let alive = true
    void passkeySupported().then((value) => {
      if (alive) setSupported(value)
    })
    return () => {
      alive = false
    }
  }, [])

  if (!status?.passkey_login && !enabled) return null

  async function run(action: () => Promise<void>, done: string) {
    setBusy(true)
    try {
      await action()
      toast.success(done)
      await queryClient.invalidateQueries({ queryKey: ['console'] })
    } catch (err) {
      toast.error(isPasskeyCancel(err) ? t('Passkey 操作已取消') : errorMessage(err, t('Passkey 操作失败')))
    } finally {
      setBusy(false)
    }
  }

  const add = (proof?: string) => run(() => registerPasskey(proof), t('Passkey 已添加'))
  const remove = (proof: string) => run(() => removePasskey(proof), t('Passkey 已移除'))

  function onAdd() {
    if (twoFactor.data?.enabled) return setProofFor('passkey.register')
    void add()
  }

  function onRemove() {
    if (twoFactor.data?.enabled) return setProofFor('passkey.delete')
    void run(async () => removePasskey(await proofByPasskey('passkey.delete')), t('Passkey 已移除'))
  }

  if (!passkey.data || !twoFactor.data) {
    return (
      <Panel title='Passkey'>
        <p className='text-or-muted text-[14px]'>{passkey.isError ? errorMessage(passkey.error, t('Passkey 操作失败')) : t('加载中…')}</p>
      </Panel>
    )
  }

  const lastUsed = Date.parse(passkey.data.last_used_at ?? '')
  const lastUsedText = Number.isNaN(lastUsed) ? t('尚未使用') : relativeTime(Math.floor(lastUsed / 1000))
  const description = enabled ? t('上次使用：{time}', { time: lastUsedText }) : t('用指纹、面容或设备密码登录，无需输入密码。')

  return (
    <Panel title='Passkey'>
      <SettingRow
        title={
          <>
            {t('Passkey 登录')}
            <Tag tone={enabled ? 'success' : 'neutral'}>{enabled ? t('已启用') : t('未启用')}</Tag>
          </>
        }
        description={description}
      >
        {enabled ? (
          <ConfirmButton question={t('移除后需改用其他方式登录，确认？')} busy={busy} onConfirm={onRemove}>
            {t('移除 Passkey')}
          </ConfirmButton>
        ) : (
          <Button variant='primary' busy={busy} disabled={supported === false} onClick={onAdd}>
            {t('添加 Passkey')}
          </Button>
        )}
      </SettingRow>
      {supported === false && !enabled ? (
        <Notice tone='info' className='mt-4'>
          {t('此设备不支持 Passkey，请使用支持生物识别或安全密钥的浏览器与设备。')}
        </Notice>
      ) : null}
      {proofFor ? (
        <ProofModal
          scope={proofFor}
          onClose={() => setProofFor(null)}
          onProof={(proof) => void (proofFor === 'passkey.register' ? add(proof) : remove(proof))}
        />
      ) : null}
    </Panel>
  )
}
