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
import { useSearchParams } from 'react-router'

import { Notice, Tabs } from '@/components/ui'
import { tk, useI18n } from '@/i18n/i18n'
import { errorMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth-store'
import { ConsolePage } from '@/pages/console/console-page'
import { ROLE_ADMIN } from '@/pages/console/console-nav'

import { useDashboardStatus } from './dashboard-api'
import { ModelsTab } from './usage/models-tab'
import { ReportTab } from './usage/report-tab'
import { loadPrefs } from './usage/usage-prefs'
import { UsersTab } from './usage/users-tab'

type View = 'models' | 'users' | 'report'

const VIEWS: Array<{ id: View; label: string; admin?: boolean }> = [
  { id: 'models', label: tk('按模型') },
  { id: 'users', label: tk('按用户'), admin: true },
  { id: 'report', label: tk('每日报表') },
]

/** Usage and costs: by model (all accounts for admins), by user (admins), and the own daily report. */
export function UsagePage() {
  const { t } = useI18n()
  return (
    <ConsolePage active='usage' title={t('用量与费用')} description={t('按模型、用户和日期查看调用量与费用。')}>
      <UsageViews />
    </ConsolePage>
  )
}

function UsageViews() {
  const { t } = useI18n()
  const auth = useAuth()
  const status = useDashboardStatus()
  const [params, setParams] = useSearchParams()
  const admin = (auth.user?.role ?? 0) >= ROLE_ADMIN
  const views = VIEWS.filter((item) => admin || !item.admin)
  const view = views.find((item) => item.id === params.get('view'))?.id ?? 'models'

  // The defaults follow the operator's granularity, so wait for the status.
  if (!status.data) {
    if (status.isError) return <Notice tone='error'>{errorMessage(status.error, t('加载失败'))}</Notice>
    return <p className='text-or-muted text-[14px]'>{t('加载中…')}</p>
  }
  const operatorGranularity = status.data.data_export_default_time

  return (
    <>
      <Tabs
        items={views.map((item) => ({ id: item.id, label: t(item.label) }))}
        value={view}
        onChange={(id) => setParams(id === 'models' ? {} : { view: id }, { replace: true })}
        ariaLabel={t('用量视图')}
        className='mb-5'
      />
      {view !== 'report' && status.data.enable_data_export === false ? (
        <Notice tone='info' className='mb-4'>
          {t('管理员未开启数据看板，这里不会有新的统计数据。')}
        </Notice>
      ) : null}
      {view === 'models' ? <ModelsTab admin={admin} operatorGranularity={operatorGranularity} /> : null}
      {view === 'users' ? <UsersTab initialGranularity={loadPrefs(operatorGranularity).defaultTimeGranularity} /> : null}
      {view === 'report' ? <ReportTab /> : null}
    </>
  )
}
