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
import { ConsolePage } from '@/pages/console/console-page'
import { ROLE_ADMIN } from '@/pages/console/console-nav'

import { useDashboardStatus } from './dashboard-api'
import { AccountOverview } from './overview/account-overview'
import { AnnouncementsPanel } from './overview/announcements-panel'
import { ApiInfoPanel } from './overview/api-info-panel'
import { FaqPanel } from './overview/faq-panel'
import { GetStarted, QuickConnect } from './overview/get-started'
import { UptimePanel } from './overview/uptime-panel'
import { PerfHealth } from './perf-health'

/** Console home: balance and recent usage, first steps, the operator's notices and service status. */
export function OverviewPage() {
  const { t } = useI18n()
  return (
    <ConsolePage active='dashboard' title={t('概览')} description={t('余额、用量、公告与服务状态一览。')}>
      <OverviewContent />
    </ConsolePage>
  )
}

function OverviewContent() {
  const auth = useAuth()
  const { data: status } = useDashboardStatus()
  const admin = (auth.user?.role ?? 0) >= ROLE_ADMIN
  // Panels follow the operator's switches; until the status arrives none is shown.
  const shown = (enabled: boolean | undefined) => Boolean(status) && enabled !== false

  return (
    <div className='flex flex-col gap-4'>
      <GetStarted />
      <AccountOverview />
      <QuickConnect />
      {admin ? <PerfHealth /> : null}
      <div className='grid gap-4 lg:grid-cols-2'>
        {shown(status?.announcements_enabled) ? <AnnouncementsPanel items={status?.announcements ?? []} /> : null}
        {shown(status?.api_info_enabled) ? <ApiInfoPanel items={status?.api_info ?? []} /> : null}
        {shown(status?.faq_enabled) ? <FaqPanel items={status?.faq ?? []} /> : null}
        {shown(status?.uptime_kuma_enabled) ? <UptimePanel /> : null}
      </div>
    </div>
  )
}
