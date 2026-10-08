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
import { Panel } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { useMoney } from '@/pages/console/console-hooks'

import type { AccountUser } from './account-api'

/** Who is signed in, with the balance, total use and request count (the old profile header). */
export function ProfileOverview(props: { user: AccountUser | null }) {
  const { t } = useI18n()
  const money = useMoney()
  const user = props.user
  if (!user) return null
  const name = user.display_name || user.username
  const stats: Array<[string, string]> = [
    [t('余额'), money.format(user.quota)],
    [t('已用额度'), money.format(user.used_quota)],
    [t('请求次数'), (user.request_count ?? 0).toLocaleString()],
  ]
  return (
    <Panel>
      <div className='flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between'>
        <div className='flex min-w-0 items-center gap-4'>
          <span
            aria-hidden='true'
            className='bg-or-primary text-or-bg flex size-14 shrink-0 items-center justify-center rounded-full text-[22px] font-semibold'
          >
            {name.charAt(0).toUpperCase()}
          </span>
          <div className='min-w-0'>
            <div className='truncate text-[20px] leading-7 font-semibold'>{name}</div>
            <div className='text-or-muted truncate text-[14px]'>{`@${user.username} · ID ${user.id}`}</div>
          </div>
        </div>
        <dl className='grid grid-cols-3 gap-4 sm:flex sm:gap-10'>
          {stats.map(([label, value]) => (
            <div key={label} className='min-w-0'>
              <dt className='text-or-muted text-[13px]'>{label}</dt>
              <dd className='mt-1 truncate text-[18px] font-semibold tabular-nums'>{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Panel>
  )
}
