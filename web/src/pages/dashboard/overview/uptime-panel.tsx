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
import { RotateCw } from 'lucide-react'

import { Button } from '@/components/ui'
import { tk, useI18n } from '@/i18n/i18n'
import { errorMessage } from '@/lib/api'
import { cn } from '@/lib/format'

import { getUptime, type UptimeMonitor } from '../dashboard-api'
import { EmptyNote, Section, StatusDot, type DotTone } from '../dashboard-ui'

// Uptime Kuma heartbeat states.
const MONITOR_STATES: Record<number, { label: string; tone: DotTone }> = {
  1: { label: tk('正常'), tone: 'good' },
  0: { label: tk('异常'), tone: 'bad' },
  2: { label: tk('等待中'), tone: 'warn' },
  3: { label: tk('维护中'), tone: 'info' },
}

/** Monitor groups from the operator's Uptime Kuma status pages, with a manual refresh. */
export function UptimePanel() {
  const { t } = useI18n()
  const uptime = useQuery({ queryKey: ['dashboard', 'uptime'], queryFn: getUptime, staleTime: 60_000, retry: false })
  const groups = uptime.data ?? []

  const refresh = (
    <Button size='sm' variant='ghost' onClick={() => void uptime.refetch()} disabled={uptime.isFetching} ariaLabel={t('刷新')} title={t('刷新')}>
      <RotateCw className={cn('size-3.5', uptime.isFetching && 'animate-spin')} aria-hidden='true' />
    </Button>
  )

  let body: React.ReactNode = null
  if (uptime.isLoading) body = <EmptyNote>{t('加载中…')}</EmptyNote>
  else if (uptime.isError) body = <EmptyNote className='text-or-red'>{errorMessage(uptime.error, t('服务状态加载失败'))}</EmptyNote>
  else if (groups.length === 0) body = <EmptyNote>{t('暂无监控')}</EmptyNote>

  return (
    <Section title={t('服务状态')} description={t('来自 Uptime Kuma 的监控状态')} extra={refresh} flush>
      {body}
      <div className='max-h-[320px] overflow-y-auto'>
        {groups.map((group, index) => (
          <div key={`${group.categoryName}-${index}`}>
            <div className='bg-or-fill border-or-line flex items-center gap-2 border-b px-5 py-2'>
              <h3 className='text-or-muted text-[12px] font-semibold'>{group.categoryName}</h3>
              <span className='text-or-dim text-[12px] tabular-nums'>{group.monitors?.length ?? 0}</span>
            </div>
            <ul>
              {(group.monitors ?? []).map((monitor, monitorIndex) => (
                <MonitorRow key={`${monitor.name}-${monitorIndex}`} monitor={monitor} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  )
}

function MonitorRow(props: { monitor: UptimeMonitor }) {
  const { t } = useI18n()
  const monitor = props.monitor
  const state = MONITOR_STATES[monitor.status] ?? { label: tk('未知'), tone: 'neutral' as const }
  return (
    <li className='border-or-line flex items-center justify-between gap-3 border-b px-5 py-2.5 last:border-b-0'>
      <span className='flex min-w-0 items-center gap-2.5'>
        <StatusDot tone={state.tone} />
        <span className='sr-only'>{t(state.label)}</span>
        <span className='truncate text-[14px]'>{monitor.name}</span>
        {monitor.group ? <span className='text-or-dim shrink-0 text-[12px]'>{monitor.group}</span> : null}
      </span>
      <span className='shrink-0 text-[14px] font-semibold tabular-nums'>{`${((monitor.uptime ?? 0) * 100).toFixed(2)}%`}</span>
    </li>
  )
}
