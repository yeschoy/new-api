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
import { useQueryClient } from '@tanstack/react-query'
import { LogOut } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'

import { Button, Panel } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { useAuth } from '@/lib/auth-store'
import { logout } from '@/lib/services'
import type { AccountUser } from '@/pages/account/account-api'
import { CheckinPanel } from '@/pages/account/checkin-panel'
import { DisplayNameEditor } from '@/pages/account/display-name-editor'
import { EmailBindModal } from '@/pages/account/email-bind-modal'
import { LanguagePanel } from '@/pages/account/language-panel'
import { NotificationPanel } from '@/pages/account/notification-panel'
import { ProfileOverview } from '@/pages/account/profile-overview'
import { SidebarPanel } from '@/pages/account/sidebar-panel'
import { useAuthStatus } from '@/pages/auth/auth-status'

import { roleLabel } from './console-helpers'
import { useSelf } from './console-hooks'
import { ConsolePage } from './console-page'

/** /settings/profile: who you are, your email, check-in, language, notifications, menu and sign-out. */
export function ProfilePage() {
  const { t } = useI18n()
  return (
    <ConsolePage active='profile' title={t('账户设置')} description={t('管理账户资料、通知与偏好设置。')}>
      <ProfileContent />
    </ConsolePage>
  )
}

function ProfileContent() {
  const auth = useAuth()
  const self = useSelf()
  const status = useAuthStatus()
  const user = (self.data ?? auth.user) as AccountUser | null
  // The settings panels start from the saved settings, so they wait for the fresh profile.
  const loaded = self.data as AccountUser | undefined

  return (
    <div className='flex flex-col gap-4'>
      <ProfileOverview user={user} />
      <BasicInfo user={user} />
      {status?.checkin_enabled ? <CheckinPanel /> : null}
      <LanguagePanel user={user} />
      {loaded ? <NotificationPanel key={loaded.setting ?? ''} user={loaded} /> : null}
      {loaded && loaded.permissions?.sidebar_settings !== false ? <SidebarPanel key={loaded.sidebar_modules ?? ''} user={loaded} /> : null}
      <SignOutPanel />
    </div>
  )
}

function BasicInfo(props: { user: AccountUser | null }) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [binding, setBinding] = useState(false)
  const user = props.user
  const email = user?.email ?? ''

  const rows: Array<[string, React.ReactNode]> = [
    [t('用户 ID'), user ? String(user.id) : '—'],
    [t('用户名'), user?.username || '—'],
    [t('显示名称'), <DisplayNameEditor value={user?.display_name ?? ''} />],
    [
      t('邮箱'),
      <div className='flex flex-wrap items-center gap-2'>
        {email ? <span>{email}</span> : <span className='text-or-muted'>{t('未绑定')}</span>}
        <Button size='sm' variant='ghost' onClick={() => setBinding(true)}>
          {email ? t('更换邮箱') : t('绑定邮箱')}
        </Button>
      </div>,
    ],
    [t('分组'), user?.group || 'default'],
    [t('角色'), roleLabel(user?.role)],
  ]

  return (
    <Panel title={t('基本信息')} flush>
      <dl>
        {rows.map(([label, value]) => (
          <div
            key={label}
            className='border-or-line flex flex-col gap-1 border-t px-5 py-3.5 first:border-t-0 sm:flex-row sm:items-center sm:gap-6'
          >
            <dt className='text-or-muted w-[120px] shrink-0 text-[14px]'>{label}</dt>
            <dd className='min-w-0 flex-1 text-[14px] break-all'>{value}</dd>
          </div>
        ))}
      </dl>
      {binding ? (
        <EmailBindModal current={email} onBound={() => void queryClient.invalidateQueries({ queryKey: ['console'] })} onClose={() => setBinding(false)} />
      ) : null}
    </Panel>
  )
}

function SignOutPanel() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [signingOut, setSigningOut] = useState(false)

  async function signOut() {
    setSigningOut(true)
    await logout().catch(() => undefined)
    queryClient.removeQueries({ queryKey: ['console'] })
    navigate('/')
  }

  return (
    <Panel title={t('退出登录')}>
      <div className='flex flex-wrap items-center justify-between gap-4'>
        <p className='text-or-muted text-[14px]'>{t('退出当前浏览器中的登录状态，API 密钥不受影响。')}</p>
        <Button busy={signingOut} onClick={signOut}>
          <LogOut className='size-4' aria-hidden='true' />
          {t('退出登录')}
        </Button>
      </div>
    </Panel>
  )
}
