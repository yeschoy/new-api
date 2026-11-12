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
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { PartnerPurchasePage } from '@/features/partner-purchase'
import {
  preparePurchaseEntry,
  SESSION_PATTERN,
} from '@/features/partner-purchase/lib/access'

export const Route = createFileRoute('/partner/purchase')({
  validateSearch: z.object({
    session_id: z.string().regex(SESSION_PATTERN).catch(''),
  }),
  beforeLoad: () => {
    preparePurchaseEntry()
  },
  component: PurchaseRoute,
})

function PurchaseRoute() {
  const search = Route.useSearch()
  return (
    <PartnerPurchasePage
      key={search.session_id}
      sessionId={search.session_id}
    />
  )
}
