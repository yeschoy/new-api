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
import { Headphones, Settings2 } from 'lucide-react'

import { Tag, type TagTone } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { useMoney } from '@/pages/console/console-hooks'

import { overrideActionLabel, parseOverrideLine } from './log-audit'
import { billingPathLabel } from './log-billing'
import { LOG_TYPE } from './log-format'
import type { LogEntry, LogOther } from './log-types'
import { useLogsView } from './logs-context'
import { DetailRow, DetailSection } from './logs-ui'

type SectionProps = { log: LogEntry; other: LogOther | null }

function effortTone(effort: string): TagTone {
  const value = effort.trim().toLowerCase()
  if (['max', 'xhigh', 'high'].includes(value)) return 'warning'
  if (['low', 'minimal', 'medium'].includes(value)) return 'success'
  return 'neutral'
}

/** Audio tokens, reasoning effort, prompt overrides, model mapping, stream status, subscription and parameter overrides. */
export function ExtraSections(props: SectionProps) {
  const { t } = useI18n()
  const view = useLogsView()
  const other = props.other
  if (!other) return null
  const audio: Array<[string, number | undefined]> = [
    [t('音频输入'), other.audio_input],
    [t('音频输出'), other.audio_output],
    [t('文字输入'), other.text_input],
    [t('文字输出'), other.text_output],
  ]
  const showPath = view.admin && props.log.type !== LOG_TYPE.CONSUME && props.log.type !== LOG_TYPE.REFUND && other.admin_info

  return (
    <>
      {other.ws || other.audio ? (
        <DetailSection title={t('音频 Token')} icon={<Headphones className='size-3.5' aria-hidden='true' />}>
          {audio.map(([label, value]) =>
            value ? (
              <DetailRow key={label} label={label} mono>
                {value.toLocaleString('en-US')}
              </DetailRow>
            ) : null
          )}
        </DetailSection>
      ) : null}
      {other.reasoning_effort || other.is_system_prompt_overwritten || showPath ? (
        <div>
          {other.reasoning_effort ? (
            <DetailRow label={t('推理强度')}>
              <Tag tone={effortTone(other.reasoning_effort)}>{other.reasoning_effort}</Tag>
            </DetailRow>
          ) : null}
          {other.is_system_prompt_overwritten ? (
            <DetailRow label={t('系统提示词')}>
              <Tag tone='warning'>{t('已覆盖')}</Tag>
            </DetailRow>
          ) : null}
          {showPath ? <DetailRow label={t('计费路径')}>{billingPathLabel(other.admin_info)}</DetailRow> : null}
        </div>
      ) : null}
      {other.is_model_mapped && other.upstream_model_name ? (
        <DetailSection title={t('模型映射')}>
          <DetailRow label={t('请求模型')} mono>{props.log.model_name}</DetailRow>
          <DetailRow label={t('实际模型')} mono>{other.upstream_model_name}</DetailRow>
        </DetailSection>
      ) : null}
      <StreamSection other={other} />
      <SubscriptionSection other={other} />
      <OverrideSection other={other} />
    </>
  )
}

/** A stream that did not end cleanly: why, and the errors it collected. */
function StreamSection(props: { other: LogOther }) {
  const { t } = useI18n()
  const stream = props.other.stream_status
  if (!stream || stream.status === 'ok') return null
  return (
    <DetailSection title={t('流状态')} danger>
      <DetailRow label={t('状态')}>
        <Tag tone='danger'>{stream.status || t('错误')}</Tag>
      </DetailRow>
      {stream.end_reason ? <DetailRow label={t('结束原因')}>{stream.end_reason}</DetailRow> : null}
      {stream.error_count ? <DetailRow label={t('软错误')}>{String(stream.error_count)}</DetailRow> : null}
      {stream.end_error ? <DetailRow label={t('结束错误')}>{stream.end_error}</DetailRow> : null}
      {stream.errors?.length ? (
        <pre className='font-geist border-or-line bg-or-bg my-1.5 max-h-32 overflow-y-auto rounded-[4px] border p-2 text-[11px] leading-relaxed break-words whitespace-pre-wrap'>
          {stream.errors.join('\n')}
        </pre>
      ) : null}
    </DetailSection>
  )
}

/** A request paid from a subscription: the plan and what it took from the allowance. */
function SubscriptionSection(props: { other: LogOther }) {
  const { t } = useI18n()
  const money = useMoney()
  const other = props.other
  if (other.billing_source !== 'subscription') return null
  const total = other.subscription_total != null ? ` / ${money.format(other.subscription_total)}` : ''
  return (
    <DetailSection title={t('订阅计费')}>
      {other.subscription_plan_id ? (
        <DetailRow label={t('套餐')}>{`#${other.subscription_plan_id} ${other.subscription_plan_title || ''}`.trim()}</DetailRow>
      ) : null}
      {other.subscription_id ? <DetailRow label={t('实例')} mono>{`#${other.subscription_id}`}</DetailRow> : null}
      {other.subscription_pre_consumed != null ? <DetailRow label={t('预扣费')} mono>{money.format(other.subscription_pre_consumed)}</DetailRow> : null}
      {other.subscription_post_delta ? <DetailRow label={t('结算差额')} mono>{money.format(other.subscription_post_delta)}</DetailRow> : null}
      {other.subscription_consumed != null ? <DetailRow label={t('最终消耗')} mono>{money.format(other.subscription_consumed)}</DetailRow> : null}
      {other.subscription_remain != null ? <DetailRow label={t('剩余')} mono>{`${money.format(other.subscription_remain)}${total}`}</DetailRow> : null}
    </DetailSection>
  )
}

/** Channel parameter overrides applied to the request, one line each. */
function OverrideSection(props: { other: LogOther }) {
  const { t } = useI18n()
  const lines = (props.other.po ?? []).filter(Boolean)
  if (lines.length === 0) return null
  return (
    <DetailSection title={t('参数覆盖（{count}）', { count: lines.length })} icon={<Settings2 className='size-3.5' aria-hidden='true' />}>
      <ul className='flex flex-col gap-1.5 py-1.5'>
        {lines.map((line, index) => {
          const parsed = parseOverrideLine(line)
          return (
            <li key={`${index}-${line}`} className='flex min-w-0 flex-col gap-1 sm:flex-row sm:items-start sm:gap-2'>
              <Tag>{overrideActionLabel(parsed.action)}</Tag>
              <span className='font-geist min-w-0 text-[12px] leading-relaxed break-all'>{parsed.content}</span>
            </li>
          )
        })}
      </ul>
    </DetailSection>
  )
}
