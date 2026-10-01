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
import {
  Activity,
  Boxes,
  Cable,
  ChartColumn,
  Image,
  Info,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  MessageSquare,
  Puzzle,
  Repeat,
  Settings,
  ShieldCheck,
  Split,
  Ticket,
  UserRound,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

import { tk } from '@/i18n/i18n'
import { consoleModuleOn } from '@/lib/console-modules'

export type ConsoleSection =
  | 'dashboard'
  | 'keys'
  | 'chat'
  | 'activity'
  | 'tasks'
  | 'drawing'
  | 'usage'
  | 'flow'
  | 'credits'
  | 'profile'
  | 'security'
  | 'channels'
  | 'models'
  | 'users'
  | 'redemptions'
  | 'subscriptions'
  | 'settings'
  | 'system-info'
  | 'task-plugins'

/** Roles from the backend: admins manage channels, users and codes; only root changes system settings. */
export const ROLE_ADMIN = 10
export const ROLE_ROOT = 100

export type ConsoleNavItem = {
  id: ConsoleSection
  label: string
  to: string
  icon: LucideIcon
  /** The console switch (status.SidebarModulesAdmin) that hides this page, as [section, module]. */
  module?: [string, string]
  /** Lowest role that may open it. */
  role?: number
  /** Analytics need the data export the dashboards are built from. */
  dataExport?: boolean
}

export type ConsoleNavGroup = { title?: string; items: ConsoleNavItem[] }

/** Every console page, grouped as in the old console. */
export const CONSOLE_NAV: ConsoleNavGroup[] = [
  { items: [{ id: 'dashboard', label: tk('概览'), to: '/dashboard', icon: LayoutDashboard, module: ['console', 'detail'] }] },
  {
    title: tk('开发'),
    items: [
      { id: 'keys', label: tk('API 密钥'), to: '/settings/keys', icon: KeyRound, module: ['console', 'token'] },
      { id: 'chat', label: tk('对话'), to: '/chat', icon: MessageSquare, module: ['chat', 'playground'] },
      { id: 'activity', label: tk('使用记录'), to: '/activity', icon: Activity, module: ['console', 'log'] },
      { id: 'tasks', label: tk('任务记录'), to: '/activity/tasks', icon: ListChecks, module: ['console', 'task'] },
      { id: 'drawing', label: tk('绘图记录'), to: '/activity/drawing', icon: Image, module: ['console', 'midjourney'] },
    ],
  },
  {
    title: tk('分析'),
    items: [
      { id: 'usage', label: tk('用量与费用'), to: '/dashboard/usage', icon: ChartColumn, module: ['console', 'detail'], dataExport: true },
      { id: 'flow', label: tk('分流'), to: '/dashboard/flow', icon: Split, module: ['console', 'detail'], dataExport: true },
    ],
  },
  {
    title: tk('账户'),
    items: [
      { id: 'credits', label: tk('钱包'), to: '/settings/credits', icon: Wallet, module: ['personal', 'topup'] },
      { id: 'profile', label: tk('账户设置'), to: '/settings/profile', icon: UserRound, module: ['personal', 'personal'] },
      { id: 'security', label: tk('账户安全'), to: '/settings/security', icon: ShieldCheck, module: ['personal', 'security'] },
    ],
  },
  {
    title: tk('管理'),
    items: [
      { id: 'channels', label: tk('渠道'), to: '/admin/channels', icon: Cable, module: ['admin', 'channel'], role: ROLE_ADMIN },
      { id: 'models', label: tk('模型'), to: '/admin/models', icon: Boxes, module: ['admin', 'models'], role: ROLE_ADMIN },
      { id: 'users', label: tk('用户'), to: '/admin/users', icon: Users, module: ['admin', 'user'], role: ROLE_ADMIN },
      { id: 'redemptions', label: tk('兑换码'), to: '/admin/redemption-codes', icon: Ticket, module: ['admin', 'redemption'], role: ROLE_ADMIN },
      { id: 'subscriptions', label: tk('订阅'), to: '/admin/subscriptions', icon: Repeat, module: ['admin', 'subscription'], role: ROLE_ADMIN },
      { id: 'settings', label: tk('系统设置'), to: '/admin/settings', icon: Settings, module: ['admin', 'setting'], role: ROLE_ROOT },
      { id: 'system-info', label: tk('系统信息'), to: '/admin/system-info', icon: Info, role: ROLE_ROOT },
      { id: 'task-plugins', label: tk('任务插件'), to: '/admin/task-plugins', icon: Puzzle, role: ROLE_ROOT },
    ],
  },
]

export type ConsoleNavContext = {
  /** status.SidebarModulesAdmin */
  adminModules?: string
  /** The user's own sidebar_modules */
  userModules?: string
  role: number
  dataExport: boolean
}

/** The pages this visitor may open, in menu order; groups left empty are dropped. */
export function visibleConsoleNav(context: ConsoleNavContext): ConsoleNavGroup[] {
  const shown = (item: ConsoleNavItem) => {
    if (item.role && context.role < item.role) return false
    if (item.dataExport && !context.dataExport) return false
    if (!item.module) return true
    return consoleModuleOn(context.adminModules, context.userModules, item.module[0], item.module[1])
  }
  return CONSOLE_NAV.map((group) => ({ ...group, items: group.items.filter(shown) })).filter((group) => group.items.length > 0)
}
