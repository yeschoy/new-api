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
import { useI18n } from '@/i18n/i18n'
import { useAuth } from '@/lib/auth-store'
import { useSelf } from '@/pages/console/console-hooks'
import { ConsolePage } from '@/pages/console/console-page'

import { AccessTokenPanel } from './access-token-panel'
import type { AccountUser } from './account-api'
import { BindingsPanel } from './bindings-panel'
import { DeleteAccountPanel } from './delete-account-panel'
import { PasskeyPanel } from './passkey-panel'
import { PasswordPanel } from './password-panel'
import { SessionsPanel } from './sessions-panel'
import { TwoFactorPanel } from './two-factor-panel'

/** /settings/security: how the account signs in and where it is signed in. */
export function SecurityPage() {
  const { t } = useI18n()
  return (
    <ConsolePage active='security' title={t('账户安全')} description={t('管理登录密码、两步验证、第三方账号与登录设备。')}>
      <SecurityPanels />
    </ConsolePage>
  )
}

function SecurityPanels() {
  const auth = useAuth()
  const self = useSelf()
  const user = (self.data ?? auth.user) as AccountUser | null
  return (
    <div className='flex flex-col gap-4'>
      <PasswordPanel />
      <TwoFactorPanel />
      <PasskeyPanel />
      <BindingsPanel user={user} />
      <AccessTokenPanel />
      <SessionsPanel />
      <DeleteAccountPanel user={user} />
    </div>
  )
}
