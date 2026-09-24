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
import { Link } from 'react-router'

import { BySkin } from '@/site/site-skin'
import { HubShell } from '@/sites/hub/hub-shell'
import { RouterShell } from '@/sites/router/router-shell'

export function NotFoundPage() {
  return (
    <BySkin
      router={
        <RouterShell>
          <div className='flex flex-col items-center px-6 py-32 text-center'>
            <div className='text-[56px] font-bold tracking-[-1.4px]'>404</div>
            <p className='text-or-muted mt-2 text-[16px]'>页面不存在</p>
            <Link to='/' className='bg-or-lime text-or-bg mt-8 flex h-11 items-center rounded-[6px] px-8 text-[14px] font-medium'>
              返回首页
            </Link>
          </div>
        </RouterShell>
      }
      hub={
        <HubShell solidHeader>
          <div className='flex flex-col items-center px-6 py-32 text-center'>
            <div className='font-serif-display text-[56px] font-bold'>404</div>
            <p className='mt-2 text-[16px] text-[#555]'>页面不存在</p>
            <Link to='/' className='bg-hub-blue mt-8 flex h-12 items-center rounded-[24px] px-6 text-[16px] text-white'>
              返回首页
            </Link>
          </div>
        </HubShell>
      }
    />
  )
}
