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
import { Modal, Tag } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { cn } from '@/lib/format'

import { AdminSections, LoginSection, ManageSections, RefundSection, ViolationSection } from './log-detail-admin'
import { BillingSection, DynamicSection, TokenSection } from './log-detail-billing'
import { ExtraSections } from './log-detail-extra'
import { LOG_TYPE, TONE_TEXT, firstTokenTone, isTimingType, logTypeOf, responseTone, secondsLabel } from './log-format'
import type { LogEntry, LogOther } from './log-types'
import { useLogsView, useMask } from './logs-context'
import { DetailRow, TextBlock } from './logs-ui'

/** Who, where and how long: the ids and route of one log. */
function Overview(props: { log: LogEntry; other: LogOther | null }) {
  const { t } = useI18n()
  const view = useLogsView()
  const mask = useMask()
  const log = props.log
  const timing = isTimingType(log.type)
  const chain = (props.other?.admin_info?.use_channel ?? []).map(String).filter(Boolean)
  const group = log.group || props.other?.group || ''
  const showIp = !!log.ip && (timing || (view.admin && log.type === LOG_TYPE.TOPUP))
  const firstToken = log.is_stream && props.other?.frt && props.other.frt > 0 ? props.other.frt / 1000 : null

  return (
    <div>
      {log.request_id ? <DetailRow label={t('请求 ID')} mono>{log.request_id}</DetailRow> : null}
      {log.upstream_request_id ? <DetailRow label={t('上游请求 ID')} mono>{log.upstream_request_id}</DetailRow> : null}
      {view.admin && log.channel > 0 ? (
        <DetailRow label={t('渠道|表头')} mono>
          {log.channel}
          {log.channel_name ? <span className='text-or-muted'> ({mask(log.channel_name)})</span> : null}
        </DetailRow>
      ) : null}
      {view.admin && chain.length > 0 ? <DetailRow label={t('重试链路')} mono>{chain.join(' → ')}</DetailRow> : null}
      {log.token_name ? <DetailRow label={t('密钥')} mono>{mask(log.token_name)}</DetailRow> : null}
      {group ? <DetailRow label={t('分组')} mono>{mask(group)}</DetailRow> : null}
      {showIp ? <DetailRow label={t('IP 地址')} mono>{log.ip}</DetailRow> : null}
      {timing && log.use_time > 0 ? (
        <DetailRow label={t('响应时间')}>
          <span className={cn('font-medium', TONE_TEXT[responseTone(log.use_time, log.completion_tokens)])}>
            {secondsLabel(log.use_time)}
          </span>
          {firstToken !== null ? (
            <span className={TONE_TEXT[firstTokenTone(firstToken)]}>{` (${t('首字')} ${secondsLabel(firstToken)})`}</span>
          ) : null}
        </DetailRow>
      ) : null}
    </div>
  )
}

/** Everything recorded about one log row, section by section. */
export function LogDetailDialog(props: { log: LogEntry; other: LogOther | null; onClose: () => void }) {
  const { t } = useI18n()
  const type = logTypeOf(props.log.type)
  const consume = props.log.type === LOG_TYPE.CONSUME

  return (
    <Modal
      size='lg'
      onClose={props.onClose}
      title={
        <span className='flex items-center gap-2'>
          {t('日志详情')}
          <Tag tone={type.tone}>{t(type.label)}</Tag>
        </span>
      }
    >
      <div className='flex min-w-0 flex-col gap-4'>
        <Overview log={props.log} other={props.other} />
        <AdminSections log={props.log} other={props.other} />
        <ViolationSection log={props.log} other={props.other} />
        <RefundSection log={props.log} other={props.other} />
        <ManageSections log={props.log} other={props.other} />
        <LoginSection log={props.log} other={props.other} />
        <ExtraSections log={props.log} other={props.other} />
        <TokenSection log={props.log} other={props.other} />
        {consume ? <BillingSection log={props.log} other={props.other} /> : null}
        {consume ? <DynamicSection other={props.other} /> : null}
        {props.log.content ? <TextBlock title={t('内容')} text={props.log.content} /> : null}
      </div>
    </Modal>
  )
}
