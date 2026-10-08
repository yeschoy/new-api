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
import { useMoney } from '@/pages/console/console-hooks'

import { StatTile, formatCount, formatRate } from '../dashboard-ui'
import type { Totals } from './usage-data'

/** Requests, spend and tokens of the range, and their average per minute. */
export function UsageStats(props: { totals: Totals | null; minutes: number }) {
  const { t } = useI18n()
  const money = useMoney()
  const totals = props.totals
  const show = (text: (value: Totals) => string) => (totals ? text(totals) : '—')
  return (
    <div className='grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5'>
      <StatTile label={t('请求数')} value={show((value) => formatCount(value.requests))} />
      <StatTile label={t('消费')} value={show((value) => money.format(value.quota))} />
      <StatTile label={t('Token 用量')} value={show((value) => formatCount(value.tokens))} />
      <StatTile label={t('平均 RPM')} value={show((value) => formatRate(value.requests / props.minutes))} caption={t('每分钟请求数')} />
      <StatTile label={t('平均 TPM')} value={show((value) => formatRate(value.tokens / props.minutes))} caption={t('每分钟 Token 数')} />
    </div>
  )
}
