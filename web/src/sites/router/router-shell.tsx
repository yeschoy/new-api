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
import { RouterFooter } from './router-footer'
import { RouterHeader } from './router-header'

/** Dark design frame: sticky 56px bar, page body, five-column footer. */
export function RouterShell(props: { children: React.ReactNode; footer?: boolean }) {
  return (
    <div className='bg-or-bg text-or-fg flex min-h-screen flex-col'>
      <RouterHeader />
      <main className='flex-1'>{props.children}</main>
      {props.footer === false ? null : <RouterFooter />}
    </div>
  )
}
