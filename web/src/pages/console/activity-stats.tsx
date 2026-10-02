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
import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { useI18n } from '@/i18n/i18n'
import { StatChip } from '@/pages/logs/log-filter-bar'
import { MASK } from '@/pages/logs/log-format'
import type { LogScope } from '@/pages/logs/log-types'
import { getLogStats, type LogQuery } from '@/pages/logs/logs-api'

import { useMoney } from './console-hooks'

/** Spend, requests and tokens per minute of the logs the filters select. */
export function ActivityStats(props: { scope: LogScope; query: LogQuery; queryKey: unknown[]; masked: boolean }) {
  const { t } = useI18n()
  const money = useMoney()
  const stats = useQuery({
    queryKey: [...props.queryKey, 'stat', props.query],
    queryFn: () => getLogStats(props.scope, props.query),
    placeholderData: keepPreviousData,
    retry: false,
  })
  const data = stats.data
  const spend = data ? money.format(data.quota) : '—'

  return (
    <>
      <StatChip label={t('用量')} value={props.masked ? MASK : spend} />
      <StatChip label='RPM' value={data ? data.rpm.toLocaleString('en-US') : '—'} />
      <StatChip label='TPM' value={data ? data.tpm.toLocaleString('en-US') : '—'} />
    </>
  )
}
