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
import { useId, useState } from 'react'

import { Button, Field, Modal, Select } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'

import { GRANULARITIES, RANGE_DAYS, isGranularity, rangeLabel } from '../dashboard-time'
import { CALLS_CHARTS, SPEND_CHARTS, type CallsChartKind, type SpendChartKind, type UsagePrefs } from './usage-prefs'

/** The range, granularity and charts the page opens with, kept in this browser. */
export function PrefsDialog(props: { prefs: UsagePrefs; onSave: (prefs: UsagePrefs) => void; onClose: () => void }) {
  const { t } = useI18n()
  const [draft, setDraft] = useState(props.prefs)
  const ids = { range: useId(), granularity: useId(), spend: useId(), calls: useId() }

  return (
    <Modal
      title={t('默认设置')}
      onClose={props.onClose}
      footer={
        <>
          <Button onClick={props.onClose}>{t('取消')}</Button>
          <Button variant='primary' onClick={() => props.onSave(draft)}>
            {t('保存')}
          </Button>
        </>
      }
    >
      <p className='text-or-muted mb-4 text-[13px]'>{t('打开这个页面时使用的时间范围和图表，只保存在当前浏览器。')}</p>
      <div className='grid gap-4'>
        <Field label={t('默认时间范围')} htmlFor={ids.range}>
          <Select
            id={ids.range}
            value={String(draft.defaultTimeRangeDays)}
            onChange={(value) => setDraft({ ...draft, defaultTimeRangeDays: Number(value) })}
            options={RANGE_DAYS.map((days) => ({ value: String(days), label: rangeLabel(days) }))}
          />
        </Field>
        <Field label={t('默认时间粒度')} htmlFor={ids.granularity}>
          <Select
            id={ids.granularity}
            value={draft.defaultTimeGranularity}
            onChange={(value) => {
              if (isGranularity(value)) setDraft({ ...draft, defaultTimeGranularity: value })
            }}
            options={GRANULARITIES.map((item) => ({ value: item.id, label: t(item.label) }))}
          />
        </Field>
        <Field label={t('默认消费图表')} htmlFor={ids.spend}>
          <Select
            id={ids.spend}
            value={draft.consumptionDistributionChart}
            onChange={(value) => setDraft({ ...draft, consumptionDistributionChart: value as SpendChartKind })}
            options={SPEND_CHARTS.map((item) => ({ value: item.id, label: t(item.label) }))}
          />
        </Field>
        <Field label={t('默认调用图表')} htmlFor={ids.calls}>
          <Select
            id={ids.calls}
            value={draft.modelAnalyticsChart}
            onChange={(value) => setDraft({ ...draft, modelAnalyticsChart: value as CallsChartKind })}
            options={CALLS_CHARTS.map((item) => ({ value: item.id, label: t(item.label) }))}
          />
        </Field>
      </div>
    </Modal>
  )
}
