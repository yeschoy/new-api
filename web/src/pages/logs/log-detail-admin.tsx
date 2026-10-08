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
import { AlertTriangle, LogIn, ShieldCheck } from 'lucide-react'

import { useI18n } from '@/i18n/i18n'
import { useMoney } from '@/pages/console/console-hooks'

import { auditContent, changedFieldsText } from './log-audit'
import { LOG_TYPE, isViolationFee } from './log-format'
import type { LogEntry, LogOther } from './log-types'
import { useLogsView } from './logs-context'
import { CopyButton, DetailRow, DetailSection } from './logs-ui'
import { PluginAuthor } from './plugin-author'

type SectionProps = { log: LogEntry; other: LogOther | null }

const warn = <AlertTriangle className='size-3.5' aria-hidden='true' />

/** Request conversion, quota clamps, rejections, plugins, root diagnostics and top-up audits (admins). */
export function AdminSections(props: SectionProps) {
  const { t } = useI18n()
  const view = useLogsView()
  const other = props.other
  if (!view.admin || !other) return null
  const admin = other.admin_info
  const conversion = (other.request_conversion ?? []).filter(Boolean)
  const format = conversion.length <= 1 ? t('原生格式') : conversion.join(' -> ')
  const clamp = admin?.quota_saturation
  const plugin = admin?.task_plugin
  const root = view.root ? other.root_info : undefined
  const kinds = { overflow: t('上溢'), underflow: t('下溢'), nan: t('无效 (NaN)') }

  return (
    <>
      {props.log.type !== LOG_TYPE.REFUND && (other.request_path || conversion.length > 0) ? (
        <DetailSection title={t('请求转换')}>
          {other.request_path ? <DetailRow label={t('路径')} mono>{other.request_path}</DetailRow> : null}
          <DetailRow label={t('格式')}>
            <span className='inline-flex items-center gap-1'>
              {format}
              <CopyButton text={format} />
            </span>
          </DetailRow>
        </DetailSection>
      ) : null}
      {clamp ? (
        <DetailSection title={t('额度已钳制')} icon={warn} danger>
          <p className='py-1 text-[13px]'>{t('额度饱和保护已触发')}</p>
          <DetailRow label={t('类型')}>{kinds[clamp.kind] ?? clamp.kind}</DetailRow>
          <DetailRow label={t('原始值')} mono>{String(clamp.original)}</DetailRow>
          <DetailRow label={t('钳制为')} mono>{String(clamp.clamped)}</DetailRow>
          <DetailRow label={t('操作|审计')} mono>{clamp.op}</DetailRow>
        </DetailSection>
      ) : null}
      {other.reject_reason ? (
        <DetailSection title={t('拒绝原因')} icon={warn} danger>
          <p className='py-1 text-[13px] break-words'>{other.reject_reason}</p>
        </DetailSection>
      ) : null}
      {plugin ? (
        <DetailSection title={t('任务插件|详情')}>
          <DetailRow label={t('插件标识')} mono>{plugin.key}</DetailRow>
          <DetailRow label={t('名称')}>{plugin.name}</DetailRow>
          {plugin.version ? <DetailRow label={t('版本')} mono>{plugin.version}</DetailRow> : null}
          {plugin.author ? <DetailRow label={t('插件作者')}><PluginAuthor author={plugin.author} showUrl /></DetailRow> : null}
        </DetailSection>
      ) : null}
      {root ? (
        <DetailSection title={t('Root 诊断')}>
          {root.task_plugin ? <DetailRow label={t('接口版本')} mono>{String(root.task_plugin.api_version)}</DetailRow> : null}
          {root.task_plugin ? <DetailRow label={t('插件代次')} mono>{String(root.task_plugin.generation)}</DetailRow> : null}
          {root.upstream_task_id ? <DetailRow label={t('上游任务 ID')} mono>{root.upstream_task_id}</DetailRow> : null}
          {root.node_name ? <DetailRow label={t('节点名称')} mono>{root.node_name}</DetailRow> : null}
        </DetailSection>
      ) : null}
      {props.log.type === LOG_TYPE.TOPUP ? <TopupAudit other={other} /> : null}
    </>
  )
}

/** Where a top-up came from; older records predate this audit trail. */
function TopupAudit(props: { other: LogOther }) {
  const { t } = useI18n()
  const admin = props.other.admin_info
  const fields: Array<[string, string | undefined]> = [
    [t('订单支付方式'), admin?.payment_method],
    [t('回调支付方式'), admin?.callback_payment_method],
    [t('回调来源 IP'), admin?.caller_ip],
    [t('服务器 IP'), admin?.server_ip],
    [t('节点名称'), admin?.node_name],
    [t('系统版本'), admin?.version],
  ]
  return (
    <DetailSection title={t('充值审计信息')} icon={<ShieldCheck className='size-3.5' aria-hidden='true' />}>
      {fields.map(([label, value]) => (value ? <DetailRow key={label} label={label} mono>{value}</DetailRow> : null))}
      {admin ? null : (
        <p className='py-1 text-[13px] text-amber-700 dark:text-amber-300'>
          {t('这条记录早于充值审计功能，无法补齐；之后的充值会记录服务器 IP、回调 IP、支付方式与系统版本。')}
        </p>
      )}
    </DetailSection>
  )
}

/** Violation fee details: code, marker and the amount charged. */
export function ViolationSection(props: SectionProps) {
  const { t } = useI18n()
  const money = useMoney()
  const other = props.other
  if (!other || !isViolationFee(other)) return null
  return (
    <DetailSection title={t('违规扣费')} icon={warn} danger>
      {other.violation_fee_code ? <DetailRow label={t('违规代码')} mono>{other.violation_fee_code}</DetailRow> : null}
      {other.violation_fee_marker ? <DetailRow label={t('违规标记')}>{other.violation_fee_marker}</DetailRow> : null}
      <DetailRow label={t('扣费金额')} mono>{money.format(other.fee_quota ?? props.log.quota)}</DetailRow>
    </DetailSection>
  )
}

/** The task a refund belongs to and why it was refunded. */
export function RefundSection(props: SectionProps) {
  const { t } = useI18n()
  const other = props.other
  if (props.log.type !== LOG_TYPE.REFUND || !other || (!other.task_id && !other.reason)) return null
  return (
    <DetailSection title={t('退款详情')}>
      {other.task_id ? <DetailRow label={t('任务 ID')} mono>{other.task_id}</DetailRow> : null}
      {other.reason ? <DetailRow label={t('原因')}>{other.reason}</DetailRow> : null}
    </DetailSection>
  )
}

/** Admin actions: who did it, how they were signed in, what changed and how it ended. */
export function ManageSections(props: SectionProps) {
  const { t } = useI18n()
  const view = useLogsView()
  const other = props.other
  if (props.log.type !== LOG_TYPE.MANAGE || !view.admin || !other) return null
  const admin = other.admin_info
  const operation = auditContent(other)
  const route = other.audit_info
  const changed = changedFieldsText(other)
  const name = admin?.admin_username ? String(admin.admin_username).trim() : ''
  const id = admin?.admin_id !== undefined && admin.admin_id !== null ? String(admin.admin_id).trim() : ''
  let operator = name || (id ? `ID: ${id}` : '')
  if (name && id) operator = `${name} (ID: ${id})`
  let auth = admin?.auth_method ?? ''
  if (auth === 'access_token') auth = t('访问令牌')
  if (auth === 'session') auth = t('会话')

  return (
    <>
      {operator ? (
        <div>
          <DetailRow label={t('操作管理员')} mono>{operator}</DetailRow>
        </div>
      ) : null}
      {operation || route ? (
        <DetailSection title={t('操作审计信息')} icon={<ShieldCheck className='size-3.5' aria-hidden='true' />}>
          {operation ? <DetailRow label={t('操作|审计')}>{operation}</DetailRow> : null}
          {auth ? <DetailRow label={t('认证方式')}>{auth}</DetailRow> : null}
          {changed ? <DetailRow label={t('变更字段')}>{changed}</DetailRow> : null}
          {route?.method && route.route ? <DetailRow label={t('请求')} mono>{`${route.method} ${route.route}`}</DetailRow> : null}
          {route?.status !== undefined ? (
            <DetailRow label={t('结果')} mono>{`${route.success ? t('成功|结果') : t('失败')} (${route.status})`}</DetailRow>
          ) : null}
        </DetailSection>
      ) : null}
    </>
  )
}

/** Sign-ins: method, address and browser (visible to the account owner too). */
export function LoginSection(props: SectionProps) {
  const { t } = useI18n()
  if (props.log.type !== LOG_TYPE.LOGIN) return null
  const other = props.other
  const operation = auditContent(other)
  const fields: Array<[string, string | undefined]> = [
    [t('登录方式'), other?.login_method],
    [t('IP 地址'), props.log.ip],
    [t('用户代理'), other?.user_agent],
  ]
  if (!fields.some(([, value]) => value)) return null
  return (
    <DetailSection title={t('登录信息')} icon={<LogIn className='size-3.5' aria-hidden='true' />}>
      {operation ? <DetailRow label={t('操作|审计')}>{operation}</DetailRow> : null}
      {fields.map(([label, value]) => (value ? <DetailRow key={label} label={label} mono>{value}</DetailRow> : null))}
    </DetailSection>
  )
}
