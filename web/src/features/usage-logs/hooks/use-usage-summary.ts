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
import { useQuery } from '@tanstack/react-query'

import dayjs from '@/lib/dayjs'
import { useAuthStore } from '@/stores/auth-store'

import { getUserLogSummary } from '../api'

export function useUsageSummary(days: 7 | 28) {
  const userId = useAuthStore((state) => state.auth.user?.id)
  const start = dayjs()
    .subtract(days - 1, 'day')
    .startOf('day')
  const end = dayjs().endOf('day')
  const timezoneOffset = dayjs().utcOffset()
  const query = useQuery({
    queryKey: [
      'terminal',
      'usage-summary',
      userId,
      start.unix(),
      end.unix(),
      timezoneOffset,
    ],
    queryFn: () =>
      getUserLogSummary({
        start_timestamp: start.unix(),
        end_timestamp: end.unix(),
        timezone_offset: timezoneOffset,
      }),
    staleTime: 60000,
  })
  return { ...query, start, end }
}
