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
import { useMemo } from 'react'

import { useStatus } from '@/lib/queries'

export type GuideAddress = {
  /** e.g. https://api.example.com */
  host: string
  /** e.g. https://api.example.com/v1 */
  baseUrl: string
  /** e.g. https://api.example.com/v1/chat/completions */
  fullUrl: string
}

/** This site's API address, as the administrator set it (else the page's own origin); the guides never hard-code a domain. */
export function useGuideAddress(): GuideAddress {
  const { data: status } = useStatus()
  const raw = status?.server_address || window.location.origin
  return useMemo(() => {
    const host = raw.replace(/\/+$/, '')
    return { host, baseUrl: `${host}/v1`, fullUrl: `${host}/v1/chat/completions` }
  }, [raw])
}
