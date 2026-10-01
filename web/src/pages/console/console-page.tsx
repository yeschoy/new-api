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
import { RequireAuth } from '@/components/require-auth'
import { useI18n } from '@/i18n/i18n'
import { useAuth } from '@/lib/auth-store'

import { ConsoleLayout, type ConsoleSection } from './console-layout'
import { Notice } from './console-ui'

type ConsolePageProps = {
  active: ConsoleSection
  title: string
  description?: React.ReactNode
  actions?: React.ReactNode
  /** Lowest role that may open the page (ROLE_ADMIN, ROLE_ROOT); anyone signed in when left out. */
  role?: number
  children: React.ReactNode
}

function Guarded(props: ConsolePageProps) {
  const { t } = useI18n()
  const auth = useAuth()
  if (props.role && (auth.user?.role ?? 0) < props.role) {
    return (
      <ConsoleLayout active={props.active} title={props.title}>
        <Notice tone='error'>{t('你没有打开这个页面的权限。')}</Notice>
      </ConsoleLayout>
    )
  }
  return (
    <ConsoleLayout active={props.active} title={props.title} description={props.description} actions={props.actions}>
      {props.children}
    </ConsoleLayout>
  )
}

/** A console page: sign-in notice for visitors, a permission notice below the required role, else the console frame. */
export function ConsolePage(props: ConsolePageProps) {
  return (
    <RequireAuth framed>
      <Guarded {...props} />
    </RequireAuth>
  )
}
