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
import { createContext, useContext, useMemo, useState } from 'react'

import { AffinityDialog } from './affinity-dialog'
import { MASK } from './log-format'
import type { ChannelAffinity } from './log-types'
import { UserInfoDialog } from './user-info-dialog'

type LogsView = {
  /** Sensitive values are hidden. */
  masked: boolean
  /** Viewing everyone's logs with the admin-only columns and details. */
  admin: boolean
  /** Root also sees the diagnostics reserved for root. */
  root: boolean
  showUser: (id: number) => void
  showAffinity: (target: ChannelAffinity) => void
}

const LogsViewContext = createContext<LogsView>({
  masked: false,
  admin: false,
  root: false,
  showUser: () => {},
  showAffinity: () => {},
})

/** Shares the view settings with every cell and opens the admin's user and cache dialogs. */
export function LogsViewProvider(props: { masked: boolean; admin: boolean; root: boolean; children: React.ReactNode }) {
  const [userId, setUserId] = useState<number | null>(null)
  const [affinity, setAffinity] = useState<ChannelAffinity | null>(null)
  const value = useMemo<LogsView>(
    () => ({ masked: props.masked, admin: props.admin, root: props.root, showUser: setUserId, showAffinity: setAffinity }),
    [props.masked, props.admin, props.root]
  )
  return (
    <LogsViewContext.Provider value={value}>
      {props.children}
      {userId !== null ? <UserInfoDialog userId={userId} onClose={() => setUserId(null)} /> : null}
      {affinity ? <AffinityDialog target={affinity} onClose={() => setAffinity(null)} /> : null}
    </LogsViewContext.Provider>
  )
}

export function useLogsView(): LogsView {
  return useContext(LogsViewContext)
}

/** The value, or dots while sensitive values are hidden. */
export function useMask(): (value: string) => string {
  const view = useLogsView()
  return (value: string) => (view.masked ? MASK : value)
}
