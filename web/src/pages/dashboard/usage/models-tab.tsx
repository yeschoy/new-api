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
import { Settings2 } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Button, Notice, toast } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { errorMessage } from '@/lib/api'
import { useConsoleKey } from '@/pages/console/console-hooks'

import { getQuotaRows } from '../dashboard-api'
import { granularityFor } from '../dashboard-time'
import { PerfHealth } from '../perf-health'
import { RangeFilter, presetRange, type RangeState } from '../range-filter'
import { CallsChart } from './calls-chart'
import { PrefsDialog } from './prefs-dialog'
import { SpendChart } from './spend-chart'
import { breakdown, totalsOf } from './usage-data'
import { loadPrefs, savePrefs, type UsagePrefs } from './usage-prefs'
import { UsageStats } from './usage-stats'

/**
 * Usage and spend by model over a chosen range: admins see every account
 * (or one username), everyone else their own.
 */
export function ModelsTab(props: { admin: boolean; operatorGranularity?: string }) {
  const { t, lang } = useI18n()
  const [prefs, setPrefs] = useState(() => loadPrefs(props.operatorGranularity))
  const [range, setRange] = useState<RangeState>(() => presetRange(prefs.defaultTimeRangeDays))
  const [granularity, setGranularity] = useState(prefs.defaultTimeGranularity)
  const [username, setUsername] = useState('')
  const [spendKind, setSpendKind] = useState(prefs.consumptionDistributionChart)
  const [callsKind, setCallsKind] = useState(prefs.modelAnalyticsChart)
  const [editing, setEditing] = useState(false)
  const [resets, setResets] = useState(0)

  const rows = useQuery({
    queryKey: useConsoleKey('dashboard', 'usage', props.admin ? 'all' : 'self', range.window.start, range.window.end, username),
    queryFn: () => getQuotaRows(range.window, { admin: props.admin, username }),
    placeholderData: keepPreviousData,
  })
  // A refused range shows its message, not the figures of the range before it.
  const current = rows.isError ? undefined : rows.data
  // lang: unnamed models are labelled in the page language.
  const data = useMemo(
    () => breakdown(current ?? [], range.window, granularity, (row) => row.model_name || t('未知')),
    [current, range.window, granularity, t, lang]
  )
  const totals = useMemo(() => (current ? totalsOf(current) : null), [current])
  const minutes = Math.max(1, (range.window.end - range.window.start) / 60)

  const pickRange = (next: RangeState) => {
    setRange(next)
    if (next.days !== null) setGranularity(granularityFor(next.days))
  }

  const saveDefaults = (next: UsagePrefs) => {
    savePrefs(next)
    setPrefs(next)
    setRange(presetRange(next.defaultTimeRangeDays))
    setGranularity(next.defaultTimeGranularity)
    setUsername('')
    setSpendKind(next.consumptionDistributionChart)
    setCallsKind(next.modelAnalyticsChart)
    setResets(resets + 1)
    setEditing(false)
    toast.success(t('已保存默认设置'))
  }

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <RangeFilter
          key={resets}
          range={range}
          onRange={pickRange}
          granularity={granularity}
          onGranularity={setGranularity}
          username={username}
          onUsername={props.admin ? setUsername : undefined}
        />
        <Button onClick={() => setEditing(true)}>
          <Settings2 className='size-4' aria-hidden='true' />
          {t('默认设置')}
        </Button>
      </div>
      {rows.isError ? <Notice tone='error'>{errorMessage(rows.error, t('用量数据加载失败'))}</Notice> : null}
      <UsageStats totals={totals} minutes={minutes} />
      {props.admin ? <PerfHealth /> : null}
      <SpendChart data={data} granularity={granularity} kind={spendKind} onKind={setSpendKind} total={totals?.quota ?? 0} />
      <CallsChart data={data} granularity={granularity} kind={callsKind} onKind={setCallsKind} total={totals?.requests ?? 0} />
      {editing ? <PrefsDialog prefs={prefs} onSave={saveDefaults} onClose={() => setEditing(false)} /> : null}
    </div>
  )
}
