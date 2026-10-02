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

/** English for the usage, task and drawing log pages (src/pages/logs, src/pages/console/activity-*). */
const EN_LOGS: Record<string, string> = {
  // Log types
  '充值|日志类型': 'Top-up',
  消耗: 'Usage',
  '管理|日志类型': 'Admin action',
  系统: 'System',
  错误: 'Error',
  退款: 'Refund',
  '登录|日志类型': 'Sign-in',
  所有类型: 'All types',

  // Audit and sign-in operations
  '登录成功（通过 {method}）': 'Signed in with {method}',
  '创建用户 {username}（角色 {role}）': 'Created user {username} (role {role})',
  '更新用户 {username}（ID: {id}）': 'Updated user {username} (ID: {id})',
  '删除用户 {username}（ID: {id}）': 'Deleted user {username} (ID: {id})',
  '对用户 {username}（ID: {id}）执行 {action}': 'Performed {action} on user {username} (ID: {id})',
  '增加用户额度 {quota}': 'Increased user quota by {quota}',
  '减少用户额度 {quota}': 'Decreased user quota by {quota}',
  '覆盖用户额度，从 {from} 改为 {to}': 'Changed user quota from {from} to {to}',
  '清除用户 {username} 的 {bindingType} 绑定': 'Cleared the {bindingType} binding of user {username}',
  强制关闭了用户的两步验证: 'Turned off two-step verification for the user',
  '注册了一个 Passkey': 'Registered a passkey',
  '解绑了一个 Passkey': 'Removed a passkey',
  为用户完成补单: 'Completed a top-up order for the user',
  重置了用户的通行密钥: 'Reset the user’s passkey',
  '解除了用户的一个 OAuth 绑定': 'Removed an OAuth binding of the user',
  '修改系统设置 {key}': 'Changed system setting {key}',
  确认支付合规: 'Confirmed payment compliance',
  重置模型倍率: 'Reset model ratios',
  清除渠道亲和缓存: 'Cleared the channel affinity cache',
  '创建了一个自定义 OAuth 提供方': 'Created a custom OAuth provider',
  '更新了一个自定义 OAuth 提供方': 'Updated a custom OAuth provider',
  '删除了一个自定义 OAuth 提供方': 'Deleted a custom OAuth provider',
  清除磁盘缓存: 'Cleared the disk cache',
  触发垃圾回收: 'Ran garbage collection',
  清理日志文件: 'Cleaned up log files',
  '创建渠道 {name}（类型 {type}，数量 {count}）': 'Created channel {name} (type {type}, count {count})',
  '更新渠道 {name}（ID: {id}）': 'Updated channel {name} (ID: {id})',
  '删除渠道 {name}（ID: {id}）': 'Deleted channel {name} (ID: {id})',
  '批量删除 {count} 个渠道': 'Deleted {count} channels',
  '删除全部禁用渠道（{count}）': 'Deleted all disabled channels ({count})',
  '查看渠道密钥 {name}（ID: {id}）': 'Viewed the key of channel {name} (ID: {id})',
  '禁用标签为 {tag} 的渠道': 'Disabled channels tagged {tag}',
  '启用标签为 {tag} 的渠道': 'Enabled channels tagged {tag}',
  '编辑标签为 {tag} 的渠道': 'Edited channels tagged {tag}',
  '批量为 {count} 个渠道设置标签': 'Set the tag of {count} channels',
  '复制渠道（源 ID: {sourceId}）为 {name}（新 ID: {id}）': 'Copied channel (source ID: {sourceId}) to {name} (new ID: {id})',
  '对渠道（ID: {id}）执行多密钥管理操作 {action}': 'Ran multi-key action {action} on channel (ID: {id})',
  '对渠道（ID: {id}）应用上游模型变更': 'Applied upstream model changes to channel (ID: {id})',
  '对 {count} 个渠道应用上游模型变更': 'Applied upstream model changes to {count} channels',
  '创建 {count} 个兑换码 {name}（每个 {quota}）': 'Created {count} redemption codes named {name} ({quota} each)',
  更新了一个兑换码: 'Updated a redemption code',
  删除了一个兑换码: 'Deleted a redemption code',
  删除无效兑换码: 'Deleted invalid redemption codes',
  创建了一个预填组: 'Created a prefill group',
  更新了一个预填组: 'Updated a prefill group',
  删除了一个预填组: 'Deleted a prefill group',
  创建了一个供应商: 'Created a vendor',
  更新了一个供应商: 'Updated a vendor',
  删除了一个供应商: 'Deleted a vendor',
  创建了一个模型: 'Created a model',
  更新了一个模型: 'Updated a model',
  删除了一个模型: 'Deleted a model',
  同步上游模型: 'Synced upstream models',
  创建了一个部署: 'Created a deployment',
  更新了一个部署: 'Updated a deployment',
  删除了一个部署: 'Deleted a deployment',
  创建了一个订阅计划: 'Created a subscription plan',
  更新了一个订阅计划: 'Updated a subscription plan',
  绑定了一个订阅: 'Bound a subscription',
  '重置套餐 {plan_id} 的有效订阅': 'Reset active subscriptions of plan {plan_id}',
  '重置用户 {target_user_id} 的套餐 {plan_id} 订阅': 'Reset plan {plan_id} subscriptions of user {target_user_id}',
  清理历史日志: 'Cleared old logs',
  '日志清理任务已启动。': 'Log cleanup started.',
  '{method} {route}': '{method} {route}',

  // Channel fields and parameter overrides
  类型: 'Type',
  接口地址: 'Base URL',
  设置: 'Set',
  移动: 'Move',
  追加: 'Append',
  前置追加: 'Prepend',
  裁剪前缀: 'Trim prefix',
  裁剪后缀: 'Trim suffix',
  确保前缀: 'Ensure prefix',
  确保后缀: 'Ensure suffix',
  去掉空白: 'Trim spaces',
  转小写: 'To lower case',
  转大写: 'To upper case',
  替换: 'Replace',
  正则替换: 'Regex replace',
  设置请求头: 'Set header',
  删除请求头: 'Delete header',
  复制请求头: 'Copy header',
  移动请求头: 'Move header',
  透传请求头: 'Pass headers',
  字段同步: 'Sync fields',
  返回错误: 'Return error',

  // Billing
  输入: 'Input',
  输出: 'Output',
  缓存读取: 'Cache read',
  缓存写入: 'Cache write',
  '缓存写入 (5m)': 'Cache write (5m)',
  '缓存写入 (1h)': 'Cache write (1h)',
  图像输入: 'Image input',
  图像输出: 'Image output',
  音频输入: 'Audio input',
  音频输出: 'Audio output',
  本地计费: 'Counted locally',
  上游返回: 'Reported upstream',
  '上游返回（{source}）': 'Reported upstream ({source})',

  // Loading
  获取统计数据失败: 'Could not load the statistics',
  获取任务记录失败: 'Could not load task logs',
  获取绘图记录失败: 'Could not load image logs',
  获取用户信息失败: 'Could not load the user',
}

export default EN_LOGS
