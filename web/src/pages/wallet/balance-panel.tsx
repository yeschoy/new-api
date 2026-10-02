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
import { useAuth } from '@/lib/auth-store'
import { useMoney, useSelf } from '@/pages/console/console-hooks'

/** Balance, lifetime spending and request count. */
export function BalancePanel() {
  const { t } = useI18n()
  const money = useMoney()
  const auth = useAuth()
  const self = useSelf()
  const user = self.data ?? auth.user

  return (
    <Panel>
      <div className='flex flex-wrap items-end justify-between gap-6'>
        <div>
          <div className='text-or-muted text-[13px]'>{t('可用余额')}</div>
          <div className='mt-1 text-[40px] leading-[48px] font-semibold tracking-[-0.02em] tabular-nums'>
            {user ? money.format(user.quota) : '—'}
          </div>
        </div>
        <dl className='flex gap-10'>
          <Stat label={t('已用额度')} value={user ? money.format(user.used_quota) : '—'} />
          <Stat label={t('请求次数')} value={user ? (user.request_count ?? 0).toLocaleString('zh-CN') : '—'} />
        </dl>
      </div>
    </Panel>
  )
}

function Stat(props: { label: string; value: string }) {
  return (
    <div>
      <dt className='text-or-muted text-[13px]'>{props.label}</dt>
      <dd className='mt-1 text-[18px] font-semibold tabular-nums'>{props.value}</dd>
    </div>
  )
}
