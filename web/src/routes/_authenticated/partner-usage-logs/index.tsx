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
import { createFileRoute, redirect } from '@tanstack/react-router'

import { PartnerUsageLogs } from '@/features/partner-usage-logs'
import { partnerUsageLogsSearchSchema } from '@/features/partner-usage-logs/lib/filters'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

function PartnerUsageLogsRoute() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <PartnerUsageLogs
      search={search}
      onSearchChange={(next) => void navigate({ search: next })}
    />
  )
}

export const Route = createFileRoute('/_authenticated/partner-usage-logs/')({
  beforeLoad: () => {
    const { auth } = useAuthStore.getState()

    // Ordinary administrators and root may read; everyone else is refused.
    // The backend enforces the same boundary independently.
    if (!auth.user || auth.user.role < ROLE.ADMIN) {
      throw redirect({
        to: '/403',
      })
    }
  },
  validateSearch: partnerUsageLogsSearchSchema,
  component: PartnerUsageLogsRoute,
})
