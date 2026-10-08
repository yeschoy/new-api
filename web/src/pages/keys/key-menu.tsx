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
import { ArrowRightLeft, Copy, ExternalLink, Link2 } from 'lucide-react'
import { useMemo, useState } from 'react'

import { toast } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { errorMessage } from '@/lib/api'
import { useBrand, useStatus } from '@/lib/queries'

import { CcSwitchDialog } from './cc-switch-dialog'
import { connectionInfo, openChatLink, parseChatPresets, resolveChatUrl, sendToFluent, type ChatPreset } from './chat-links'
import { RowMenu, type MenuEntry } from './row-menu'
import type { FullKey } from './use-full-key'

/** The site's address for clients (no trailing slash) and the admin's "use in app" presets. */
export function useKeyLinks() {
  const { data: status } = useStatus()
  const chats = (status as { chats?: unknown } | undefined)?.chats
  const presets = useMemo(() => parseChatPresets(chats), [chats])
  const address = (status?.server_address || window.location.origin).replace(/\/+$/, '')
  return { address, presets }
}

/** "More" for one key: copy it or its connection info, import it into CC Switch, open it in an app. */
export function KeyMenu(props: { full: FullKey }) {
  const { t } = useI18n()
  const brand = useBrand()
  const links = useKeyLinks()
  const [ccKey, setCcKey] = useState<string | null>(null)

  /** Runs `use` with the full key; failures (fetching, copying) become a toast. */
  async function withKey(use: (key: string) => Promise<void> | void) {
    try {
      await use(await props.full.load())
    } catch (err) {
      toast.error(errorMessage(err, t('操作失败')))
    }
  }

  function openPreset(preset: ChatPreset, key: string) {
    if (preset.type === 'fluent') {
      if (sendToFluent(key, links.address)) toast.success(t('已将密钥发送到流畅阅读。'))
      else toast.error(t('未检测到流畅阅读扩展，请确认已安装并启用。'))
      return
    }
    openChatLink(resolveChatUrl({ template: preset.url, apiKey: key, address: links.address, siteName: brand.name }), preset.type)
  }

  const entries: MenuEntry[] = [
    {
      kind: 'item',
      label: t('复制密钥'),
      icon: Copy,
      onSelect: () =>
        withKey(async (key) => {
          await navigator.clipboard.writeText(key)
          toast.success(t('已复制'))
        }),
    },
    {
      kind: 'item',
      label: t('复制连接信息'),
      icon: Link2,
      onSelect: () =>
        withKey(async (key) => {
          await navigator.clipboard.writeText(connectionInfo(key, links.address))
          toast.success(t('连接信息已复制'))
        }),
    },
    { kind: 'item', label: t('填入 CC Switch'), icon: ArrowRightLeft, onSelect: () => withKey(setCcKey) },
  ]
  if (links.presets.length) {
    entries.push({ kind: 'section', label: t('在应用中使用') })
    for (const preset of links.presets) {
      entries.push({
        kind: 'item',
        label: preset.name,
        icon: preset.type === 'web' ? ExternalLink : undefined,
        onSelect: () => withKey((key) => openPreset(preset, key)),
      })
    }
  }

  return (
    <>
      <RowMenu label={t('更多操作')} entries={entries} />
      {ccKey ? <CcSwitchDialog apiKey={ccKey} address={links.address} onClose={() => setCcKey(null)} /> : null}
    </>
  )
}
