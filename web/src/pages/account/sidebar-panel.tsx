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
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { Button, Panel, Switch, toast } from '@/components/ui'
import { tk, useI18n } from '@/i18n/i18n'
import { errorMessage } from '@/lib/api'
import { authStore } from '@/lib/auth-store'
import { consoleModuleOn } from '@/lib/console-modules'
import { useStatus } from '@/lib/queries'

import type { AccountUser } from './account-api'
import { saveSidebarModules } from './profile-api'

type Config = Record<string, Record<string, boolean>>

/** The console menu pages a user may hide for themselves, by the switches of status.SidebarModulesAdmin. */
const SECTIONS: Array<{ id: string; label: string; modules: Array<{ id: string; label: string }> }> = [
  { id: 'chat', label: tk('对话'), modules: [{ id: 'playground', label: tk('对话') }] },
  {
    id: 'console',
    label: tk('控制台'),
    modules: [
      { id: 'detail', label: tk('概览与分析') },
      { id: 'token', label: tk('API 密钥') },
      { id: 'log', label: tk('使用记录') },
      { id: 'task', label: tk('任务记录') },
      { id: 'midjourney', label: tk('绘图记录') },
    ],
  },
  {
    id: 'personal',
    label: tk('账户'),
    modules: [
      { id: 'topup', label: tk('钱包') },
      { id: 'personal', label: tk('账户设置') },
      { id: 'security', label: tk('账户安全') },
    ],
  },
]

function defaults(): Config {
  const config: Config = {}
  for (const section of SECTIONS) {
    config[section.id] = { enabled: true }
    for (const module of section.modules) config[section.id][module.id] = true
  }
  return config
}

function readConfig(raw: string | undefined): Config {
  const config = defaults()
  try {
    const saved = raw ? (JSON.parse(raw) as Config) : {}
    for (const section of SECTIONS) Object.assign(config[section.id], saved[section.id] ?? {})
  } catch {
    // An unreadable choice shows everything, as when nothing was saved.
  }
  return config
}

/** Which console pages show in this user's menu; pages the administrator hid never show. */
export function SidebarPanel(props: { user: AccountUser }) {
  const { t } = useI18n()
  const { data: status } = useStatus()
  const queryClient = useQueryClient()
  const [config, setConfig] = useState(() => readConfig(props.user.sidebar_modules))
  const [busy, setBusy] = useState(false)
  const adminRaw = status?.SidebarModulesAdmin
  const sections = SECTIONS.map((section) => ({
    ...section,
    modules: section.modules.filter((module) => consoleModuleOn(adminRaw, undefined, section.id, module.id)),
  })).filter((section) => section.modules.length > 0)

  const set = (section: string, key: string, value: boolean) =>
    setConfig((previous) => ({ ...previous, [section]: { ...previous[section], [key]: value } }))

  async function onSave() {
    setBusy(true)
    const json = JSON.stringify(config)
    try {
      await saveSidebarModules(json)
      authStore.updateUser({ ...props.user, sidebar_modules: json })
      toast.success(t('菜单已保存'))
      await queryClient.invalidateQueries({ queryKey: ['console'] })
    } catch (err) {
      toast.error(errorMessage(err, t('保存失败')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel title={t('菜单显示')}>
      <div className='flex flex-col gap-5'>
        <p className='text-or-muted text-[14px]'>{t('选择左侧菜单显示哪些页面；管理员关闭的页面不会出现。')}</p>
        {sections.map((section) => {
          const on = config[section.id]?.enabled !== false
          return (
            <div key={section.id} className='border-or-line rounded-[8px] border p-4'>
              <div className='flex items-center justify-between gap-3'>
                <span className='text-[14px] font-medium'>{t(section.label)}</span>
                <Switch checked={on} onChange={(value) => set(section.id, 'enabled', value)} label={t('整组显示：{section}', { section: t(section.label) })} hideLabel />
              </div>
              <div className='mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3'>
                {section.modules.map((module) => (
                  <Switch
                    key={module.id}
                    checked={config[section.id]?.[module.id] !== false}
                    onChange={(value) => set(section.id, module.id, value)}
                    label={t(module.label)}
                    disabled={!on}
                  />
                ))}
              </div>
            </div>
          )
        })}
        <div className='flex justify-end gap-2'>
          <Button onClick={() => setConfig(defaults())}>{t('恢复默认')}</Button>
          <Button variant='primary' busy={busy} onClick={onSave}>
            {t('保存菜单')}
          </Button>
        </div>
      </div>
    </Panel>
  )
}
