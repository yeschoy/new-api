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
import { ArrowDownToLine, Copy } from 'lucide-react'
import { useState } from 'react'

import { Button, Notice, Panel, toast } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { errorMessage } from '@/lib/api'
import { useAuth, type AuthUser } from '@/lib/auth-store'
import { useConsoleKey, useMoney, useSelf } from '@/pages/console/console-hooks'

import { InviteTransfer } from './invite-transfer'
import { getInviteCode } from './wallet-api'

/** /api/user/self also reports the invite figures. */
type Inviter = AuthUser & { aff_quota?: number; aff_history_quota?: number; aff_count?: number }

/**
 * "邀请奖励": the invite link, what invites have earned, and moving the
 * rewards into the balance (held while the site's payment terms are unconfirmed).
 */
export function InvitePanel(props: { complianceConfirmed: boolean }) {
  const { t } = useI18n()
  const money = useMoney()
  const auth = useAuth()
  const self = useSelf()
  const user = (self.data ?? auth.user) as Inviter | null
  const code = useQuery({ queryKey: useConsoleKey('invite-code'), queryFn: getInviteCode, retry: false })
  const [moving, setMoving] = useState(false)
  const link = code.data ? `${window.location.origin}/sign-up?aff=${code.data}` : ''
  const rewards = user?.aff_quota ?? 0

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      toast.success(t('已复制'))
    } catch {
      toast.error(t('复制失败'))
    }
  }

  return (
    <Panel title={t('邀请奖励')}>
      <div className='flex flex-col gap-4'>
        <p className='text-or-muted text-[13px]'>{t('好友通过你的链接注册后，你会获得奖励，奖励可以随时转入余额。')}</p>
        <dl className='grid grid-cols-3 gap-3'>
          <Stat label={t('待转入')} value={money.format(rewards)} />
          <Stat label={t('累计奖励')} value={money.format(user?.aff_history_quota ?? 0)} />
          <Stat label={t('邀请人数')} value={(user?.aff_count ?? 0).toLocaleString('zh-CN')} />
        </dl>
        {code.isError ? (
          <Notice tone='error'>{errorMessage(code.error, t('获取邀请码失败'))}</Notice>
        ) : (
          <div className='flex flex-col gap-2 sm:flex-row'>
            <input
              readOnly
              value={link}
              placeholder={t('加载中…')}
              aria-label={t('邀请链接')}
              onFocus={(event) => event.currentTarget.select()}
              className='border-or-line bg-or-bg text-or-fg placeholder:text-or-dim font-geist h-9 w-full min-w-0 rounded-[6px] border px-3 text-[13px] outline-none'
            />
            <div className='flex gap-2'>
              <Button onClick={copy} disabled={!link} className='flex-1 sm:flex-none'>
                <Copy className='size-4' aria-hidden='true' />
                {t('复制链接')}
              </Button>
              {rewards > 0 ? (
                <Button variant='primary' disabled={!props.complianceConfirmed} onClick={() => setMoving(true)} className='flex-1 sm:flex-none'>
                  <ArrowDownToLine className='size-4' aria-hidden='true' />
                  {t('转入余额')}
                </Button>
              ) : null}
            </div>
          </div>
        )}
        {!props.complianceConfirmed && rewards > 0 ? (
          <p className='text-or-muted text-[12px]'>{t('管理员确认合规条款前，邀请奖励暂不能转入余额。')}</p>
        ) : null}
      </div>
      {moving ? <InviteTransfer available={rewards} onClose={() => setMoving(false)} /> : null}
    </Panel>
  )
}

function Stat(props: { label: string; value: string }) {
  return (
    <div className='min-w-0'>
      <dt className='text-or-muted truncate text-[13px]'>{props.label}</dt>
      <dd className='mt-1 truncate text-[18px] font-semibold tabular-nums'>{props.value}</dd>
    </div>
  )
}
