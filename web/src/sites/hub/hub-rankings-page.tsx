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
import { HubShell } from './hub-shell'
import { HubRankings } from './home/hub-rankings'

/** The gateway design has no separate rankings page; reuse its home block. */
export function HubRankingsPage() {
  return (
    <HubShell solidHeader>
      <div className='mx-auto max-w-[1232px] px-6 pt-12 xl:px-0'>
        <h1 className='font-serif-display text-[32px] font-bold text-[rgba(0,0,0,0.88)]'>排行榜</h1>
        <p className='mt-2 text-[14px] text-[#626773]'>按本站真实调用量统计的模型 Token 排行。</p>
      </div>
      <div className='-mt-16'>
        <HubRankings />
      </div>
    </HubShell>
  )
}
