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

import { Modal, Notice } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { errorMessage } from '@/lib/api'
import { useConsoleKey, useMoney } from '@/pages/console/console-hooks'

import { getLogUser } from './logs-api'

function Item(props: { label: string; value: React.ReactNode; wide?: boolean }) {
  return (
    <div className={props.wide ? 'col-span-2' : undefined}>
      <dt className='text-or-muted text-[12px]'>{props.label}</dt>
      <dd className='mt-1 text-[14px] font-semibold break-words'>{props.value}</dd>
    </div>
  )
}

/** An admin's look at the user behind a log row: balance, usage and invitations. */
export function UserInfoDialog(props: { userId: number; onClose: () => void }) {
  const { t } = useI18n()
  const money = useMoney()
  const user = useQuery({
    queryKey: useConsoleKey('log-user', props.userId),
    queryFn: () => getLogUser(props.userId),
    retry: false,
  })
  const info = user.data

  return (
    <Modal title={t('用户信息')} onClose={props.onClose}>
      {user.isLoading ? <p className='text-or-muted py-6 text-center text-[14px]'>{t('加载中…')}</p> : null}
      {user.isError ? <Notice tone='error'>{errorMessage(user.error, t('获取用户信息失败'))}</Notice> : null}
      {info ? (
        <dl className='grid grid-cols-2 gap-4'>
          <Item label={t('用户名')} value={info.username} />
          {info.display_name ? <Item label={t('显示名称')} value={info.display_name} /> : null}
          <Item label={t('余额')} value={money.format(info.quota)} />
          <Item label={t('已用额度')} value={money.format(info.used_quota)} />
          <Item label={t('请求次数')} value={(info.request_count ?? 0).toLocaleString('en-US')} />
          {info.group ? <Item label={t('用户分组')} value={info.group} /> : null}
          {info.aff_code ? <Item label={t('邀请码')} value={info.aff_code} /> : null}
          {info.aff_count !== undefined ? <Item label={t('邀请人数')} value={info.aff_count.toLocaleString('en-US')} /> : null}
          {info.aff_quota ? <Item label={t('邀请收益')} value={money.format(info.aff_quota)} /> : null}
          {info.remark ? <Item label={t('备注')} value={info.remark} wide /> : null}
        </dl>
      ) : null}
    </Modal>
  )
}
