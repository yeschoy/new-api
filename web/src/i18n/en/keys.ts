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
}

export default EN_KEYS
