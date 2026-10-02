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
import { t, tk } from '@/i18n/i18n'

import type { LogOther } from './log-types'

/**
 * Audit (type 3) and sign-in (type 7) logs store a language-neutral action
 * plus params in `other.op` (controller/audit.go); the text is rendered here
 * in the page language. Unknown actions fall back to the stored content.
 */
const AUDIT_TEMPLATES: Record<string, string> = {
  login: tk('登录成功（通过 {method}）'),
  'user.create': tk('创建用户 {username}（角色 {role}）'),
  'user.update': tk('更新用户 {username}（ID: {id}）'),
  'user.delete': tk('删除用户 {username}（ID: {id}）'),
  'user.manage': tk('对用户 {username}（ID: {id}）执行 {action}'),
  'user.quota_add': tk('增加用户额度 {quota}'),
  'user.quota_subtract': tk('减少用户额度 {quota}'),
  'user.quota_override': tk('覆盖用户额度，从 {from} 改为 {to}'),
  'user.binding_clear': tk('清除用户 {username} 的 {bindingType} 绑定'),
  'user.2fa_disable': tk('强制关闭了用户的两步验证'),
  'user.passkey_register': tk('注册了一个 Passkey'),
  'user.passkey_delete': tk('解绑了一个 Passkey'),
  'user.topup_complete': tk('为用户完成补单'),
  'user.reset_passkey': tk('重置了用户的通行密钥'),
  'user.oauth_unbind': tk('解除了用户的一个 OAuth 绑定'),
  'option.update': tk('修改系统设置 {key}'),
  'option.payment_compliance': tk('确认支付合规'),
  'option.reset_ratio': tk('重置模型倍率'),
  'option.clear_affinity_cache': tk('清除渠道亲和缓存'),
  'custom_oauth.create': tk('创建了一个自定义 OAuth 提供方'),
  'custom_oauth.update': tk('更新了一个自定义 OAuth 提供方'),
  'custom_oauth.delete': tk('删除了一个自定义 OAuth 提供方'),
  'performance.clear_disk_cache': tk('清除磁盘缓存'),
  'performance.gc': tk('触发垃圾回收'),
  'performance.clear_logs': tk('清理日志文件'),
  'channel.create': tk('创建渠道 {name}（类型 {type}，数量 {count}）'),
  'channel.update': tk('更新渠道 {name}（ID: {id}）'),
  'channel.delete': tk('删除渠道 {name}（ID: {id}）'),
  'channel.delete_batch': tk('批量删除 {count} 个渠道'),
  'channel.delete_disabled': tk('删除全部禁用渠道（{count}）'),
  'channel.key_view': tk('查看渠道密钥 {name}（ID: {id}）'),
  'channel.tag_disable': tk('禁用标签为 {tag} 的渠道'),
  'channel.tag_enable': tk('启用标签为 {tag} 的渠道'),
  'channel.tag_edit': tk('编辑标签为 {tag} 的渠道'),
  'channel.tag_batch_set': tk('批量为 {count} 个渠道设置标签'),
  'channel.copy': tk('复制渠道（源 ID: {sourceId}）为 {name}（新 ID: {id}）'),
  'channel.multi_key_manage': tk('对渠道（ID: {id}）执行多密钥管理操作 {action}'),
  'channel.upstream_apply': tk('对渠道（ID: {id}）应用上游模型变更'),
  'channel.upstream_apply_all': tk('对 {count} 个渠道应用上游模型变更'),
  'redemption.create': tk('创建 {count} 个兑换码 {name}（每个 {quota}）'),
  'redemption.update': tk('更新了一个兑换码'),
  'redemption.delete': tk('删除了一个兑换码'),
  'redemption.delete_invalid': tk('删除无效兑换码'),
  'prefill_group.create': tk('创建了一个预填组'),
  'prefill_group.update': tk('更新了一个预填组'),
  'prefill_group.delete': tk('删除了一个预填组'),
  'vendor.create': tk('创建了一个供应商'),
  'vendor.update': tk('更新了一个供应商'),
  'vendor.delete': tk('删除了一个供应商'),
  'model.create': tk('创建了一个模型'),
  'model.update': tk('更新了一个模型'),
  'model.delete': tk('删除了一个模型'),
  'model.sync_upstream': tk('同步上游模型'),
  'deployment.create': tk('创建了一个部署'),
  'deployment.update': tk('更新了一个部署'),
  'deployment.delete': tk('删除了一个部署'),
  'subscription.plan_create': tk('创建了一个订阅计划'),
  'subscription.plan_update': tk('更新了一个订阅计划'),
  'subscription.bind': tk('绑定了一个订阅'),
  'subscription.plan_reset': tk('重置套餐 {plan_id} 的有效订阅'),
  'subscription.user_plan_reset': tk('重置用户 {target_user_id} 的套餐 {plan_id} 订阅'),
  'log.clear': tk('清理历史日志'),
  'log.cleanup_start': tk('日志清理任务已启动。'),
  generic: tk('{method} {route}'),
}

function paramText(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).join(', ')
  if (value === null || value === undefined) return ''
  return String(value)
}

/** The localized operation text of an audit or sign-in log, or null when it has no known action. */
export function auditContent(other: LogOther | null): string | null {
  const action = other?.op?.action
  const template = action ? AUDIT_TEMPLATES[action] : undefined
  if (!template) return null
  const vars: Record<string, string> = {}
  for (const [key, value] of Object.entries(other?.op?.params ?? {})) vars[key] = paramText(value)
  return t(template, vars)
}

/** Channel fields an update changed (stable tokens recorded by the backend). */
const CHANNEL_FIELDS: Record<string, string> = {
  status: tk('状态'),
  models: tk('模型|表头'),
  group: tk('分组'),
  type: tk('类型'),
  base_url: tk('接口地址'),
  key: tk('密钥'),
}

export function changedFieldsText(other: LogOther | null): string {
  const fields = other?.op?.params?.changed_fields
  if (!Array.isArray(fields)) return ''
  return fields.map((field) => (CHANNEL_FIELDS[String(field)] ? t(CHANNEL_FIELDS[String(field)]) : String(field))).join(', ')
}

/** Channel parameter overrides applied to the request, one "action content" line each. */
const OVERRIDE_ACTIONS: Record<string, string> = {
  set: tk('设置'),
  delete: tk('删除'),
  copy: tk('复制'),
  move: tk('移动'),
  append: tk('追加'),
  prepend: tk('前置追加'),
  trim_prefix: tk('裁剪前缀'),
  trim_suffix: tk('裁剪后缀'),
  ensure_prefix: tk('确保前缀'),
  ensure_suffix: tk('确保后缀'),
  trim_space: tk('去掉空白'),
  to_lower: tk('转小写'),
  to_upper: tk('转大写'),
  replace: tk('替换'),
  regex_replace: tk('正则替换'),
  set_header: tk('设置请求头'),
  delete_header: tk('删除请求头'),
  copy_header: tk('复制请求头'),
  move_header: tk('移动请求头'),
  pass_headers: tk('透传请求头'),
  sync_fields: tk('字段同步'),
  return_error: tk('返回错误'),
}

export function overrideActionLabel(action: string): string {
  const label = OVERRIDE_ACTIONS[action.toLowerCase()]
  return label ? t(label) : action
}

export function parseOverrideLine(line: string): { action: string; content: string } {
  const space = line.indexOf(' ')
  if (space <= 0) return { action: line, content: line }
  return { action: line.slice(0, space), content: line.slice(space + 1) }
}
