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

/** English for the API keys page (src/pages/console/key*.tsx, src/pages/keys/). */
const EN_KEYS: Record<string, string> = {
  搜索密钥失败: 'Could not search keys',
  '仍有密钥未删除，请重试': 'Some keys were not deleted. Please try again.',
  分组加载失败: 'Could not load groups',
  模型列表加载失败: 'Could not load models',
  请输入有效的剩余额度: 'Enter a valid remaining credit',
  '请至少选择一个自动分组，或恢复全局顺序': 'Choose at least one auto group, or go back to the global order',
  '最多选择 {max} 个自动分组': 'Choose at most {max} auto groups',
  '数量需为 1 到 100 之间的整数': 'Quantity must be a whole number from 1 to 100',
  刚刚: 'Just now',
  '已用 {amount}': '{amount} used',
  按顺序自动选择可用的分组: 'Picks a usable group automatically, in order',
  自动分组: 'Auto group',
  跨分组重试: 'Cross-group retry',
  '{count} 个模型': 'Models: {count}',
  '{count} 个 IP': 'IPs: {count}',
  永不过期: 'Never expires',
  '最近使用 {time}': 'Last used {time}',
  久未使用: 'Unused for a while',
  '三网加速 URL': 'Mainland China acceleration URL',
  '全球加速 URL': 'Global acceleration URL',
  '复制{label}': 'Copy {label}',
  全部状态: 'All statuses',
  已启用: 'Enabled',
  搜索名称: 'Search names',
  搜索密钥: 'Search keys',
  每页条数: 'Rows per page',
  '{size} 条/页': '{size} / page',
  到期: 'Expires',
  '当前页没有该状态的密钥。': 'No keys with this status on this page.',
  没有匹配的密钥: 'No matching keys',
  '按完整名称或完整密钥匹配，可用 % 模糊匹配，例如 %prod%。': 'Matches the full name or the full key. Use % as a wildcard, e.g. %prod%.',
  密钥已删除: 'Key deleted',
  密钥已禁用: 'Key disabled',
  密钥已启用: 'Key enabled',
  更多操作: 'More actions',
  复制连接信息: 'Copy connection info',
  连接信息已复制: 'Connection info copied',
  '填入 CC Switch': 'Import to CC Switch',
  在应用中使用: 'Use in an app',
  '已将密钥发送到流畅阅读。': 'Sent the key to FluentRead.',
  '未检测到流畅阅读扩展，请确认已安装并启用。': 'FluentRead extension not found. Make sure it is installed and enabled.',
  主模型: 'Primary model',
  'Haiku 模型': 'Haiku model',
  'Sonnet 模型': 'Sonnet model',
  'Opus 模型': 'Opus model',
  请选择主模型: 'Choose a primary model',
  '打开 CC Switch': 'Open CC Switch',
  应用: 'App',
  选择或输入模型名称: 'Choose or type a model name',
}

export default EN_KEYS
