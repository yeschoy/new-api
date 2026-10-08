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
import { Notice } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { errorMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth-store'
import { ConsolePage } from '@/pages/console/console-page'
import { ROLE_ADMIN, ROLE_ROOT } from '@/pages/console/console-nav'

import { useDashboardStatus } from './dashboard-api'
import type { FlowRole } from './flow/flow-data'
import { FlowView } from './flow/flow-view'
import { loadPrefs } from './usage/usage-prefs'

/** The server returns more of each request's path the higher the role. */
function flowRole(role: number): FlowRole {
  if (role >= ROLE_ROOT) return 'root'
  if (role >= ROLE_ADMIN) return 'admin'
  return 'user'
}

/** Flow (分流): how requests split across users, keys, groups, models and channels. */
export function FlowPage() {
  const { t } = useI18n()
  return (
    <ConsolePage active='flow' title={t('分流')} description={t('请求从用户、密钥和分组流向模型与渠道的路径。')}>
      <FlowContent />
    </ConsolePage>
  )
}

function FlowContent() {
  const { t } = useI18n()
  const auth = useAuth()
  const status = useDashboardStatus()
  // The default range follows the viewer's (or the operator's) defaults, so wait for the status.
  if (!status.data) {
    if (status.isError) return <Notice tone='error'>{errorMessage(status.error, t('加载失败'))}</Notice>
    return <p className='text-or-muted text-[14px]'>{t('加载中…')}</p>
  }
  const role = flowRole(auth.user?.role ?? 0)
  return (
    <>
      {status.data.enable_data_export === false ? (
        <Notice tone='info' className='mb-4'>
          {t('管理员未开启数据看板，这里不会有新的统计数据。')}
        </Notice>
      ) : null}
      {/* A new role means other columns: start over. */}
      <FlowView key={role} role={role} initialDays={loadPrefs(status.data.data_export_default_time).defaultTimeRangeDays} />
    </>
  )
}
