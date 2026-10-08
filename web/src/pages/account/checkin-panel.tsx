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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'

import { Button, Modal, Panel, Tag, toast } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { errorMessage } from '@/lib/api'
import { useTurnstile } from '@/pages/auth/turnstile'
import { useConsoleKey, useMoney } from '@/pages/console/console-hooks'

import { CheckinCalendar, localDay } from './checkin-calendar'
import { checkIn, getCheckin } from './profile-api'

/** Daily check-in for a random reward (status.checkin_enabled). */
export function CheckinPanel() {
  const { t } = useI18n()
  const money = useMoney()
  const queryClient = useQueryClient()
  const turnstile = useTurnstile()
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [verifying, setVerifying] = useState(false)
  const monthKey = localDay(month).slice(0, 7)
  const checkin = useQuery({ queryKey: useConsoleKey('checkin', monthKey), queryFn: () => getCheckin(monthKey) })

  const doCheckIn = useMutation({
    mutationFn: checkIn,
    onSuccess: async (data) => {
      toast.success(t('签到成功，获得 {amount}', { amount: money.format(data.quota_awarded) }))
      await queryClient.invalidateQueries({ queryKey: ['console'] })
    },
    onError: (err) => toast.error(errorMessage(err, t('签到失败'))),
  })

  // With the human check on, the check-in waits for its token.
  const token = turnstile.token
  const resetCheck = turnstile.reset
  const mutate = doCheckIn.mutate
  useEffect(() => {
    if (!verifying || !token) return
    setVerifying(false)
    mutate(token)
    resetCheck()
  }, [verifying, token, mutate, resetCheck])

  const records = checkin.data?.stats.records
  const format = money.format
  const awards = useMemo(() => new Map((records ?? []).map((record) => [record.checkin_date, format(record.quota_awarded)])), [records, format])
  const monthTotal = (records ?? []).reduce((sum, record) => sum + record.quota_awarded, 0)
  const stats = checkin.data?.stats
  const done = Boolean(stats?.checked_in_today)

  function onCheckIn() {
    if (turnstile.widget) return setVerifying(true)
    doCheckIn.mutate('')
  }

  const summary: Array<[string, string]> = [
    [t('累计签到'), String(stats?.total_checkins ?? 0)],
    [t('本月获得'), money.format(monthTotal)],
    [t('累计获得'), money.format(stats?.total_quota ?? 0)],
  ]

  return (
    <Panel
      title={
        <span className='flex items-center gap-2'>
          {t('每日签到')}
          {done ? <Tag tone='success'>{t('今日已签到')}</Tag> : null}
        </span>
      }
    >
      <div className='flex flex-col gap-5'>
        <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
          <p className='text-or-muted text-[14px]'>
            {checkin.data
              ? t('每天签到可随机获得 {min} – {max}，直接计入余额。', { min: money.format(checkin.data.min_quota), max: money.format(checkin.data.max_quota) })
              : t('加载中…')}
          </p>
          <Button variant='primary' busy={doCheckIn.isPending} disabled={!checkin.data || done} onClick={onCheckIn}>
            {done ? t('今日已签到') : t('立即签到')}
          </Button>
        </div>
        <dl className='border-or-line grid grid-cols-3 gap-4 border-y py-4'>
          {summary.map(([label, value]) => (
            <div key={label}>
              <dt className='text-or-muted text-[13px]'>{label}</dt>
              <dd className='mt-1 text-[18px] font-semibold tabular-nums'>{value}</dd>
            </div>
          ))}
        </dl>
        <CheckinCalendar month={month} awards={awards} onMonth={setMonth} />
        <p className='text-or-dim text-[12px]'>{t('每天只能签到一次，奖励直接计入余额。')}</p>
      </div>
      {verifying ? (
        <Modal title={t('安全验证')} onClose={() => setVerifying(false)}>
          <div className='flex flex-col gap-4'>
            <p className='text-or-muted text-[14px]'>{t('请先完成人机验证，验证通过后会自动签到。')}</p>
            {turnstile.widget}
          </div>
        </Modal>
      ) : null}
    </Panel>
  )
}
